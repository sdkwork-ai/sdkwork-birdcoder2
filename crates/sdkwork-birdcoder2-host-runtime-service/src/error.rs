//! Typed domain failures.
//!
//! Every variant maps to exactly one platform error code in the HTTP adapters
//! (`40001` validation, `40301` forbidden/shape mismatch, `40401` not found,
//! `40901` state conflict, `40902` expired credential). The domain never
//! carries an HTTP status or a wire envelope: the adapters own that mapping so
//! both surfaces stay consistent.

use thiserror::Error;

/// A domain failure raised by [`crate::HostRuntimeService`].
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum HostRuntimeError {
    /// The addressed record does not exist inside the caller's scope.
    #[error("{resource} {id} was not found")]
    NotFound {
        /// Record family, for example `host` or `agent session`.
        resource: &'static str,
        /// Identifier the caller addressed.
        id: String,
    },
    /// A request field is missing, empty, or outside its allowed bounds.
    #[error("{field}: {message}")]
    InvalidInput {
        /// Offending field name.
        field: &'static str,
        /// Why the value was rejected.
        message: String,
    },
    /// The pairing code is unknown, already redeemed, or revoked.
    #[error("host enrollment code is not redeemable")]
    EnrollmentNotRedeemable,
    /// The pairing code existed but expired.
    #[error("host enrollment {enrollment_id} expired at {expires_at}")]
    EnrollmentExpired {
        /// Expired enrollment identifier.
        enrollment_id: String,
        /// Expiry instant in epoch seconds.
        expires_at: i64,
    },
    /// The host is administratively disabled, so it may not run or be used.
    #[error("host {host_id} is disabled")]
    HostDisabled {
        /// Disabled host identifier.
        host_id: String,
    },
    /// The lease is unknown, closed, or past its expiry.
    #[error("host runtime lease {lease_id} is not active")]
    LeaseNotActive {
        /// Rejected lease identifier.
        lease_id: String,
    },
    /// The session is archived, so it accepts no new turn.
    #[error("agent session {session_id} is archived")]
    SessionArchived {
        /// Archived session identifier.
        session_id: String,
    },
    /// The turn is already finished and cannot transition again.
    #[error("agent turn {turn_id} cannot be cancelled from status {status}")]
    TurnNotCancellable {
        /// Turn identifier.
        turn_id: String,
        /// Status that blocked the transition.
        status: String,
    },
    /// A concurrent writer already advanced the same record.
    #[error("{message}")]
    Conflict {
        /// Conflict description.
        message: String,
    },
}

impl HostRuntimeError {
    /// Platform error code for this failure (`API_SPEC.md` section 15.3).
    #[must_use]
    pub const fn platform_code(&self) -> i32 {
        match self {
            Self::NotFound { .. } => 40401,
            Self::InvalidInput { .. } => 40001,
            Self::EnrollmentNotRedeemable => 40103,
            Self::EnrollmentExpired { .. } => 40902,
            Self::HostDisabled { .. } => 40301,
            Self::LeaseNotActive { .. } => 40902,
            Self::SessionArchived { .. } => 40901,
            Self::TurnNotCancellable { .. } => 40901,
            Self::Conflict { .. } => 40901,
        }
    }
}
