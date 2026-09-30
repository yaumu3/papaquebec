//! What the environment says about where things are.

use std::num::NonZeroU16;
use std::path::PathBuf;
use std::str::FromStr;

use authority::Subject;
use feeder::Failure;
use feeder::position::Position;

/// Where the traffic comes from.
#[derive(Debug, PartialEq)]
pub enum Origin {
    /// `PQ_BEAST` (`host:port`): the receiver whose Beast output to follow,
    /// readsb on its usual port unless set, which hears at `PQ_SITE` (`lat,lon`).
    Beast { address: String, site: Position },
    /// `PQ_SIM` (`lat,lon`): synthesized traffic around the site, in place of
    /// a receiver. `PQ_SIM_SPEED` runs it that many times faster than the clock, up to 1000,
    /// and `PQ_SIM_EXTRA` adds that many generic targets, up to 10000.
    Sim {
        site: Position,
        speed: f64,
        extra: u32,
    },
}

#[derive(Debug, PartialEq)]
pub struct Config {
    pub origin: Origin,
    /// `PQ_FEED_PORT`: the UDP port to listen on. The scope connects to the
    /// same number, so a container must publish it unchanged. It is never the
    /// port the page is served on over https, since Safari would send the
    /// page's requests over a feed connection there.
    pub port: u16,
    /// `PQ_ADDRESS`: how the scope is served.
    pub door: Door,
    /// `XDG_DATA_HOME`, or `.local/share` in `HOME`: where the authority is kept.
    pub data: Option<PathBuf>,
}

/// How the scope is served, read from an address: `https://`, `https://<host>`
/// or just `<host>`, `http://`, each with an optional `:<port>`.
#[derive(Debug, PartialEq)]
pub enum Door {
    /// Over https with certificates from the local authority, for the one host
    /// only when the address names one.
    Secure { port: u16, only: Option<Subject> },
    /// Plainly, behind something else that speaks https.
    Plain { port: u16 },
}

impl FromStr for Door {
    type Err = Failure;

    fn from_str(address: &str) -> Result<Self, Failure> {
        let (secure, rest) = match address.split_once("://") {
            Some(("https", rest)) => (true, rest),
            Some(("http", rest)) => (false, rest),
            Some((scheme, _)) => return Err(format!("{scheme} is neither https nor http").into()),
            None => (true, address),
        };
        let (host, port) = host_and_port(rest)?;
        match (secure, host) {
            (true, only) => Ok(Self::Secure {
                port: port.unwrap_or(443),
                only: only.map(subject),
            }),
            (false, None) => Ok(Self::Plain {
                port: port.unwrap_or(80),
            }),
            (false, Some(_)) => {
                Err("a host names a certificate, which plain http has none of".into())
            }
        }
    }
}

/// `host`, `host:port`, `[v6]:port` or `:port`.
fn host_and_port(rest: &str) -> Result<(Option<&str>, Option<u16>), Failure> {
    let (host, port) = match rest.strip_prefix('[') {
        Some(bracketed) => {
            let (host, after) = bracketed
                .split_once(']')
                .ok_or("an address opened with [ is not closed")?;
            (host, after.strip_prefix(':'))
        }
        None => match rest.rsplit_once(':') {
            Some((host, port)) => (host, Some(port)),
            None => (rest, None),
        },
    };
    let port = port.map(str::parse::<NonZeroU16>).transpose()?;
    Ok((
        Some(host).filter(|host| !host.is_empty()),
        port.map(NonZeroU16::get),
    ))
}

fn subject(host: &str) -> Subject {
    match host.parse() {
        Ok(address) => Subject::Address(address),
        Err(_) => Subject::Name(host.to_ascii_lowercase()),
    }
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
                extra: parsed(&lookup, "PQ_SIM_EXTRA")?.map_or(Ok(0), sim_extra)?,
            },
            None => Origin::Beast {
                address: lookup("PQ_BEAST").unwrap_or_else(|| "readsb:30005".into()),
                // Positions are decoded around it, and nothing in what a receiver sends tells it.
                site: parsed(&lookup, "PQ_SITE")?
                    .ok_or("PQ_SITE is not set: where the receiver is, as lat,lon")?,
            },
        };
        let port: Option<NonZeroU16> = parsed(&lookup, "PQ_FEED_PORT")?;
        let door = match lookup("PQ_ADDRESS") {
            Some(address) => address
                .parse()
                .map_err(|error| format!("PQ_ADDRESS={address}: {error}"))?,
            None => Door::Secure {
                port: 443,
                only: None,
            },
        };
        let port = port.map_or(4433, NonZeroU16::get);
        if matches!(door, Door::Secure { port: page, .. } if page == port) {
            return Err(format!("PQ_FEED_PORT={port}: the page is served there too").into());
        }
        let data = lookup("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| lookup("HOME").map(|home| PathBuf::from(home).join(".local/share")));
        Ok(Self {
            origin,
            port,
            door,
            data,
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

/// Far beyond a real receiver's traffic, which is what a load test wants; the
/// sim builds every target up front, and more would also run their addresses out
/// of the block reserved for them.
const MOST_EXTRA: u32 = 10_000;

fn sim_extra(extra: u32) -> Result<u32, Failure> {
    if extra <= MOST_EXTRA {
        Ok(extra)
    } else {
        Err(format!("PQ_SIM_EXTRA={extra}: more than {MOST_EXTRA}").into())
    }
}

fn sim_speed(speed: f64) -> Result<f64, Failure> {
    if speed > 0.0 && speed <= FASTEST_SIM {
        Ok(speed)
    } else {
        Err(format!("PQ_SIM_SPEED={speed:?}: not above 0 and at most {FASTEST_SIM}").into())
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use authority::Subject;
    use feeder::position::Position;

    use super::{Config, Door, Origin};

    /// RJFF
    const SITE: Position = Position {
        lat_deg: 33.5844,
        lon_deg: 130.4517,
    };

    /// The variables of the pairs and no other.
    fn variables<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        move |name| {
            let set = pairs.iter().find(|(key, _)| *key == name);
            set.map(|(_, value)| (*value).to_owned())
        }
    }

    /// The variables of a receiver at the site, with the pairs set too, or set otherwise.
    fn environment<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        move |name| {
            variables(pairs)(name).or_else(|| variables(&[("PQ_SITE", "33.5844,130.4517")])(name))
        }
    }

    #[test]
    fn receiver_is_followed_where_readsb_is_expected_by_default() {
        // Arrange
        let lookup = environment(&[]);

        // Act
        let config = Config::read(lookup);

        // Assert
        let expected = Config {
            origin: Origin::Beast {
                address: "readsb:30005".into(),
                site: SITE,
            },
            port: 4433,
            door: Door::Secure {
                port: 443,
                only: None,
            },
            data: None,
        };
        assert_eq!(config.ok(), Some(expected));
    }

    #[test]
    fn environment_overrides_the_defaults() {
        // Arrange
        let lookup = environment(&[
            ("PQ_BEAST", "localhost:30105"),
            ("PQ_FEED_PORT", "4500"),
            ("PQ_ADDRESS", "https://raspberrypi.local:8443"),
            ("XDG_DATA_HOME", "/srv/data"),
            ("HOME", "/home/pq"),
        ]);

        // Act
        let config = Config::read(lookup);

        // Assert
        let expected = Config {
            origin: Origin::Beast {
                address: "localhost:30105".into(),
                site: SITE,
            },
            port: 4500,
            door: Door::Secure {
                port: 8443,
                only: Some(Subject::Name("raspberrypi.local".into())),
            },
            data: Some(PathBuf::from("/srv/data")),
        };
        assert_eq!(config.ok(), Some(expected));
    }

    #[test]
    fn receiver_without_a_site_is_refused_by_the_name_of_the_variable() {
        // Arrange: not set, and set to nowhere
        let environments: [&[(&str, &str)]; 2] = [&[], &[("PQ_SITE", "north,east")]];

        // Act
        let configs = environments.map(|pairs| Config::read(variables(pairs)));

        // Assert
        let refusals = configs.map(|config| config.err().map(|refusal| refusal.to_string()));
        assert!(
            refusals.iter().all(|refusal| refusal
                .as_ref()
                .is_some_and(|said| said.contains("PQ_SITE"))),
            "{refusals:?}"
        );
    }

    /// Safari sends the page's requests over a feed connection to the same host
    /// and port, which answers only the feed.
    #[test]
    fn feed_on_the_port_the_page_is_served_on_is_refused() {
        // Arrange
        let environments: [&[(&str, &str)]; 2] = [
            &[("PQ_FEED_PORT", "443")],
            &[("PQ_FEED_PORT", "8443"), ("PQ_ADDRESS", "https://:8443")],
        ];

        // Act
        let configs = environments.map(|pairs| Config::read(environment(pairs)));

        // Assert
        assert!(configs.iter().all(Result::is_err));
    }

    #[test]
    fn port_that_is_not_a_port_is_refused() {
        // Arrange
        let ports = ["0", "65536", "-1", "feed", ""];

        // Act
        let configs = ports.map(|port| Config::read(environment(&[("PQ_FEED_PORT", port)])));

        // Assert
        assert!(configs.iter().all(Result::is_err));
    }

    #[test]
    fn sim_flies_in_place_of_a_receiver_and_needs_no_site_of_one() {
        // Arrange
        let set = [
            ("PQ_BEAST", "localhost:30105"),
            ("PQ_SIM", "33.5844,130.4517"),
        ];

        // Act
        let config = Config::read(variables(&set));

        // Assert
        let expected = Origin::Sim {
            site: SITE,
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
        let expected = Origin::Sim {
            site: SITE,
            speed: 10.0,
            extra: 500,
        };
        assert_eq!(config.ok().map(|config| config.origin), Some(expected));
    }

    #[test]
    fn sim_that_cannot_be_flown_is_refused() {
        // Arrange
        let environments: [&[(&str, &str)]; 8] = [
            &[("PQ_SIM", "north,east")],
            &[("PQ_SIM", "33.5844,130.4517"), ("PQ_SIM_SPEED", "0")],
            &[("PQ_SIM", "33.5844,130.4517"), ("PQ_SIM_SPEED", "NaN")],
            &[("PQ_SIM", "33.5844,130.4517"), ("PQ_SIM_SPEED", "inf")],
            &[("PQ_SIM", "33.5844,130.4517"), ("PQ_SIM_SPEED", "1e300")],
            &[("PQ_SIM", "33.5844,130.4517"), ("PQ_SIM_SPEED", "1000.5")],
            &[("PQ_SIM", "33.5844,130.4517"), ("PQ_SIM_EXTRA", "-1")],
            &[("PQ_SIM", "33.5844,130.4517"), ("PQ_SIM_EXTRA", "10001")],
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

    #[test]
    fn sim_may_add_up_to_ten_thousand_generic_targets() {
        // Arrange
        let lookup = environment(&[
            ("PQ_SIM", "33.5844,130.4517"), // RJFF
            ("PQ_SIM_EXTRA", "10000"),
        ]);

        // Act
        let config = Config::read(lookup);

        // Assert
        let extra = match config.map(|config| config.origin) {
            Ok(Origin::Sim { extra, .. }) => Some(extra),
            _ => None,
        };
        assert_eq!(extra, Some(10_000));
    }

    #[test]
    fn data_is_kept_where_xdg_would_keep_it() {
        // Arrange
        let lookup = environment(&[("HOME", "/home/pq")]);

        // Act
        let config = Config::read(lookup);

        // Assert
        let data = config.ok().and_then(|config| config.data);
        assert_eq!(data, Some(PathBuf::from("/home/pq/.local/share")));
    }

    #[test]
    fn address_is_read_in_every_form() {
        // Arrange
        let secure = |port, only| Door::Secure { port, only };
        let name = |name: &str| Some(Subject::Name(name.into()));
        let address = |address: &str| Some(Subject::Address(address.parse().expect("an address")));
        let cases = [
            ("https://", secure(443, None)),
            (
                "https://raspberrypi.local",
                secure(443, name("raspberrypi.local")),
            ),
            (
                "https://RaspberryPi.local",
                secure(443, name("raspberrypi.local")),
            ),
            ("raspberrypi.local", secure(443, name("raspberrypi.local"))),
            (
                "https://192.168.3.10:8443",
                secure(8443, address("192.168.3.10")),
            ),
            ("https://[::1]:8443", secure(8443, address("::1"))),
            ("https://:8443", secure(8443, None)),
            ("http://", Door::Plain { port: 80 }),
            ("http://:8080", Door::Plain { port: 8080 }),
        ];

        // Act
        let read = cases.each_ref().map(|(written, _)| {
            Config::read(environment(&[("PQ_ADDRESS", written)])).map(|c| c.door)
        });

        // Assert
        let expected = cases.map(|(_, door)| Some(door));
        assert_eq!(read.map(Result::ok), expected);
    }

    #[test]
    fn address_that_cannot_be_served_is_refused() {
        // Arrange
        let written = [
            "ftp://raspberrypi.local",
            "https://raspberrypi.local:0",
            "https://raspberrypi.local:65536",
            "https://raspberrypi.local:port",
            "http://raspberrypi.local",
            "https://[::1",
        ];

        // Act
        let read = written.map(|written| Config::read(environment(&[("PQ_ADDRESS", written)])));

        // Assert
        assert!(read.iter().all(Result::is_err));
    }
}
