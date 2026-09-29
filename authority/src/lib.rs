//! A local certificate authority that vouches for the scope's own host.
//!
//! A browser shows the scope only in a secure context, and no public authority
//! vouches for a name like `raspberrypi.local`. So the server has its own, which
//! each device is told to trust once, and issues itself a certificate for
//! whatever name or address it is reached by.

use std::net::IpAddr;

use rcgen::{
    BasicConstraints, CertificateParams, DistinguishedName, DnType, ExtendedKeyUsagePurpose, IsCa,
    Issuer, KeyPair, KeyUsagePurpose, SanType,
};
use rustls_pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use time::{Duration, OffsetDateTime};

pub type Failure = Box<dyn std::error::Error + Send + Sync>;

/// Ten years, as the authority it may take over from has.
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

pub struct Authority {
    certificate: CertificateDer<'static>,
    issuer: Issuer<'static, KeyPair>,
}

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

    /// What a device is given to trust.
    #[must_use]
    pub fn certificate(&self) -> &CertificateDer<'static> {
        &self.certificate
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
    use std::sync::Arc;

    use rustls::RootCertStore;
    use rustls::client::WebPkiServerVerifier;
    use rustls::client::danger::ServerCertVerifier;
    use rustls::pki_types::{ServerName, UnixTime};
    use x509_parser::prelude::{FromDer, X509Certificate};

    use super::{Authority, Issued, Subject};

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
}
