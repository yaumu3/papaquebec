//! What the server answers over HTTP.

use std::path::PathBuf;

use axum::Router;
use tower_http::compression::CompressionLayer;
use tower_http::services::ServeDir;

/// Where the files served are kept.
pub struct Places {
    /// The scope as built.
    pub dist: PathBuf,
    /// The map data generated around the receiver.
    pub map: PathBuf,
}

/// The scope's build, with the generated map data under `/map`, compressed for
/// whoever accepts it.
pub fn router(places: &Places) -> Router {
    Router::new()
        .nest_service("/map", ServeDir::new(&places.map))
        .fallback_service(ServeDir::new(&places.dist))
        .layer(CompressionLayer::new())
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::header::{ACCEPT_ENCODING, CONTENT_ENCODING, CONTENT_TYPE};
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use super::{Places, router};

    /// A build of the scope and generated map data, each in a directory of its own.
    struct Served {
        places: Places,
        _directory: tempfile::TempDir,
    }

    fn served() -> Served {
        let directory = tempfile::tempdir().expect("a directory");
        let places = Places {
            dist: directory.path().join("dist"),
            map: directory.path().join("public/map"),
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
            places,
            _directory: directory,
        }
    }

    struct Answer {
        status: StatusCode,
        content_type: Option<String>,
        encoding: Option<String>,
        body: Vec<u8>,
    }

    async fn get(served: &Served, path: &str, accept_encoding: Option<&str>) -> Answer {
        let mut request = Request::get(path);
        if let Some(encoding) = accept_encoding {
            request = request.header(ACCEPT_ENCODING, encoding);
        }
        let request = request.body(Body::empty()).expect("a request");
        let response = router(&served.places)
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
}
