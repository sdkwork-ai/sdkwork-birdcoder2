//! Domain-to-wire error mapping for the host-runtime Internal API surface.
//!
//! The domain taxonomy is mapped exactly once, here. A stale or unknown lease
//! is reported as expired credentials rather than as a conflict, because the
//! runtime's remedy is to re-attach, not to retry the same call.

use sdkwork_birdcoder2_host_runtime_service::HostRuntimeError;
use sdkwork_web_core::WebFrameworkError;

/// Projects a domain failure onto the platform error contract.
#[must_use]
pub fn to_framework_error(error: HostRuntimeError) -> WebFrameworkError {
    match error {
        HostRuntimeError::NotFound { .. } => {
            WebFrameworkError::not_found("the requested host resource does not exist")
        }
        HostRuntimeError::InvalidInput { field, message } => {
            WebFrameworkError::bad_request(format!("{field} {message}"))
        }
        HostRuntimeError::HostDisabled { .. } => {
            WebFrameworkError::forbidden("this host is disabled and may not attach a runtime")
        }
        HostRuntimeError::SessionArchived { .. } => {
            WebFrameworkError::conflict("this conversation is archived and accepts no new event")
        }
        HostRuntimeError::TurnNotCancellable { status, .. } => {
            WebFrameworkError::conflict(format!("the turn already finished with status {status}"))
        }
        HostRuntimeError::Conflict { message } => WebFrameworkError::conflict(message),
        HostRuntimeError::EnrollmentNotRedeemable => {
            WebFrameworkError::invalid_credentials("the pairing code is not redeemable")
        }
        HostRuntimeError::EnrollmentExpired { .. } => WebFrameworkError::expired_credentials(
            "the pairing code expired; issue a new one from the mobile client",
        ),
        HostRuntimeError::LeaseNotActive { .. } => WebFrameworkError::expired_credentials(
            "the host runtime lease is not active; re-attach with a fresh pairing code",
        ),
    }
}
