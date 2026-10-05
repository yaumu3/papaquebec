//! The aircraft a receiver hears, kept from one message to the next.

use std::collections::btree_map::Entry;
use std::collections::{BTreeMap, VecDeque};

use crate::cpr::{self, Cpr};
use crate::field::{Airspeed, Identification};
use crate::message::{Observation, Report, Trust};
use crate::position::Position;
use crate::proto::{
    Address, AirGroundState, Aircraft, EmergencyPriorityStatus, EmitterCategory, LastPosition,
    Quality, Reception, Snapshot, Source, TargetState,
};

/// readsb lists an aircraft from its second message on: a single one may be
/// noise that passes for a message.
const MESSAGES_TO_BE_LISTED: u64 = 2;
/// The messages whose power the signal of an aircraft is the mean of, as in readsb.
const POWERS_KEPT: usize = 8;

/// A position of each format gives a place when the two are no further apart (DO-260B).
const PAIR_WITHIN_S: f64 = 10.0;
/// How long readsb keeps what is no longer said, and lists an aircraft that is
/// no longer heard. A fix lapses with the rest, long before the aircraft could
/// have flown the 180 NM within which a lone position is placed by it.
const LAPSE_S: f64 = 60.0;
/// A callsign and a category are kept longer: they stay true of the flight
/// while they are not said.
const IDENTIFICATION_LAPSE_S: f64 = 15.0 * 60.0;
/// Further than any receiver hears, so a position beyond is a wrong one; readsb's default.
const MAX_RANGE_NM: f64 = 300.0;

/// Every aircraft heard, by the kind of its address and the address.
pub struct Traffic {
    site: Position,
    aircraft: BTreeMap<(i32, u32), Tracked>,
    messages: u64,
}

impl Traffic {
    /// Nothing heard yet by the receiver at the site.
    #[must_use]
    pub fn new(site: Position) -> Self {
        Self {
            site,
            aircraft: BTreeMap::new(),
            messages: 0,
        }
    }

    /// Takes in what a message heard at `now_s`, in seconds since the epoch, says.
    ///
    /// An address that is only recovered is believed of an aircraft already
    /// known; of any other, the message is taken for a damaged one.
    pub fn hear(&mut self, observation: &Observation, now_s: f64) {
        let Address { value, r#type } = observation.address;
        let tracked = match (self.aircraft.entry((r#type, value)), observation.trust) {
            (Entry::Occupied(known), _) => known.into_mut(),
            (Entry::Vacant(unknown), Trust::Announced) => unknown.insert(Tracked {
                address: observation.address,
                ..Tracked::default()
            }),
            (Entry::Vacant(_), Trust::Recovered) => return,
        };
        self.messages += 1;
        tracked.hear(observation, now_s, self.site);
    }

    /// The aircraft as they are known at `now_s`, in the order of their
    /// addresses. Those no longer heard are forgotten.
    pub fn snapshot(&mut self, now_s: f64) -> Snapshot {
        self.aircraft
            .retain(|_, tracked| now_s - tracked.seen_s < LAPSE_S);
        let listed = self
            .aircraft
            .values()
            .filter(|tracked| tracked.messages >= MESSAGES_TO_BE_LISTED);
        Snapshot {
            now_s,
            messages: self.messages,
            aircraft: listed.map(|tracked| tracked.at(now_s)).collect(),
        }
    }
}

/// Something a message said, with when it did.
struct Said<T>(Option<(T, f64)>);

impl<T> Default for Said<T> {
    fn default() -> Self {
        Self(None)
    }
}

impl<T: Clone> Said<T> {
    /// Takes what a message heard at `now_s` says, when it says it.
    fn keep(&mut self, said: Option<T>, now_s: f64) {
        if let Some(said) = said {
            self.0 = Some((said, now_s));
        }
    }

    /// What was said, unless it has lapsed by `now_s`.
    fn at(&self, now_s: f64) -> Option<T> {
        self.within(LAPSE_S, now_s)
    }

    /// What was said less than `lapse_s` before `now_s`.
    fn within(&self, lapse_s: f64, now_s: f64) -> Option<T> {
        self.lasting(lapse_s, now_s).map(|(said, _)| said.clone())
    }

    /// How long before `now_s` it was said, unless it has lapsed.
    fn age_s(&self, now_s: f64) -> Option<f64> {
        self.lasting(LAPSE_S, now_s)
            .map(|(_, said_s)| now_s - said_s)
    }

    fn lasting(&self, lapse_s: f64, now_s: f64) -> Option<&(T, f64)> {
        self.0
            .as_ref()
            .filter(|(_, said_s)| now_s - said_s < lapse_s)
    }
}

/// Where an aircraft was placed.
#[derive(Clone, Copy)]
struct Fix {
    position: Position,
    nic: u32,
    source: Source,
}

/// What is kept of an aircraft longer than the rest.
#[derive(Default)]
struct Remembered {
    identification: Said<String>,
    emitter_category: Said<EmitterCategory>,
}

impl Remembered {
    /// Takes what an identification message heard at `now_s` says.
    fn keep(&mut self, said: &Identification, now_s: f64) {
        self.identification.keep(said.identification.clone(), now_s);
        self.emitter_category
            .keep(Some(said.emitter_category), now_s);
    }

    /// The callsign and the category, each unless it has lapsed by `now_s`.
    fn at(&self, now_s: f64) -> (Option<String>, Option<EmitterCategory>) {
        let lapse_s = IDENTIFICATION_LAPSE_S;
        (
            self.identification.within(lapse_s, now_s),
            self.emitter_category.within(lapse_s, now_s),
        )
    }
}

/// One aircraft, as its messages have told of it so far.
#[derive(Default)]
struct Tracked {
    address: Address,
    messages: u64,
    seen_s: f64,
    /// The power of each of the last messages, against full scale.
    powers: VecDeque<f64>,
    remembered: Remembered,
    mode_a_code: Said<u32>,
    emergency_priority_status: Said<EmergencyPriorityStatus>,
    on_ground: Said<bool>,
    baro_altitude_ft: Said<i32>,
    geometric_altitude_ft: Said<i32>,
    geometric_minus_baro_ft: Said<i32>,
    ground_speed_kt: Said<f64>,
    track_deg: Said<f64>,
    baro_vertical_rate_fpm: Said<i32>,
    geometric_vertical_rate_fpm: Said<i32>,
    indicated_airspeed_kt: Said<f64>,
    true_airspeed_kt: Said<f64>,
    target_state: Said<TargetState>,
    nac_p: Said<u32>,
    fix: Said<Fix>,
    /// The last position in the air of the even and of the odd format, and when it was heard.
    pairing: [Option<(Cpr, f64)>; 2],
    /// The ADS-B version it broadcasts in, and the NIC supplements it reported.
    version: u32,
    nic_supplement_a: bool,
    nic_supplement_c: bool,
}

impl Tracked {
    fn hear(&mut self, observation: &Observation, now_s: f64, site: Position) {
        self.messages += 1;
        self.seen_s = now_s;
        if let Some(rssi_dbfs) = observation.rssi_dbfs {
            if self.powers.len() == POWERS_KEPT {
                self.powers.pop_front();
            }
            self.powers.push_back(10_f64.powf(rssi_dbfs / 10.0));
        }
        self.take(observation, now_s, site);
    }

    fn take(&mut self, observation: &Observation, now_s: f64, site: Position) {
        match &observation.report {
            Report::AirbornePosition(said) => {
                self.baro_altitude_ft.keep(said.baro_altitude_ft, now_s);
                self.geometric_altitude_ft
                    .keep(said.geometric_altitude_ft, now_s);
                self.on_ground.keep(Some(false), now_s);
                self.qualify(said.nac_p_of_version_0(), now_s);
                let nic = said.nic(self.nic_supplement_a, self.version);
                let position = self.airborne(said.cpr, now_s);
                self.place(position, nic, observation.source, now_s, site);
            }
            Report::SurfacePosition(said) => {
                self.ground_speed_kt.keep(said.ground_speed_kt, now_s);
                self.track_deg.keep(said.track_deg, now_s);
                self.on_ground.keep(Some(true), now_s);
                self.qualify(said.nac_p_of_version_0(), now_s);
                let nic = said.nic(self.nic_supplement_a, self.nic_supplement_c);
                // A receiver hears an aircraft on the ground only from nearby.
                let reference = self.fix.at(now_s).map_or(site, |fix| fix.position);
                let position = cpr::surface_near(said.cpr, reference);
                self.place(position, nic, observation.source, now_s, site);
            }
            said => self.note(said, now_s),
        }
    }

    /// Takes what a message says other than where the aircraft is.
    fn note(&mut self, report: &Report, now_s: f64) {
        match report {
            Report::Identification(said) => self.remembered.keep(said, now_s),
            Report::Velocity(said) => {
                self.ground_speed_kt.keep(said.ground_speed_kt, now_s);
                self.track_deg.keep(said.track_deg, now_s);
                self.baro_vertical_rate_fpm
                    .keep(said.baro_vertical_rate_fpm, now_s);
                self.geometric_vertical_rate_fpm
                    .keep(said.geometric_vertical_rate_fpm, now_s);
                self.geometric_minus_baro_ft
                    .keep(said.geometric_minus_baro_ft, now_s);
                match said.airspeed {
                    Some(Airspeed::Indicated(kt)) => {
                        self.indicated_airspeed_kt.keep(Some(kt), now_s);
                    }
                    Some(Airspeed::True(kt)) => self.true_airspeed_kt.keep(Some(kt), now_s),
                    None => {}
                }
            }
            Report::Altitude {
                baro_altitude_ft,
                on_ground,
            } => {
                self.baro_altitude_ft.keep(*baro_altitude_ft, now_s);
                self.on_ground.keep(*on_ground, now_s);
            }
            Report::Identity {
                mode_a_code,
                on_ground,
            } => {
                self.mode_a_code.keep(Some(*mode_a_code), now_s);
                self.on_ground.keep(*on_ground, now_s);
            }
            Report::AllCall { on_ground } => self.on_ground.keep(*on_ground, now_s),
            Report::Status(said) => {
                self.emergency_priority_status
                    .keep(Some(said.emergency_priority_status), now_s);
                self.mode_a_code.keep(said.mode_a_code, now_s);
            }
            Report::TargetStateAndStatus(said) => {
                self.target_state.keep(Some(said.target), now_s);
                self.nac_p.keep(Some(said.nac_p), now_s);
            }
            Report::OperationalStatus(said) => {
                self.nac_p.keep(said.nac_p, now_s);
                self.version = said.version;
                self.nic_supplement_a = said.nic_supplement_a;
                self.nic_supplement_c = said.nic_supplement_c;
            }
            Report::AirbornePosition(_) | Report::SurfacePosition(_) => {}
        }
    }

    /// Takes the accuracy that a position message stands for, from an aircraft
    /// of version 0: it is one until it reports another.
    fn qualify(&mut self, nac_p_of_version_0: u32, now_s: f64) {
        if self.version == 0 {
            self.nac_p.keep(Some(nac_p_of_version_0), now_s);
        }
    }

    /// Where a position sent in the air puts the aircraft: by the position of
    /// the other format when that is recent, else by the last fix.
    fn airborne(&mut self, cpr: Cpr, now_s: f64) -> Option<Position> {
        let other = self.pairing[usize::from(!cpr.odd)]
            .filter(|(_, heard_s)| now_s - heard_s <= PAIR_WITHIN_S);
        self.pairing[usize::from(cpr.odd)] = Some((cpr, now_s));
        let paired = other.and_then(|(earlier, _)| cpr::global(earlier, cpr));
        paired.or_else(|| cpr::airborne_near(cpr, self.fix.at(now_s)?.position))
    }

    /// Takes a position that lies within what the receiver at the site can hear.
    fn place(
        &mut self,
        position: Option<Position>,
        nic: u32,
        source: Source,
        now_s: f64,
        site: Position,
    ) {
        let in_range = |position: &Position| site.distance_nm(*position) <= MAX_RANGE_NM;
        let fix = position.filter(in_range).map(|position| Fix {
            position,
            nic,
            source,
        });
        self.fix.keep(fix, now_s);
    }

    /// The aircraft as the feed carries it at `now_s`.
    fn at(&self, now_s: f64) -> Aircraft {
        let on_ground = self.on_ground.at(now_s) == Some(true);
        // On the ground the altitude some still send is not one to fly by.
        let baro_altitude_ft = self.baro_altitude_ft.at(now_s).filter(|_| !on_ground);
        let from_difference = baro_altitude_ft
            .zip(self.geometric_minus_baro_ft.at(now_s))
            .map(|(baro, difference)| baro + difference);
        let fix = self.fix.at(now_s);
        let quality = Quality {
            nic: fix.map(|fix| fix.nic),
            nac_p: self.nac_p.at(now_s),
        };
        let air_ground_state = if on_ground {
            AirGroundState::OnGround
        } else {
            AirGroundState::Unspecified
        };
        let (identification, emitter_category) = self.remembered.at(now_s);
        Aircraft {
            address: Some(self.address),
            identification,
            emitter_category: emitter_category.map(Into::into),
            mode_a_code: self.mode_a_code.at(now_s),
            emergency_priority_status: self.emergency_priority_status.at(now_s).map(Into::into),
            lat_deg: fix.map(|fix| fix.position.lat_deg),
            lon_deg: fix.map(|fix| fix.position.lon_deg),
            position_source: fix.map_or(Source::Unspecified, |fix| fix.source).into(),
            air_ground_state: air_ground_state.into(),
            baro_altitude_ft,
            geometric_altitude_ft: self.geometric_altitude_ft.at(now_s).or(from_difference),
            last_position: self.last_position(now_s),
            ground_speed_kt: self.ground_speed_kt.at(now_s),
            track_deg: self.track_deg.at(now_s),
            baro_vertical_rate_fpm: self.baro_vertical_rate_fpm.at(now_s),
            geometric_vertical_rate_fpm: self.geometric_vertical_rate_fpm.at(now_s),
            indicated_airspeed_kt: self.indicated_airspeed_kt.at(now_s),
            true_airspeed_kt: self.true_airspeed_kt.at(now_s),
            target_state: self
                .target_state
                .at(now_s)
                .filter(|target| *target != TargetState::default()),
            quality: Some(quality).filter(|quality| *quality != Quality::default()),
            reception: Some(Reception {
                messages: Some(self.messages),
                rssi_dbfs: self.rssi_dbfs(),
                seen_s: Some(now_s - self.seen_s),
                seen_pos_s: self.fix.age_s(now_s),
            }),
            ..Aircraft::default()
        }
    }

    /// Where the aircraft was last placed, once that has lapsed.
    fn last_position(&self, now_s: f64) -> Option<LastPosition> {
        let (fix, fixed_s) = self.fix.0.as_ref()?;
        self.fix.at(now_s).is_none().then(|| LastPosition {
            lat_deg: fix.position.lat_deg,
            lon_deg: fix.position.lon_deg,
            nic: Some(fix.nic),
            rc_m: None,
            seen_pos_s: now_s - fixed_s,
        })
    }

    /// The mean power of the last messages, in dB against full scale.
    fn rssi_dbfs(&self) -> Option<f64> {
        let measured = u32::try_from(self.powers.len())
            .ok()
            .filter(|count| *count > 0)?;
        let mean = self.powers.iter().sum::<f64>() / f64::from(measured);
        Some(10.0 * mean.log10())
    }
}

#[cfg(test)]
mod tests {
    use super::Traffic;
    use crate::cpr;
    use crate::field::{
        AirbornePosition, Airspeed, Identification, OperationalStatus, Status, SurfacePosition,
        TargetStateAndStatus, Velocity,
    };
    use crate::message::{Observation, Report, Trust};
    use crate::position::Position;
    use crate::proto::{
        Address, AddressType, AirGroundState, Aircraft, EmergencyPriorityStatus, EmitterCategory,
        Quality, Reception, Snapshot, Source, TargetState,
    };

    /// Made up: from a block ICAO reserves for future use.
    const ADDRESS: u32 = 0x00d0_0001;
    /// RJFF
    const SITE: Position = Position {
        lat_deg: 33.5844,
        lon_deg: 130.4517,
    };
    /// 30 NM to the north of the site, and a mile further.
    const NORTH: Position = Position {
        lat_deg: SITE.lat_deg + 0.5,
        ..SITE
    };
    const FURTHER: Position = Position {
        lat_deg: NORTH.lat_deg + 1.0 / 60.0,
        ..NORTH
    };
    const RSSI_DBFS: f64 = -20.0;

    fn icao(value: u32) -> Address {
        Address {
            value,
            r#type: AddressType::Icao.into(),
        }
    }

    fn from(address: u32, report: Report) -> Observation {
        Observation {
            address: icao(address),
            trust: Trust::Announced,
            source: Source::Unspecified,
            rssi_dbfs: Some(RSSI_DBFS),
            report,
        }
    }

    fn said(report: Report) -> Observation {
        from(ADDRESS, report)
    }

    fn identification(callsign: &str) -> Report {
        Report::Identification(Identification {
            identification: Some(callsign.into()),
            emitter_category: EmitterCategory::A3Large,
        })
    }

    fn velocity(ground_speed_kt: f64, track_deg: f64) -> Report {
        Report::Velocity(Velocity {
            ground_speed_kt: Some(ground_speed_kt),
            track_deg: Some(track_deg),
            airspeed: None,
            baro_vertical_rate_fpm: Some(-1216),
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: None,
        })
    }

    fn altitude(baro_altitude_ft: i32, on_ground: Option<bool>) -> Report {
        Report::Altitude {
            baro_altitude_ft: Some(baro_altitude_ft),
            on_ground,
        }
    }

    fn airborne(at: Position, odd: bool) -> Observation {
        said(Report::AirbornePosition(AirbornePosition {
            cpr: cpr::airborne(at, odd),
            baro_altitude_ft: Some(10_000),
            geometric_altitude_ft: None,
            type_code: 11,
            nic_supplement_b: false,
        }))
    }

    fn surface(at: Position, odd: bool) -> Observation {
        said(Report::SurfacePosition(SurfacePosition {
            cpr: cpr::surface(at, odd),
            ground_speed_kt: Some(18.0),
            track_deg: Some(340.3125),
            type_code: 7,
        }))
    }

    /// The traffic after each message, heard at its time.
    fn hearing(messages: impl IntoIterator<Item = (Observation, f64)>) -> Traffic {
        let mut traffic = Traffic::new(SITE);
        for (observation, now_s) in messages {
            traffic.hear(&observation, now_s);
        }
        traffic
    }

    /// Where the aircraft is known to be.
    fn place(known: &Aircraft) -> Option<Position> {
        let (lat_deg, lon_deg) = known.lat_deg.zip(known.lon_deg)?;
        Some(Position { lat_deg, lon_deg })
    }

    fn is_at(known: &Aircraft, at: Position) -> bool {
        place(known).is_some_and(|place| place.distance_nm(at) < 0.01)
    }

    /// The traffic after each report from the made-up address, one second apart from 100 s on.
    fn after(reports: impl IntoIterator<Item = Report>) -> Traffic {
        let mut traffic = Traffic::new(SITE);
        for (report, second) in reports.into_iter().zip(0_u32..) {
            traffic.hear(&said(report), 100.0 + f64::from(second));
        }
        traffic
    }

    /// The one aircraft in a snapshot taken at 110 s.
    fn known(mut traffic: Traffic) -> Aircraft {
        let mut aircraft = traffic.snapshot(110.0).aircraft;
        assert_eq!(aircraft.len(), 1, "{aircraft:?}");
        aircraft.remove(0)
    }

    #[test]
    fn aircraft_is_known_by_what_its_messages_said() {
        // Arrange
        let mut traffic = Traffic::new(SITE);
        traffic.hear(&said(identification("TEST01")), 100.0);

        // Act
        traffic.hear(&said(velocity(290.0, 235.0)), 101.0);

        // Assert
        let expected = Snapshot {
            now_s: 103.0,
            messages: 2,
            aircraft: vec![Aircraft {
                address: Some(icao(ADDRESS)),
                identification: Some("TEST01".into()),
                emitter_category: Some(EmitterCategory::A3Large.into()),
                ground_speed_kt: Some(290.0),
                track_deg: Some(235.0),
                baro_vertical_rate_fpm: Some(-1216),
                reception: Some(Reception {
                    messages: Some(2),
                    rssi_dbfs: Some(RSSI_DBFS),
                    seen_s: Some(2.0),
                    seen_pos_s: None,
                }),
                ..Aircraft::default()
            }],
        };
        assert_eq!(traffic.snapshot(103.0), expected);
    }

    #[test]
    fn aircraft_heard_once_is_left_out_as_possible_noise() {
        // Arrange
        let mut traffic = Traffic::new(SITE);

        // Act
        traffic.hear(&said(identification("TEST01")), 100.0);

        // Assert
        assert_eq!(traffic.snapshot(101.0).aircraft, vec![]);
    }

    #[test]
    fn aircraft_come_in_the_order_of_their_addresses() {
        // Arrange
        let mut traffic = Traffic::new(SITE);
        let addresses = [ADDRESS + 2, ADDRESS, ADDRESS + 1];

        // Act
        for address in addresses.into_iter().chain(addresses) {
            traffic.hear(&from(address, identification("TEST01")), 100.0);
        }

        // Assert
        let snapshot = traffic.snapshot(101.0);
        let known: Vec<_> = snapshot.aircraft.iter().map(|a| a.address).collect();
        assert_eq!(
            known,
            [ADDRESS, ADDRESS + 1, ADDRESS + 2].map(|a| Some(icao(a)))
        );
        assert_eq!(snapshot.messages, 6);
    }

    #[test]
    fn address_recovered_from_a_parity_is_believed_only_of_an_aircraft_already_known() {
        // Arrange
        let reply = |address| Observation {
            trust: Trust::Recovered,
            ..from(address, altitude(2500, None))
        };
        let mut traffic = Traffic::new(SITE);
        traffic.hear(&said(identification("TEST01")), 100.0);

        // Act
        for address in [ADDRESS, ADDRESS + 1, ADDRESS + 1] {
            traffic.hear(&reply(address), 101.0);
        }

        // Assert
        let snapshot = traffic.snapshot(102.0);
        let known: Vec<_> = snapshot
            .aircraft
            .iter()
            .map(|a| (a.address, a.baro_altitude_ft))
            .collect();
        assert_eq!(known, [(Some(icao(ADDRESS)), Some(2500))]);
        assert_eq!(snapshot.messages, 2);
    }

    #[test]
    fn later_message_replaces_what_an_earlier_one_said_and_keeps_what_it_leaves_out() {
        // Arrange
        let nameless = Report::Identification(Identification {
            identification: None,
            emitter_category: EmitterCategory::A5Heavy,
        });
        let stopped = Report::Velocity(Velocity {
            ground_speed_kt: None,
            track_deg: None,
            airspeed: None,
            baro_vertical_rate_fpm: None,
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: None,
        });
        let earlier = [identification("TEST01"), velocity(290.0, 235.0)];

        // Act
        let traffic = after(
            earlier
                .into_iter()
                .chain([nameless, stopped, velocity(300.0, 240.0)]),
        );

        // Assert
        let known = known(traffic);
        assert_eq!(known.identification.as_deref(), Some("TEST01"));
        assert_eq!(known.emitter_category(), EmitterCategory::A5Heavy);
        assert_eq!(known.ground_speed_kt, Some(300.0));
        assert_eq!(known.track_deg, Some(240.0));
        assert_eq!(known.baro_vertical_rate_fpm, Some(-1216));
    }

    #[test]
    fn vertical_rate_is_known_by_the_source_a_velocity_gives_it_from() {
        // Arrange
        let geometric = Report::Velocity(Velocity {
            ground_speed_kt: None,
            track_deg: None,
            airspeed: None,
            baro_vertical_rate_fpm: None,
            geometric_vertical_rate_fpm: Some(-832),
            geometric_minus_baro_ft: None,
        });

        // Act
        let traffic = after([velocity(290.0, 235.0), geometric]);

        // Assert
        let known = known(traffic);
        assert_eq!(known.baro_vertical_rate_fpm, Some(-1216));
        assert_eq!(known.geometric_vertical_rate_fpm, Some(-832));
    }

    #[test]
    fn altitude_comes_from_replies_and_from_position_messages() {
        // Arrange
        let position = |baro_altitude_ft, geometric_altitude_ft| {
            Report::AirbornePosition(AirbornePosition {
                cpr: crate::cpr::Cpr {
                    odd: false,
                    lat: 0,
                    lon: 0,
                },
                baro_altitude_ft,
                geometric_altitude_ft,
                type_code: 11,
                nic_supplement_b: false,
            })
        };
        let reports = [
            vec![altitude(2500, None), altitude(2525, None)],
            vec![position(Some(2500), None), position(Some(2550), None)],
            vec![position(None, Some(2600)), position(None, Some(2650))],
        ];

        // Act
        let known = reports.map(|reports| known(after(reports)));

        // Assert
        let altitudes = known.map(|a| (a.baro_altitude_ft, a.geometric_altitude_ft));
        assert_eq!(
            altitudes,
            [(Some(2525), None), (Some(2550), None), (None, Some(2650))]
        );
    }

    #[test]
    fn gnss_height_is_the_pressure_altitude_with_the_difference_a_velocity_gives() {
        // Arrange
        let higher = Report::Velocity(Velocity {
            ground_speed_kt: None,
            track_deg: None,
            airspeed: None,
            baro_vertical_rate_fpm: None,
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: Some(550),
        });

        // Act
        let traffic = after([higher, altitude(38_000, None)]);

        // Assert
        let known = known(traffic);
        assert_eq!(known.baro_altitude_ft, Some(38_000));
        assert_eq!(known.geometric_altitude_ft, Some(38_550));
    }

    #[test]
    fn aircraft_on_the_ground_is_at_no_pressure_altitude() {
        // Arrange: an altitude is still sent on the ground by some
        let reports = [
            [altitude(0, Some(true)), altitude(25, None)],
            [altitude(0, Some(true)), altitude(25, Some(false))],
        ];

        // Act
        let known = reports.map(|reports| known(after(reports)));

        // Assert
        let states = known.map(|a| (a.air_ground_state(), a.baro_altitude_ft));
        let expected = [
            (AirGroundState::OnGround, None),
            (AirGroundState::Unspecified, Some(25)),
        ];
        assert_eq!(states, expected);
    }

    #[test]
    fn all_call_and_identity_replies_say_whether_it_is_on_the_ground_too() {
        // Arrange
        let reports = [
            Report::AllCall {
                on_ground: Some(true),
            },
            Report::Identity {
                mode_a_code: 0o2431,
                on_ground: Some(true),
            },
        ];

        // Act
        let known = reports.map(|report| known(after([identification("TEST01"), report])));

        // Assert
        let states = known.map(|a| a.air_ground_state());
        assert_eq!(states, [AirGroundState::OnGround; 2]);
    }

    #[test]
    fn mode_a_code_and_emergency_come_from_status_and_identity() {
        // Arrange
        let status = Report::Status(Status {
            emergency_priority_status: EmergencyPriorityStatus::GeneralEmergency,
            mode_a_code: Some(0o7700),
        });
        let code_free = Report::Status(Status {
            emergency_priority_status: EmergencyPriorityStatus::NoEmergency,
            mode_a_code: None,
        });
        let identity = Report::Identity {
            mode_a_code: 0o2431,
            on_ground: None,
        };
        let reports = [
            vec![status.clone(), status.clone()],
            vec![status.clone(), code_free],
            vec![status, identity],
        ];

        // Act
        let known = reports.map(|reports| known(after(reports)));

        // Assert
        let statuses = known.map(|a| (a.mode_a_code, a.emergency_priority_status()));
        let expected = [
            (Some(0o7700), EmergencyPriorityStatus::GeneralEmergency),
            (Some(0o7700), EmergencyPriorityStatus::NoEmergency),
            (Some(0o2431), EmergencyPriorityStatus::GeneralEmergency),
        ];
        assert_eq!(statuses, expected);
    }

    #[test]
    fn airspeed_is_indicated_or_true() {
        // Arrange
        let through_the_air = |airspeed| {
            Report::Velocity(Velocity {
                ground_speed_kt: None,
                track_deg: None,
                airspeed: Some(airspeed),
                baro_vertical_rate_fpm: None,
                geometric_vertical_rate_fpm: None,
                geometric_minus_baro_ft: None,
            })
        };
        let reports = [Airspeed::Indicated(250.0), Airspeed::True(375.0)].map(through_the_air);

        // Act
        let traffic = after(reports);

        // Assert
        let known = known(traffic);
        assert_eq!(known.indicated_airspeed_kt, Some(250.0));
        assert_eq!(known.true_airspeed_kt, Some(375.0));
    }

    #[test]
    fn target_state_and_accuracy_are_what_was_last_reported() {
        // Arrange
        let target = TargetState {
            selected_altitude_mcp_ft: Some(6000),
            baro_setting_hpa: Some(1013.6),
            ..TargetState::default()
        };
        let reports = [
            Report::OperationalStatus(OperationalStatus {
                on_ground: false,
                version: 2,
                nic_supplement_a: false,
                nic_supplement_c: false,
                nac_p: Some(10),
            }),
            Report::TargetStateAndStatus(TargetStateAndStatus { target, nac_p: 9 }),
            Report::OperationalStatus(OperationalStatus {
                on_ground: false,
                version: 0,
                nic_supplement_a: false,
                nic_supplement_c: false,
                nac_p: None,
            }),
        ];

        // Act
        let traffic = after(reports);

        // Assert
        let known = known(traffic);
        assert_eq!(known.target_state, Some(target));
        let accuracy = Quality {
            nic: None,
            nac_p: Some(9),
        };
        assert_eq!(known.quality, Some(accuracy));
    }

    #[test]
    fn signal_is_the_mean_power_of_the_last_eight_messages() {
        // Arrange: four messages at -20 dBFS that are to be forgotten, then four more, then four at -10
        let mut traffic = Traffic::new(SITE);
        let powers = [[-20.0; 4], [-20.0; 4], [-10.0; 4]].concat();

        // Act
        for rssi_dbfs in powers {
            let heard = Observation {
                rssi_dbfs: Some(rssi_dbfs),
                ..said(identification("TEST01"))
            };
            traffic.hear(&heard, 100.0);
        }

        // Assert: half at a hundredth and half at a tenth of full scale
        let rssi = known(traffic).reception.and_then(|r| r.rssi_dbfs);
        let expected = 10.0 * f64::midpoint(0.01, 0.1).log10();
        assert!(
            rssi.is_some_and(|rssi| (rssi - expected).abs() < 1e-9),
            "{rssi:?}"
        );
    }

    #[test]
    fn message_without_a_measured_signal_leaves_the_mean_alone() {
        // Arrange
        let unmeasured = Observation {
            rssi_dbfs: None,
            ..said(identification("TEST01"))
        };
        let mut traffic = Traffic::new(SITE);
        traffic.hear(&unmeasured, 100.0);

        // Act
        traffic.hear(&unmeasured, 101.0);

        // Assert
        let reception = known(traffic).reception;
        assert_eq!(reception.and_then(|r| r.rssi_dbfs), None);
        assert_eq!(reception.and_then(|r| r.messages), Some(2));
    }

    #[test]
    fn aircraft_is_placed_by_a_position_of_each_format_within_ten_seconds() {
        // Arrange
        let messages = [
            (airborne(NORTH, false), 100.0),
            (airborne(NORTH, true), 101.0),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert
        let known = known(traffic);
        assert!(is_at(&known, NORTH), "{:?}", place(&known));
        assert_eq!(known.position_source(), Source::Unspecified);
        assert_eq!(known.quality.and_then(|quality| quality.nic), Some(8));
        assert_eq!(known.reception.and_then(|r| r.seen_pos_s), Some(9.0));
    }

    #[test]
    fn position_of_one_format_alone_places_nothing() {
        // Arrange
        let messages = [
            (airborne(NORTH, false), 100.0),
            (airborne(NORTH, false), 101.0),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert
        let known = known(traffic);
        assert_eq!(place(&known), None);
        assert_eq!(known.reception.and_then(|r| r.seen_pos_s), None);
    }

    #[test]
    fn positions_more_than_ten_seconds_apart_do_not_pair() {
        // Arrange
        let messages = [
            (airborne(NORTH, false), 100.0),
            (airborne(NORTH, true), 110.5),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert
        assert_eq!(place(&known(traffic)), None);
    }

    #[test]
    fn position_without_its_pair_is_placed_by_the_last_fix() {
        // Arrange: the odd message is too old to pair with by then
        let fixed = [
            (airborne(NORTH, false), 60.0),
            (airborne(NORTH, true), 61.0),
        ];

        // Act
        let traffic = hearing(fixed.into_iter().chain([(airborne(FURTHER, false), 105.0)]));

        // Assert
        let known = known(traffic);
        assert!(is_at(&known, FURTHER), "{:?}", place(&known));
        assert_eq!(known.reception.and_then(|r| r.seen_pos_s), Some(5.0));
    }

    #[test]
    fn position_long_after_the_last_fix_is_not_placed_by_it() {
        // Arrange
        let fixed = [
            (airborne(NORTH, false), 30.0),
            (airborne(NORTH, true), 31.0),
        ];

        // Act: more than a minute later
        let traffic = hearing(fixed.into_iter().chain([(airborne(FURTHER, false), 105.0)]));

        // Assert
        let known = known(traffic);
        assert!(!is_at(&known, FURTHER), "{:?}", place(&known));
    }

    #[test]
    fn position_beyond_the_range_of_a_receiver_is_refused() {
        // Arrange: over Hokkaido, 800 NM from the site
        let far = Position {
            lat_deg: 43.0,
            lon_deg: 143.0,
        };
        let messages = [(airborne(far, false), 100.0), (airborne(far, true), 101.0)];

        // Act
        let traffic = hearing(messages);

        // Assert
        assert_eq!(place(&known(traffic)), None);
    }

    #[test]
    fn aircraft_on_the_ground_is_placed_by_the_site_at_once() {
        // Arrange: on the apron, a little off the site
        let apron = Position {
            lat_deg: SITE.lat_deg + 0.003,
            lon_deg: SITE.lon_deg - 0.004,
        };
        let messages = [
            (surface(apron, false), 100.0),
            (surface(apron, false), 101.0),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert
        let known = known(traffic);
        assert!(is_at(&known, apron), "{:?}", place(&known));
        assert_eq!(known.air_ground_state(), AirGroundState::OnGround);
        assert_eq!(known.ground_speed_kt, Some(18.0));
        assert_eq!(known.track_deg, Some(340.3125));
    }

    #[test]
    fn position_in_the_air_takes_the_aircraft_off_the_ground() {
        // Arrange
        let messages = [
            (surface(SITE, false), 100.0),
            (airborne(SITE, false), 101.0),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert
        assert_eq!(
            known(traffic).air_ground_state(),
            AirGroundState::Unspecified
        );
    }

    #[test]
    fn position_is_marked_with_how_its_message_came() {
        // Arrange
        let multilaterated = |odd| Observation {
            source: Source::Mlat,
            ..airborne(NORTH, odd)
        };

        // Act
        let traffic = hearing([
            (multilaterated(false), 100.0),
            (multilaterated(true), 101.0),
        ]);

        // Assert
        assert_eq!(known(traffic).position_source(), Source::Mlat);
    }

    #[test]
    fn integrity_of_a_position_follows_the_supplements_the_aircraft_reported() {
        // Arrange: version 2 with NIC supplement A, then positions with supplement B
        let status = Report::OperationalStatus(OperationalStatus {
            on_ground: false,
            version: 2,
            nic_supplement_a: true,
            nic_supplement_c: false,
            nac_p: Some(10),
        });
        let supplemented = |odd| {
            let mut heard = airborne(NORTH, odd);
            if let Report::AirbornePosition(position) = &mut heard.report {
                position.nic_supplement_b = true;
            }
            heard
        };
        let messages = [
            (said(status), 99.0),
            (supplemented(false), 100.0),
            (supplemented(true), 101.0),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert
        let quality = Quality {
            nic: Some(9),
            nac_p: Some(10),
        };
        assert_eq!(known(traffic).quality, Some(quality));
    }

    #[test]
    fn accuracy_of_an_aircraft_of_version_0_is_that_of_its_position_type_code() {
        // Arrange: such an aircraft reports no accuracy, and no version either
        let messages = [
            (airborne(NORTH, false), 100.0),
            (airborne(NORTH, true), 101.0),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert: type code 11 stands for an accuracy category of 8
        let quality = Quality {
            nic: Some(8),
            nac_p: Some(8),
        };
        assert_eq!(known(traffic).quality, Some(quality));
    }

    #[test]
    fn aircraft_not_heard_for_a_minute_is_no_longer_listed() {
        // Arrange
        let mut traffic = after([identification("TEST01"), velocity(290.0, 235.0)]);

        // Act: just short of a minute after the last message, and a minute after it
        let listed = [160.9, 161.0].map(|now_s| traffic.snapshot(now_s).aircraft.len());

        // Assert
        assert_eq!(listed, [1, 0]);
    }

    #[test]
    fn aircraft_forgotten_is_unknown_again() {
        // Arrange
        let mut traffic = after([identification("TEST01"), velocity(290.0, 235.0)]);
        let forgetting = traffic.snapshot(170.0);
        let reply = Observation {
            trust: Trust::Recovered,
            ..said(altitude(2500, None))
        };

        // Act
        for now_s in [171.0, 172.0] {
            traffic.hear(&reply, now_s);
        }

        // Assert
        assert_eq!(forgetting.aircraft, vec![]);
        assert_eq!(traffic.snapshot(173.0).aircraft, vec![]);
    }

    #[test]
    fn what_is_no_longer_said_lapses_after_a_minute_while_the_aircraft_is_heard() {
        // Arrange: only all-call replies after the first seconds
        let here = || said(Report::AllCall { on_ground: None });
        let identity = Report::Identity {
            mode_a_code: 0o2431,
            on_ground: None,
        };
        let mut traffic = hearing([
            (said(identity), 100.0),
            (said(velocity(290.0, 235.0)), 105.0),
            (here(), 150.0),
            (here(), 164.0),
        ]);

        // Act: a minute after the identity reply, and a minute after the velocity
        let snapshots = [160.0, 165.0].map(|now_s| traffic.snapshot(now_s));

        // Assert
        let known = snapshots.map(|mut snapshot| snapshot.aircraft.remove(0));
        let said = known.map(|a| (a.mode_a_code, a.ground_speed_kt));
        assert_eq!(said, [(None, Some(290.0)), (None, None)]);
    }

    #[test]
    fn callsign_and_category_are_kept_for_fifteen_minutes_while_the_aircraft_is_heard() {
        // Arrange: only an all-call reply after the identification
        let mut traffic = hearing([
            (said(identification("TEST01")), 100.0),
            (said(Report::AllCall { on_ground: None }), 999.0),
        ]);

        // Act: just short of fifteen minutes after the identification, and fifteen minutes after it
        let snapshots = [999.9, 1000.0].map(|now_s| traffic.snapshot(now_s));

        // Assert
        let known = snapshots.map(|mut snapshot| snapshot.aircraft.remove(0));
        let kept = known.map(|a| (a.identification, a.emitter_category));
        let said = (Some("TEST01".into()), Some(EmitterCategory::A3Large.into()));
        assert_eq!(kept, [said, (None, None)]);
    }

    #[test]
    fn position_not_renewed_for_a_minute_becomes_the_last_position() {
        // Arrange
        let here = || said(Report::AllCall { on_ground: None });
        let mut traffic = hearing([
            (airborne(NORTH, false), 100.0),
            (airborne(NORTH, true), 101.0),
            (here(), 165.0),
        ]);

        // Act
        let mut snapshot = traffic.snapshot(166.0);

        // Assert
        let known = snapshot.aircraft.remove(0);
        assert_eq!(place(&known), None);
        assert_eq!(known.position_source(), Source::Unspecified);
        assert_eq!(known.quality.and_then(|quality| quality.nic), None);
        assert_eq!(known.reception.and_then(|r| r.seen_pos_s), None);
        let last = known.last_position.expect("kept");
        let at = Position {
            lat_deg: last.lat_deg,
            lon_deg: last.lon_deg,
        };
        assert!(at.distance_nm(NORTH) < 0.01, "{at:?}");
        assert_eq!((last.nic, last.seen_pos_s), (Some(8), 65.0));
    }

    #[test]
    fn position_that_is_current_is_not_the_last_position() {
        // Arrange
        let messages = [
            (airborne(NORTH, false), 100.0),
            (airborne(NORTH, true), 101.0),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert
        assert_eq!(known(traffic).last_position, None);
    }
}
