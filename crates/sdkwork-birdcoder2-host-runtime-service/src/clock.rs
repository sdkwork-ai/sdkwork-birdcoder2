//! Wall-clock access.
//!
//! Every timestamp the domain exposes is an int64 of Unix epoch seconds, which
//! is the platform's int64 wire representation, so the domain layer never
//! formats a calendar string and never takes a timezone dependency.

use std::time::{SystemTime, UNIX_EPOCH};

/// Seconds since the Unix epoch, saturating instead of panicking.
#[must_use]
pub fn unix_seconds() -> i64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => i64::try_from(duration.as_secs()).unwrap_or(i64::MAX),
        Err(_) => 0,
    }
}
