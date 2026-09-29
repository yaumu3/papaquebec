//! What the environment says about where things are.

use std::num::NonZeroU16;
use std::path::PathBuf;
use std::str::FromStr;

use crate::Failure;
use crate::upstream::sim::Site;

/// Where the traffic comes from.
#[derive(Debug, PartialEq)]
pub enum Origin {
    /// `PQ_TAR1090`: the tar1090 to follow.
    Tar1090(String),
    /// `PQ_SIM` (`lat,lon`): synthesized traffic around the site, in place of
    /// tar1090. `PQ_SIM_SPEED` runs it that many times faster than the clock, up to 1000,
    /// and `PQ_SIM_EXTRA` adds that many generic targets.
    Sim { site: Site, speed: f64, extra: u32 },
}

#[derive(Debug, PartialEq)]
pub struct Config {
    pub origin: Origin,
    /// `PQ_FEED_PORT`: the UDP port to listen on. The scope connects to the
    /// same number, so a container must publish it unchanged.
    pub port: u16,
    /// `PQ_FEED_INFO`: where to publish how to connect, for the web server to serve.
    pub info: PathBuf,
}

impl Config {
    /// Reads the variables through `lookup`, which answers like `std::env::var`.
    ///
    /// # Errors
    ///
    /// When a variable is set to what it cannot be.
    pub fn read(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, Failure> {
        let origin = match lookup("PQ_SIM") {
            Some(site) => Origin::Sim {
                site: site
                    .parse()
                    .map_err(|error| format!("PQ_SIM={site}: {error}"))?,
                speed: parsed(&lookup, "PQ_SIM_SPEED")?.map_or(Ok(1.0), sim_speed)?,
                extra: parsed(&lookup, "PQ_SIM_EXTRA")?.unwrap_or(0),
            },
            None => {
                Origin::Tar1090(lookup("PQ_TAR1090").unwrap_or_else(|| "http://tar1090".into()))
            }
        };
        let port: Option<NonZeroU16> = parsed(&lookup, "PQ_FEED_PORT")?;
        let info = lookup("PQ_FEED_INFO");
        Ok(Self {
            origin,
            port: port.map_or(4433, NonZeroU16::get),
            info: info.map_or_else(|| "public/feed/info.json".into(), PathBuf::from),
        })
    }
}

/// The variable read as a `T`, or none when it is not set.
fn parsed<T: FromStr>(
    lookup: impl Fn(&str) -> Option<String>,
    name: &str,
) -> Result<Option<T>, Failure> {
    let Some(value) = lookup(name) else {
        return Ok(None);
    };
    let read = value
        .parse()
        .map_err(|_| format!("{name}={value}: not what it can be"))?;
    Ok(Some(read))
}

/// The sim is asked once per sim second, so any faster would mean asking more
/// often than every millisecond.
const FASTEST_SIM: f64 = 1000.0;

fn sim_speed(speed: f64) -> Result<f64, Failure> {
    if speed > 0.0 && speed <= FASTEST_SIM {
        Ok(speed)
    } else {
        Err(format!("PQ_SIM_SPEED={speed:?}: not above 0 and at most {FASTEST_SIM}").into())
    }
}

impl FromStr for Site {
    type Err = Failure;

    /// `lat,lon` in degrees.
    fn from_str(site: &str) -> Result<Self, Failure> {
        let (lat, lon) = site.split_once(',').ok_or("expected lat,lon")?;
        let (lat_deg, lon_deg) = (lat.trim().parse::<f64>()?, lon.trim().parse::<f64>()?);
        // Asked as "within", which NaN never is.
        if !(-90.0..=90.0).contains(&lat_deg) || !(-180.0..=180.0).contains(&lon_deg) {
            return Err("outside the globe".into());
        }
        Ok(Self { lat_deg, lon_deg })
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{Config, Origin};
    use crate::upstream::sim::Site;

    fn environment(pairs: &'static [(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        |name| {
            pairs
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| (*value).to_owned())
        }
    }

    #[test]
    fn empty_environment_gives_the_container_s_defaults() {
        // Arrange
        let lookup = environment(&[]);

        // Act
        let config = Config::read(lookup);

        // Assert
        let expected = Config {
            origin: Origin::Tar1090("http://tar1090".into()),
            port: 4433,
            info: PathBuf::from("public/feed/info.json"),
        };
        assert_eq!(config.ok(), Some(expected));
    }

    #[test]
    fn environment_overrides_the_defaults() {
        // Arrange
        let lookup = environment(&[
            ("PQ_TAR1090", "http://localhost:8090"),
            ("PQ_FEED_PORT", "8443"),
            ("PQ_FEED_INFO", "/srv/feed.json"),
        ]);

        // Act
        let config = Config::read(lookup);

        // Assert
        let expected = Config {
            origin: Origin::Tar1090("http://localhost:8090".into()),
            port: 8443,
            info: PathBuf::from("/srv/feed.json"),
        };
        assert_eq!(config.ok(), Some(expected));
    }

    #[test]
    fn port_that_is_not_a_port_is_refused() {
        // Arrange
        let ports = ["0", "65536", "-1", "feed", ""];

        // Act
        let configs = ports
            .map(|port| Config::read(|name| (name == "PQ_FEED_PORT").then(|| port.to_owned())));

        // Assert
        assert!(configs.iter().all(Result::is_err));
    }

    #[test]
    fn sim_site_replaces_tar1090_with_the_sim() {
        // Arrange
        let lookup = environment(&[
            ("PQ_TAR1090", "http://localhost:8090"),
            ("PQ_SIM", "33.5844,130.4517"), // RJFF
        ]);

        // Act
        let config = Config::read(lookup);

        // Assert
        let site = Site {
            lat_deg: 33.5844,
            lon_deg: 130.4517,
        };
        let expected = Origin::Sim {
            site,
            speed: 1.0,
            extra: 0,
        };
        assert_eq!(config.ok().map(|config| config.origin), Some(expected));
    }

    #[test]
    fn sim_takes_its_speed_and_extra_traffic() {
        // Arrange
        let lookup = environment(&[
            ("PQ_SIM", "33.5844,130.4517"), // RJFF
            ("PQ_SIM_SPEED", "10"),
            ("PQ_SIM_EXTRA", "500"),
        ]);

        // Act
        let config = Config::read(lookup);

        // Assert
        let site = Site {
            lat_deg: 33.5844,
            lon_deg: 130.4517,
        };
        let expected = Origin::Sim {
            site,
            speed: 10.0,
            extra: 500,
        };
        assert_eq!(config.ok().map(|config| config.origin), Some(expected));
    }

    #[test]
    fn sim_that_cannot_be_flown_is_refused() {
        // Arrange
        let environments: [&[(&str, &str)]; 13] = [
            &[("PQ_SIM", "33.5844")],
            &[("PQ_SIM", "north,east")],
            &[("PQ_SIM", "91,130")],
            &[("PQ_SIM", "33,181")],
            &[("PQ_SIM", "NaN,130")],
            &[("PQ_SIM", "33,NaN")],
            &[("PQ_SIM", "inf,130")],
            &[("PQ_SIM", "33.5844,130.4517"), ("PQ_SIM_SPEED", "0")],
            &[("PQ_SIM", "33.5844,130.4517"), ("PQ_SIM_SPEED", "NaN")],
            &[("PQ_SIM", "33.5844,130.4517"), ("PQ_SIM_SPEED", "inf")],
            &[("PQ_SIM", "33.5844,130.4517"), ("PQ_SIM_SPEED", "1e300")],
            &[("PQ_SIM", "33.5844,130.4517"), ("PQ_SIM_SPEED", "1000.5")],
            &[("PQ_SIM", "33.5844,130.4517"), ("PQ_SIM_EXTRA", "-1")],
        ];

        // Act
        let configs = environments.map(|pairs| Config::read(environment(pairs)));

        // Assert
        assert!(configs.iter().all(Result::is_err));
    }

    #[test]
    fn sim_may_run_up_to_a_thousand_times_faster_than_the_clock() {
        // Arrange
        let lookup = environment(&[
            ("PQ_SIM", "33.5844,130.4517"), // RJFF
            ("PQ_SIM_SPEED", "1000"),
        ]);

        // Act
        let config = Config::read(lookup);

        // Assert
        let speed = match config.map(|config| config.origin) {
            Ok(Origin::Sim { speed, .. }) => Some(speed),
            _ => None,
        };
        assert_eq!(speed.map(f64::to_bits), Some(1000.0_f64.to_bits()));
    }
}
