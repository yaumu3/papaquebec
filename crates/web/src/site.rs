//! What the server answers over HTTP.

use std::path::PathBuf;
use std::sync::Arc;

use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::routing::get;
use axum::{Json, Router};
use feeder::transport::Info;
use tower_http::compression::CompressionLayer;
use tower_http::services::ServeDir;

/// What the server has to serve.
pub struct Site {
    /// The scope as built.
    pub dist: PathBuf,
    /// The map data generated around the receiver.
    pub map: PathBuf,
    /// How the scope reaches the feed, asked each time as its certificate changes.
    pub feed: Arc<dyn Fn() -> Info + Send + Sync>,
    /// The certificate devices are given to trust, when the server has an authority.
    pub authority: Option<String>,
}

/// The scope's build, with the generated map data under `/map`, how to reach
/// the feed and the authority's certificate, compressed for whoever accepts it.
pub fn router(site: &Site) -> Router {
    let feed = Arc::clone(&site.feed);
    let info = move || async move { ([(CACHE_CONTROL, "no-store")], Json(feed())) };
    let mut router = Router::new().route("/feed/info.json", get(info));
    if let Some(certificate) = site.authority.clone() {
        let offer =
            move || async move { ([(CONTENT_TYPE, "application/x-x509-ca-cert")], certificate) };
        router = router.route("/root.crt", get(offer));
    }
    router
        .nest_service("/map", ServeDir::new(&site.map))
        .fallback_service(ServeDir::new(&site.dist))
        .layer(CompressionLayer::new())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use axum::body::Body;
    use axum::http::header::{ACCEPT_ENCODING, CACHE_CONTROL, CONTENT_ENCODING, CONTENT_TYPE};
    use axum::http::{Request, StatusCode};
    use feeder::transport::Info;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use super::{Site, router};

    /// A build of the scope and generated map data, each in a directory of its own.
    struct Served {
        site: Site,
        _directory: tempfile::TempDir,
    }

    fn info(certificate_hash: &str) -> Info {
        Info {
            port: 443,
            certificate_hash: certificate_hash.into(),
        }
    }

    fn served() -> Served {
        let directory = tempfile::tempdir().expect("a directory");
        let places = Site {
            dist: directory.path().join("dist"),
            map: directory.path().join("public/map"),
            feed: Arc::new(|| info("ab")),
            authority: Some("-----BEGIN CERTIFICATE-----\n".into()),
        };
        let script = format!("// the scope\n{}", "render();\n".repeat(64));
        for (path, contents) in [
            (
                places.dist.join("index.html"),
                "<!doctype html><title>scope</title>".to_owned(),
            ),
            (places.dist.join("assets/index.js"), script),
            (
                places.dist.join("map/stale.json"),
                r#"{"from":"dist"}"#.to_owned(),
            ),
            (
                places.map.join("coast.json"),
                r#"{"from":"map"}"#.to_owned(),
            ),
            (directory.path().join("secret.txt"), "outside".to_owned()),
        ] {
            std::fs::create_dir_all(path.parent().expect("a parent")).expect("a directory");
            std::fs::write(path, contents).expect("written");
        }
        Served {
            site: places,
            _directory: directory,
        }
    }

    struct Answer {
        status: StatusCode,
        content_type: Option<String>,
        encoding: Option<String>,
        cache_control: Option<String>,
        body: Vec<u8>,
    }

    async fn get(served: &Served, path: &str, accept_encoding: Option<&str>) -> Answer {
        let mut request = Request::get(path);
        if let Some(encoding) = accept_encoding {
            request = request.header(ACCEPT_ENCODING, encoding);
        }
        let request = request.body(Body::empty()).expect("a request");
        let response = router(&served.site)
            .oneshot(request)
            .await
            .expect("answers");
        let header = |name| {
            let value = response.headers().get(name)?.to_str().ok()?;
            Some(value.to_owned())
        };
        Answer {
            status: response.status(),
            content_type: header(CONTENT_TYPE),
            encoding: header(CONTENT_ENCODING),
            cache_control: header(CACHE_CONTROL),
            body: response
                .into_body()
                .collect()
                .await
                .expect("a body")
                .to_bytes()
                .to_vec(),
        }
    }

    #[tokio::test]
    async fn root_is_the_scope_s_page() {
        // Arrange
        let served = served();

        // Act
        let answer = get(&served, "/", None).await;

        // Assert
        assert_eq!(answer.status, StatusCode::OK);
        assert_eq!(answer.content_type.as_deref(), Some("text/html"));
        assert_eq!(answer.body, b"<!doctype html><title>scope</title>");
    }

    #[tokio::test]
    async fn files_of_the_build_are_served_compressed_when_asked() {
        // Arrange
        let served = served();

        // Act
        let answers = [
            get(&served, "/assets/index.js", Some("gzip")).await,
            get(&served, "/assets/index.js", None).await,
        ];

        // Assert
        let [compressed, plain] = answers;
        assert_eq!(compressed.encoding.as_deref(), Some("gzip"));
        assert_eq!(plain.encoding, None);
        assert_eq!(plain.content_type.as_deref(), Some("text/javascript"));
        assert!(compressed.body.len() < plain.body.len());
    }

    #[tokio::test]
    async fn map_data_comes_from_where_it_is_generated() {
        // Arrange
        let served = served();

        // Act
        let answers = [
            get(&served, "/map/coast.json", None).await,
            get(&served, "/map/stale.json", None).await,
        ];

        // Assert
        let [generated, built] = answers;
        assert_eq!(generated.body, br#"{"from":"map"}"#);
        assert_eq!(built.status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn nothing_outside_is_served() {
        // Arrange
        let served = served();
        let paths = [
            "/missing.js",
            "/../secret.txt",
            "/assets/../../secret.txt",
            "/map/../../secret.txt",
            "/%2e%2e/secret.txt",
            "/%252e%252e/secret.txt",
            "/map/%252e%252e/%252e%252e/secret.txt",
        ];

        // Act
        let mut statuses = Vec::new();
        for path in paths {
            statuses.push(get(&served, path, None).await.status);
        }

        // Assert
        assert!(
            statuses
                .iter()
                .all(|status| *status == StatusCode::NOT_FOUND),
            "{statuses:?}"
        );
    }

    #[tokio::test]
    async fn feed_info_is_answered_as_it_stands_and_not_to_be_kept() {
        // Arrange
        let hash = Arc::new(Mutex::new("ab"));
        let renewed = Arc::clone(&hash);
        let mut served = served();
        served.site.feed = Arc::new(move || info(&hash.lock().expect("a hash")));
        let before = get(&served, "/feed/info.json", None).await;
        *renewed.lock().expect("a hash") = "cd";

        // Act
        let after = get(&served, "/feed/info.json", None).await;

        // Assert
        assert_eq!(before.body, br#"{"port":443,"certificateHash":"ab"}"#);
        assert_eq!(after.body, br#"{"port":443,"certificateHash":"cd"}"#);
        assert_eq!(after.content_type.as_deref(), Some("application/json"));
        assert_eq!(after.cache_control.as_deref(), Some("no-store"));
    }

    #[tokio::test]
    async fn authority_s_certificate_is_offered_for_trusting() {
        // Arrange
        let served = served();

        // Act
        let answer = get(&served, "/root.crt", None).await;

        // Assert
        assert_eq!(answer.status, StatusCode::OK);
        assert_eq!(
            answer.content_type.as_deref(),
            Some("application/x-x509-ca-cert")
        );
        assert_eq!(answer.body, b"-----BEGIN CERTIFICATE-----\n");
    }

    #[tokio::test]
    async fn there_is_no_certificate_without_an_authority() {
        // Arrange
        let mut served = served();
        served.site.authority = None;

        // Act
        let answer = get(&served, "/root.crt", None).await;

        // Assert
        assert_eq!(answer.status, StatusCode::NOT_FOUND);
    }
}
