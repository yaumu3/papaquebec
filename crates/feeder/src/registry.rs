//! Whose each aircraft is and of what type, by its address: the aircraft
//! database Mictronics publishes under the Open Data Commons Attribution License.

use std::collections::HashMap;
use std::fmt;
use std::io::{Cursor, Read};

use serde::Deserializer;
use serde::de::{MapAccess, Visitor};
use zip::ZipArchive;

use crate::Failure;
use crate::proto::{self, AddressType, Snapshot};

/// The registration and the type of every aircraft the database knows.
#[derive(Default)]
pub struct Registry {
    /// In the order of their addresses.
    aircraft: Vec<Entry>,
    /// The registration and the type designator of each, end to end.
    text: String,
    /// What each type designator stands for.
    types: HashMap<String, String>,
}

/// Where the registration of an address starts in the text, its type designator after it.
struct Entry {
    address: u32,
    at: u32,
    registration_len: u8,
    designator_len: u8,
}

impl Registry {
    /// Reads the database as it is published: a zip of `aircrafts.json`, which
    /// gives a registration and a type designator by address, and
    /// `types.json`, which describes each designator.
    ///
    /// # Errors
    ///
    /// When it is not such a zip.
    pub fn read(zip: &[u8]) -> Result<Self, Failure> {
        let mut archive = ZipArchive::new(Cursor::new(zip))?;
        let types: HashMap<String, Vec<String>> =
            serde_json::from_slice(&file(&mut archive, "types.json")?)?;
        let described = types.into_iter().filter_map(|(designator, described)| {
            Some((designator, described.into_iter().next()?))
        });
        let mut registry = Self {
            types: described.collect(),
            ..Self::default()
        };
        let aircraft = file(&mut archive, "aircrafts.json")?;
        serde_json::Deserializer::from_slice(&aircraft).deserialize_map(&mut registry)?;
        registry
            .aircraft
            .sort_unstable_by_key(|entry| entry.address);
        Ok(registry)
    }

    /// Takes the aircraft at the address written in hexadecimal, with its
    /// registration and then its type designator; one that has neither is left out.
    fn push(&mut self, address: &str, fields: &[String]) {
        let field = |at: usize| fields.get(at).map_or("", String::as_str);
        let (registration, designator) = (field(0), field(1));
        let entry = || {
            Some(Entry {
                address: u32::from_str_radix(address, 16).ok()?,
                at: u32::try_from(self.text.len()).ok()?,
                registration_len: u8::try_from(registration.len()).ok()?,
                designator_len: u8::try_from(designator.len()).ok()?,
            })
        };
        if let Some(entry) = entry().filter(|_| !(registration.is_empty() && designator.is_empty()))
        {
            self.aircraft.push(entry);
            self.text.push_str(registration);
            self.text.push_str(designator);
        }
    }

    /// What is registered under the ICAO address; none when the database does not know it.
    #[must_use]
    pub fn registered(&self, address: u32) -> Option<proto::Registry> {
        let found = self
            .aircraft
            .binary_search_by_key(&address, |entry| entry.address);
        let entry = &self.aircraft[found.ok()?];
        let (registration, designator) =
            self.text[entry.at as usize..].split_at_checked(usize::from(entry.registration_len))?;
        let designator = designator.get(..usize::from(entry.designator_len))?;
        let known = |text: &str| {
            Some(text)
                .filter(|text| !text.is_empty())
                .map(str::to_owned)
        };
        Some(proto::Registry {
            registration: known(registration),
            type_designator: known(designator),
            type_description: self.types.get(designator).cloned(),
        })
    }

    /// Gives every aircraft with an ICAO address what is registered under it.
    pub fn fill(&self, snapshot: &mut Snapshot) {
        for aircraft in &mut snapshot.aircraft {
            let icao = aircraft
                .address
                .filter(|address| address.r#type() == AddressType::Icao);
            aircraft.registry = icao.and_then(|address| self.registered(address.value));
        }
    }
}

/// Aircraft by their address, each with its registration and its type designator.
impl FromIterator<(u32, String, String)> for Registry {
    fn from_iter<I: IntoIterator<Item = (u32, String, String)>>(aircraft: I) -> Self {
        let mut registry = Self::default();
        for (address, registration, designator) in aircraft {
            registry.push(&format!("{address:x}"), &[registration, designator]);
        }
        registry
            .aircraft
            .sort_unstable_by_key(|entry| entry.address);
        registry
    }
}

/// Takes each aircraft as it is read, so that the file is never held as a whole map.
impl<'de> Visitor<'de> for &mut Registry {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("aircraft by address")
    }

    fn visit_map<A: MapAccess<'de>>(self, mut aircraft: A) -> Result<(), A::Error> {
        while let Some((address, fields)) = aircraft.next_entry::<String, Vec<String>>()? {
            self.push(&address, &fields);
        }
        Ok(())
    }
}

/// The file of the name in the archive.
fn file(archive: &mut ZipArchive<Cursor<&[u8]>>, name: &str) -> Result<Vec<u8>, Failure> {
    let mut contents = Vec::new();
    archive.by_name(name)?.read_to_end(&mut contents)?;
    Ok(contents)
}

#[cfg(test)]
pub(crate) mod tests {
    use std::io::{Cursor, Write};

    use zip::ZipWriter;
    use zip::write::SimpleFileOptions;

    use super::Registry;
    use crate::proto::{self, Address, AddressType, Aircraft, Snapshot};

    /// Made-up aircraft at addresses ICAO reserves, and one real type.
    const AIRCRAFT: &str = r#"{
        "D00002": ["TEST-02", "B789", "00"],
        "d00001": ["TEST-01", "ZZZZ", "00"],
        "D00003": ["", "", "00"],
        "D00004": ["TEST\/04", "B789"],
        "nonsense": ["TEST-05", "B789", "00"]
    }"#;
    const TYPES: &str = r#"{"B789": ["BOEING 787-9 Dreamliner", "L2J", "H"]}"#;

    /// A zip of the files, each with its name.
    pub(crate) fn zipped(files: &[(&str, &str)]) -> Vec<u8> {
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        for (name, contents) in files {
            zip.start_file(*name, SimpleFileOptions::default())
                .expect("starts");
            zip.write_all(contents.as_bytes()).expect("writes");
        }
        zip.finish().expect("finishes").into_inner()
    }

    pub(crate) fn database() -> Vec<u8> {
        zipped(&[("aircrafts.json", AIRCRAFT), ("types.json", TYPES)])
    }

    fn registered(registration: Option<&str>, designator: Option<&str>) -> proto::Registry {
        proto::Registry {
            registration: registration.map(str::to_owned),
            type_designator: designator.map(str::to_owned),
            type_description: designator
                .filter(|designator| *designator == "B789")
                .map(|_| "BOEING 787-9 Dreamliner".to_owned()),
        }
    }

    #[test]
    fn aircraft_is_registered_under_its_address_in_either_case() {
        // Arrange
        let registry = Registry::read(&database()).expect("reads");

        // Act
        let found =
            [0x00d0_0001, 0x00d0_0002, 0x00d0_0004].map(|address| registry.registered(address));

        // Assert: a type the database does not describe, one it does, and an escaped registration
        let expected = [
            registered(Some("TEST-01"), Some("ZZZZ")),
            registered(Some("TEST-02"), Some("B789")),
            registered(Some("TEST/04"), Some("B789")),
        ];
        assert_eq!(found, expected.map(Some));
    }

    #[test]
    fn address_without_a_registration_or_a_type_is_not_registered() {
        // Arrange: one the database does not have, and one it has nothing under
        let registry = Registry::read(&database()).expect("reads");

        // Act
        let found = [0x00d0_0009, 0x00d0_0003].map(|address| registry.registered(address));

        // Assert
        assert_eq!(found, [None, None]);
    }

    #[test]
    fn what_is_not_the_database_is_refused() {
        // Arrange: no zip, a zip without the types, and one whose aircraft are no JSON
        let files = [
            b"not a zip".to_vec(),
            zipped(&[("aircrafts.json", AIRCRAFT)]),
            zipped(&[("aircrafts.json", "not json"), ("types.json", TYPES)]),
        ];

        // Act
        let read = files.map(|zip| Registry::read(&zip).is_err());

        // Assert
        assert_eq!(read, [true; 3]);
    }

    #[test]
    fn aircraft_with_an_icao_address_are_given_what_is_registered() {
        // Arrange: the same number as an ICAO address and as another
        let registry = Registry::read(&database()).expect("reads");
        let at = |r#type: AddressType| Aircraft {
            address: Some(Address {
                value: 0x00d0_0002,
                r#type: r#type.into(),
            }),
            ..Aircraft::default()
        };
        let mut snapshot = Snapshot {
            aircraft: vec![at(AddressType::Icao), at(AddressType::NonIcao)],
            ..Snapshot::default()
        };

        // Act
        registry.fill(&mut snapshot);

        // Assert
        let filled: Vec<_> = snapshot.aircraft.into_iter().map(|a| a.registry).collect();
        assert_eq!(
            filled,
            [Some(registered(Some("TEST-02"), Some("B789"))), None]
        );
    }

    #[test]
    fn registry_can_be_gathered_from_aircraft_known_otherwise() {
        // Arrange: out of the order of their addresses
        let aircraft = [
            (0x00d0_0002, "TEST-02".to_owned(), "A320".to_owned()),
            (0x00d0_0001, "TEST-01".to_owned(), "B789".to_owned()),
        ];

        // Act
        let registry: Registry = aircraft.into_iter().collect();

        // Assert
        let found = [0x00d0_0001, 0x00d0_0002].map(|address| registry.registered(address));
        let expected =
            [("TEST-01", "B789"), ("TEST-02", "A320")].map(|(registration, designator)| {
                Some(proto::Registry {
                    registration: Some(registration.into()),
                    type_designator: Some(designator.into()),
                    type_description: None,
                })
            });
        assert_eq!(found, expected);
    }

    #[test]
    fn empty_registry_knows_no_aircraft() {
        // Arrange
        let registry = Registry::default();

        // Act
        let found = registry.registered(0x00d0_0001);

        // Assert
        assert_eq!(found, None);
    }
}
