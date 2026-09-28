//! Domain-to-wire error mapping for the mobile App API surface.
//!
//! The domain taxonomy is mapped exactly once, here, so no handler invents a
//! status and the two BirdCoder2 surfaces stay consistent (`API_SPEC.md`
//! section 17). Messages are client-safe: they never echo an identifier the
//! caller is not allowed to see.
//!
//! The mapping is a function rather than a `From` implementation because both
//! types are foreign to this crate; the orphan rule keeps the conversion where
//! the platform error contract is applied.

use sdkwork_birdcoder2_host_runtime_service::HostRuntimeError;
use sdkwork_web_core::WebFrameworkError;

/// Projects a domain failure onto the platform error contract.
///
/// The platform result code follows from the framework error the mapping picks,
/// so the domain's own numeric codes stay an implementation detail of the
/// service crate.
#[must_use]
pub fn to_framework_error(error: HostRuntimeError) -> WebFrameworkError {
    match error {
        HostRuntimeError::NotFound { .. } => {
            // Every lookup is scope-filtered, so "belongs to someone else" and
            // "does not exist" are indistinguishable on purpose.
            WebFrameworkError::not_found("the requested resource does not exist")
        }
        HostRuntimeError::InvalidInput { field, message } => {
            WebFrameworkError::bad_request(format!("{field} {message}"))
        }
        HostRuntimeError::HostDisabled { .. } => {
            WebFrameworkError::forbidden("this host is disabled; enable it before using it")
        }
        HostRuntimeError::SessionArchived { .. } => {
            WebFrameworkError::conflict("this conversation is archived and accepts no new turn")
        }
        HostRuntimeError::TurnNotCancellable { status, .. } => {
            WebFrameworkError::conflict(format!("the turn already finished with status {status}"))
        }
        HostRuntimeError::Conflict { message } => WebFrameworkError::conflict(message),
        HostRuntimeError::EnrollmentNotRedeemable => {
            WebFrameworkError::invalid_credentials("the pairing code is not redeemable")
        }
        HostRuntimeError::EnrollmentExpired { .. } => {
            WebFrameworkError::expired_credentials("the pairing code expired; issue a new one")
        }
        HostRuntimeError::LeaseNotActive { .. } => {
            WebFrameworkError::expired_credentials("the host runtime lease is not active")
        }
    }
}
