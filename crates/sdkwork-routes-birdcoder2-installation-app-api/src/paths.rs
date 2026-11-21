//! Wire paths of the BirdCoder2 installation App API surface.
//!
//! The static segment is `lower_snake_case` and the path parameter vocabulary is
//! `lowerCamelCase` (`API_SPEC.md` section 5.1). This surface has no path
//! parameters: the installation is the caller's own, resolved from the verified
//! access token rather than addressed in the URL.

/// `GET` — the application identity the presented access token names.
pub const INSTALLATION_PATH: &str = "/app/v3/api/installation";
