//! A local certificate authority that vouches for the scope's own host.
//!
//! A browser shows the scope only in a secure context, and no public authority
//! vouches for a name like `raspberrypi.local`. So the server has its own, which
//! each device is told to trust once, and issues itself a certificate for
//! whatever name or address it is reached by.

use std::fs::OpenOptions;
use std::io::Write;
use std::net::IpAddr;
use std::os::unix::fs::OpenOptionsExt;
use std::path::Path;

use rcgen::{
    BasicConstraints, CertificateParams, DistinguishedName, DnType, ExtendedKeyUsagePurpose, IsCa,
    Issuer, KeyPair, KeyUsagePurpose, PKCS_ECDSA_P256_SHA256, SanType,
};
use rustls_pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use time::{Duration, OffsetDateTime};
use x509_parser::prelude::{FromDer, X509Certificate};

pub type Failure = Box<dyn std::error::Error + Send + Sync>;

/// Ten years, so that each device trusts it once for good.
const AUTHORITY_LASTS: Duration = Duration::days(3650);
/// Well within the 398 days Apple accepts of a server's certificate.
const CERTIFICATE_LASTS: Duration = Duration::days(90);
/// A device's clock may run behind the server's.
const CLOCK_SLACK: Duration = Duration::hours(1);

/// What a certificate is issued for: what the browser was told to open.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Subject {
    Name(String),
    Address(IpAddr),
}

/// A certificate and its key, as a TLS server presents them.
pub struct Issued {
    pub chain: Vec<CertificateDer<'static>>,
    pub key: PrivateKeyDer<'static>,
}

/// An authority as it is kept between runs.
pub struct Kept {
    pub certificate_pem: String,
    pub key_pem: String,
}

/// How an authority came to be the one in use.
#[derive(Debug)]
pub enum How {
    /// It is the one kept from an earlier run.
    Kept,
    /// It is new, and devices have yet to trust it.
    Created,
}

pub struct Opened {
    pub authority: Authority,
    pub how: How,
}

pub struct Authority {
    certificate: CertificateDer<'static>,
    issuer: Issuer<'static, KeyPair>,
}

const CERTIFICATE_FILE: &str = "root.crt";
const KEY_FILE: &str = "root.key";

impl Authority {
    /// A new authority, and what to keep of it.
    ///
    /// # Errors
    ///
    /// When the key or the certificate cannot be made.
    pub fn create() -> Result<(Self, Kept), Failure> {
        let key = KeyPair::generate()?;
        let mut params = CertificateParams::default();
        params.distinguished_name = named("Papa Quebec Local Authority");
        params.is_ca = IsCa::Ca(BasicConstraints::Constrained(0));
        params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
        (params.not_before, params.not_after) = valid_for(AUTHORITY_LASTS);
        let certificate = params.self_signed(&key)?;
        let kept = Kept {
            certificate_pem: certificate.pem(),
            key_pem: key.serialize_pem(),
        };
        let authority = Self {
            certificate: certificate.der().clone(),
            issuer: Issuer::new(params, key),
        };
        Ok((authority, kept))
    }

    /// An authority from its certificate and PKCS #8 key.
    ///
    /// # Errors
    ///
    /// When either cannot be read, the certificate is not an authority's or not
    /// valid now, or the key is not the certificate's.
    pub fn from_pem(certificate_pem: &str, key_pem: &str) -> Result<Self, Failure> {
        let certificate = CertificateDer::from(pem::parse(certificate_pem)?.into_contents());
        let key = KeyPair::from_pem_and_sign_algo(key_pem, &PKCS_ECDSA_P256_SHA256)?;
        let (_, parsed) = X509Certificate::from_der(&certificate)?;
        if !parsed.is_ca() {
            return Err("the certificate is not an authority's".into());
        }
        if !parsed.validity().is_valid() {
            return Err("the certificate is not valid now".into());
        }
        if parsed.public_key().subject_public_key.data != key.public_key_raw() {
            return Err("the key is not the certificate's".into());
        }
        let issuer = Issuer::from_ca_cert_der(&certificate, key)?;
        Ok(Self {
            certificate,
            issuer,
        })
    }

    /// The authority kept in `directory`, or a new one, from then on kept there.
    ///
    /// # Errors
    ///
    /// When the authority kept there cannot be used, or none can be kept there.
    pub fn open(directory: &Path) -> Result<Opened, Failure> {
        if let Some(kept) = read(directory)? {
            let authority = Self::from_pem(&kept.certificate_pem, &kept.key_pem)?;
            return Ok(Opened {
                authority,
                how: How::Kept,
            });
        }
        let (authority, kept) = Self::create()?;
        keep(directory, &kept)?;
        Ok(Opened {
            authority,
            how: How::Created,
        })
    }

    /// What a device is given to trust.
    #[must_use]
    pub fn certificate(&self) -> &CertificateDer<'static> {
        &self.certificate
    }

    /// The certificate as a file a device can be handed.
    #[must_use]
    pub fn certificate_pem(&self) -> String {
        let certificate = pem::Pem::new("CERTIFICATE", self.certificate.to_vec());
        let unix = pem::EncodeConfig::new().set_line_ending(pem::LineEnding::LF);
        pem::encode_config(&certificate, unix)
    }

    /// A certificate for the subject, with a key of its own.
    ///
    /// # Errors
    ///
    /// When the subject is not a name a certificate can carry.
    pub fn issue(&self, subject: &Subject) -> Result<Issued, Failure> {
        let key = KeyPair::generate()?;
        let (common_name, alternative) = match subject {
            Subject::Name(name) => (name.clone(), SanType::DnsName(name.as_str().try_into()?)),
            Subject::Address(address) => (address.to_string(), SanType::IpAddress(*address)),
        };
        let mut params = CertificateParams::default();
        params.distinguished_name = named(&common_name);
        params.subject_alt_names = vec![alternative];
        params.is_ca = IsCa::ExplicitNoCa;
        params.key_usages = vec![KeyUsagePurpose::DigitalSignature];
        params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
        params.use_authority_key_identifier_extension = true;
        (params.not_before, params.not_after) = valid_for(CERTIFICATE_LASTS);
        let certificate = params.signed_by(&key, &self.issuer)?;
        Ok(Issued {
            chain: vec![certificate.der().clone()],
            key: PrivatePkcs8KeyDer::from(key.serialize_der()).into(),
        })
    }
}

/// What a directory keeps of an authority, if it keeps one.
fn read(directory: &Path) -> Result<Option<Kept>, Failure> {
    let (certificate, key) = (directory.join(CERTIFICATE_FILE), directory.join(KEY_FILE));
    if !certificate.exists() || !key.exists() {
        return Ok(None);
    }
    Ok(Some(Kept {
        certificate_pem: std::fs::read_to_string(certificate)?,
        key_pem: std::fs::read_to_string(key)?,
    }))
}

/// Keeps the authority in the directory, its key readable by the owner alone.
fn keep(directory: &Path, kept: &Kept) -> Result<(), Failure> {
    std::fs::create_dir_all(directory)?;
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true).mode(0o600);
    let mut key = options.open(directory.join(KEY_FILE))?;
    key.write_all(kept.key_pem.as_bytes())?;
    std::fs::write(directory.join(CERTIFICATE_FILE), &kept.certificate_pem)?;
    Ok(())
}

fn named(common_name: &str) -> DistinguishedName {
    let mut name = DistinguishedName::new();
    name.push(DnType::CommonName, common_name);
    name
}

fn valid_for(lasts: Duration) -> (OffsetDateTime, OffsetDateTime) {
    let now = OffsetDateTime::now_utc();
    (now - CLOCK_SLACK, now + lasts)
}

#[cfg(test)]
mod tests {
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;
    use std::sync::Arc;

    use rustls::RootCertStore;
    use rustls::client::WebPkiServerVerifier;
    use rustls::client::danger::ServerCertVerifier;
    use rustls::pki_types::{ServerName, UnixTime};
    use x509_parser::prelude::{FromDer, X509Certificate};

    use super::{Authority, How, Issued, Kept, Subject};

    fn name(name: &str) -> Subject {
        Subject::Name(name.into())
    }

    /// Whether a client that trusts only the authority accepts the certificate for the host.
    fn accepted(authority: &Authority, issued: &Issued, host: &str) -> bool {
        let mut roots = RootCertStore::empty();
        roots
            .add(authority.certificate().clone())
            .expect("a certificate");
        let provider = Arc::new(rustls::crypto::ring::default_provider());
        let verifier = WebPkiServerVerifier::builder_with_provider(Arc::new(roots), provider)
            .build()
            .expect("a verifier");
        let host = ServerName::try_from(host.to_owned()).expect("a host");
        let (leaf, rest) = issued.chain.split_first().expect("a certificate");
        let verdict = verifier.verify_server_cert(leaf, rest, &host, &[], UnixTime::now());
        verdict.is_ok()
    }

    #[test]
    fn certificate_is_accepted_for_the_name_it_was_issued_for() {
        // Arrange
        let authority = Authority::create().expect("an authority").0;
        let issued = authority.issue(&name("raspberrypi.local")).expect("issues");

        // Act
        let hosts =
            ["raspberrypi.local", "example.com"].map(|host| accepted(&authority, &issued, host));

        // Assert
        assert_eq!(hosts, [true, false]);
    }

    #[test]
    fn certificate_is_accepted_for_the_address_it_was_issued_for() {
        // Arrange
        let authority = Authority::create().expect("an authority").0;
        let address = Subject::Address([192, 0, 2, 10].into()); // TEST-NET-1
        let issued = authority.issue(&address).expect("issues");

        // Act
        let hosts = ["192.0.2.10", "192.0.2.11"].map(|host| accepted(&authority, &issued, host));

        // Assert
        assert_eq!(hosts, [true, false]);
    }

    #[test]
    fn certificate_of_another_authority_is_refused() {
        // Arrange
        let authority = Authority::create().expect("an authority").0;
        let other = Authority::create().expect("an authority").0;
        let issued = other.issue(&name("raspberrypi.local")).expect("issues");

        // Act
        let accepted = accepted(&authority, &issued, "raspberrypi.local");

        // Assert
        assert!(!accepted);
    }

    /// Apple's: <https://support.apple.com/en-us/103769>.
    #[test]
    fn certificate_meets_what_ios_requires_of_a_server() {
        // Arrange
        let authority = Authority::create().expect("an authority").0;

        // Act
        let issued = authority.issue(&name("raspberrypi.local")).expect("issues");

        // Assert
        let (_, leaf) = X509Certificate::from_der(&issued.chain[0]).expect("a certificate");
        let validity = leaf.validity().time_to_expiration().expect("still valid");
        let usage = leaf
            .extended_key_usage()
            .expect("readable")
            .expect("present");
        assert!(validity.whole_days() <= 398);
        assert!(usage.value.server_auth);
        assert!(leaf.subject_alternative_name().expect("readable").is_some());
        assert!(!leaf.is_ca());
        assert_eq!(
            leaf.signature_algorithm.algorithm.to_id_string(),
            "1.2.840.10045.4.3.2"
        );
    }

    #[test]
    fn authority_may_sign_and_lasts_ten_years() {
        // Arrange
        let created = Authority::create();

        // Act
        let authority = created.expect("an authority").0;

        // Assert
        let (_, root) = X509Certificate::from_der(authority.certificate()).expect("a certificate");
        let validity = root.validity().time_to_expiration().expect("still valid");
        assert!(root.is_ca());
        assert!(
            root.key_usage()
                .expect("readable")
                .expect("present")
                .value
                .key_cert_sign()
        );
        assert!((3640..=3660).contains(&validity.whole_days()));
    }

    /// Where the server keeps its authority, in a directory of its own.
    struct Home {
        authority: PathBuf,
        _directory: tempfile::TempDir,
    }

    fn home() -> Home {
        let directory = tempfile::tempdir().expect("a directory");
        Home {
            authority: directory.path().join("papaquebec/authority"),
            _directory: directory,
        }
    }

    #[test]
    fn kept_authority_issues_what_the_original_vouches_for() {
        // Arrange
        let (
            original,
            Kept {
                certificate_pem,
                key_pem,
            },
        ) = Authority::create().expect("an authority");
        let read = Authority::from_pem(&certificate_pem, &key_pem).expect("reads");

        // Act
        let issued = read.issue(&name("raspberrypi.local")).expect("issues");

        // Assert
        assert!(accepted(&original, &issued, "raspberrypi.local"));
    }

    #[test]
    fn authority_that_cannot_be_used_is_refused() {
        // Arrange
        let (_, ours) = Authority::create().expect("an authority");
        let (_, others) = Authority::create().expect("an authority");
        let server = Authority::create().expect("an authority").0;
        let leaf = server.issue(&name("raspberrypi.local")).expect("issues");
        let leaf_pem = pem::encode(&pem::Pem::new("CERTIFICATE", leaf.chain[0].to_vec()));
        let cases = [
            (ours.certificate_pem.as_str(), others.key_pem.as_str()),
            (ours.certificate_pem.as_str(), "not a key"),
            ("not a certificate", ours.key_pem.as_str()),
            (leaf_pem.as_str(), ours.key_pem.as_str()),
        ];

        // Act
        let read = cases.map(|(certificate, key)| Authority::from_pem(certificate, key));

        // Assert
        assert!(read.iter().all(Result::is_err));
    }

    #[test]
    fn first_start_creates_an_authority_and_keeps_it() {
        // Arrange
        let home = home();

        // Act
        let opened = Authority::open(&home.authority);

        // Assert
        let opened = opened.expect("opens");
        let mode = std::fs::metadata(home.authority.join("root.key"))
            .expect("kept")
            .permissions()
            .mode();
        assert!(matches!(opened.how, How::Created));
        assert_eq!(mode & 0o777, 0o600);
        assert!(home.authority.join("root.crt").exists());
    }

    #[test]
    fn later_start_reads_the_authority_it_kept() {
        // Arrange
        let home = home();
        let first = Authority::open(&home.authority).expect("opens");

        // Act
        let second = Authority::open(&home.authority);

        // Assert
        let second = second.expect("opens");
        assert!(matches!(second.how, How::Kept));
        assert_eq!(
            second.authority.certificate(),
            first.authority.certificate()
        );
    }

    #[test]
    fn certificate_is_handed_out_as_pem() {
        // Arrange
        let authority = Authority::create().expect("an authority").0;

        // Act
        let written = authority.certificate_pem();

        // Assert
        let handed_out = pem::parse(&written).expect("pem");
        assert_eq!(handed_out.tag(), "CERTIFICATE");
        assert_eq!(handed_out.contents(), authority.certificate().as_ref());
        assert!(!written.contains('\r'), "lines end as they do on Unix");
    }
}
