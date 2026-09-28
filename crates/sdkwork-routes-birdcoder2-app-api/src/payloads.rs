//! Wire payloads of the mobile App API surface.
//!
//! Three separate vocabularies, on purpose:
//!
//! - **Query parameters** use `lower_snake_case` wire names
//!   (`PAGINATION_SPEC.md` section 0), so these structs carry no rename.
//! - **Request bodies and responses** use JSON `camelCase` (`API_SPEC.md`).
//! - **int64 values** (`API_SPEC.md` section 13.6) cross the wire as strings, so
//!   every timestamp, sequence, and counter below is a `String`. The domain
//!   keeps them numeric; only this boundary stringifies them.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use sdkwork_birdcoder2_host_runtime_service::{
    AgentEventRecord, AgentSessionRecord, AgentTurnRecord, EnrollmentRecord, HostLeaseRecord,
    HostPatch, HostPlatform, HostRecord, HostStatus,
};

/// `GET /app/v3/api/birdcoder/hosts` query.
#[derive(Debug, Default, Deserialize)]
pub struct HostListQuery {
    /// Opaque cursor returned by the previous page.
    pub cursor: Option<String>,
    /// Requested page size.
    pub page_size: Option<u32>,
}

/// `GET .../hosts/{hostId}/agent-sessions` query.
#[derive(Debug, Default, Deserialize)]
pub struct AgentSessionListQuery {
    /// Opaque cursor returned by the previous page.
    pub cursor: Option<String>,
    /// Requested page size.
    pub page_size: Option<u32>,
}

/// `GET .../agent-sessions/{sessionId}/turns` query.
#[derive(Debug, Default, Deserialize)]
pub struct AgentTurnListQuery {
    /// Opaque cursor returned by the previous page.
    pub cursor: Option<String>,
    /// Requested page size.
    pub page_size: Option<u32>,
}

/// `GET .../agent-sessions/{sessionId}/events` query.
///
/// The watermark is the caller's own last applied `sequence`; it is a resume
/// point, not an offset, so a client that fell behind never re-reads the
/// transcript from the start.
#[derive(Debug, Default, Deserialize)]
pub struct AgentEventListQuery {
    /// Return events whose `sequence` is strictly greater than this value.
    pub after_sequence: Option<i64>,
    /// Maximum number of events to return.
    pub limit: Option<u32>,
}

/// `POST /app/v3/api/birdcoder/host-enrollments` body.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostEnrollmentCreateRequest {
    /// Name the host receives before it first attaches.
    pub display_name: Option<String>,
    /// Machine kind the code is intended for.
    pub platform: Option<String>,
    /// Requested pairing-code lifetime in seconds.
    pub ttl_seconds: Option<i64>,
}

impl HostEnrollmentCreateRequest {
    /// Validates and converts the request into the domain input.
    ///
    /// # Errors
    ///
    /// Returns the platform error for an unknown platform value or an
    /// out-of-range lifetime.
    pub fn into_input(
        self,
    ) -> Result<
        sdkwork_birdcoder2_host_runtime_service::HostEnrollmentCreateInput,
        sdkwork_web_core::WebFrameworkError,
    > {
        let platform = match self.platform.as_deref() {
            None => None,
            Some(value) => Some(HostPlatform::parse(value.trim()).ok_or_else(|| {
                sdkwork_web_core::WebFrameworkError::bad_request(
                    "platform must be windows, linux, macos, docker, or cloud-sandbox",
                )
            })?),
        };
        Ok(sdkwork_birdcoder2_host_runtime_service::HostEnrollmentCreateInput {
            display_name: self.display_name,
            platform,
            ttl_seconds: self.ttl_seconds,
        })
    }
}

/// `PATCH /app/v3/api/birdcoder/hosts/{hostId}` body.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostUpdateRequest {
    /// Replacement display name.
    pub display_name: Option<String>,
    /// Replacement label set.
    pub labels: Option<Vec<String>>,
    /// Replacement administrative state: `offline` or `disabled`.
    pub status: Option<String>,
}

impl HostUpdateRequest {
    /// Validates and converts the request into the domain patch.
    ///
    /// # Errors
    ///
    /// Returns the platform error for an unknown status value.
    pub fn into_patch(
        self,
    ) -> Result<HostPatch, sdkwork_web_core::WebFrameworkError> {
        let status = match self.status.as_deref() {
            None => None,
            Some(value) => Some(HostStatus::parse(value.trim()).ok_or_else(|| {
                sdkwork_web_core::WebFrameworkError::bad_request(
                    "status must be offline or disabled",
                )
            })?),
        };
        Ok(HostPatch {
            display_name: self.display_name,
            labels: self.labels,
            status,
        })
    }
}

/// `POST .../hosts/{hostId}/agent-sessions` body.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionCreateRequest {
    /// Conversation title; the platform supplies one when omitted.
    pub title: Option<String>,
}

/// `PATCH .../agent-sessions/{sessionId}` body.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionUpdateRequest {
    /// Replacement conversation title.
    pub title: String,
}

/// `POST .../agent-sessions/{sessionId}/turns` body.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnCreateRequest {
    /// Prompt text the host runtime will hand to the agent.
    pub content: String,
}

/// A host as the mobile client sees it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostView {
    /// Host identifier.
    pub host_id: String,
    /// User-facing name.
    pub display_name: String,
    /// Machine kind.
    pub platform: HostPlatform,
    /// Operator labels.
    pub labels: Vec<String>,
    /// Version of the attached runtime, when one is attached.
    pub runtime_version: Option<String>,
    /// Reachability.
    pub status: HostStatus,
    /// Active lease identifier, when attached.
    pub lease_id: Option<String>,
    /// Lease expiry in epoch seconds.
    pub lease_expires_at: Option<String>,
    /// Last heartbeat in epoch seconds.
    pub last_seen_at: Option<String>,
    /// Creation instant in epoch seconds.
    pub created_at: String,
    /// Last mutation instant in epoch seconds.
    pub updated_at: String,
}

impl From<&HostRecord> for HostView {
    fn from(record: &HostRecord) -> Self {
        Self {
            host_id: record.host_id.clone(),
            display_name: record.display_name.clone(),
            platform: record.platform,
            labels: record.labels.clone(),
            runtime_version: record.runtime_version.clone(),
            status: record.status,
            lease_id: record.lease_id.clone(),
            lease_expires_at: record.lease_expires_at.map(|value| value.to_string()),
            last_seen_at: record.last_seen_at.map(|value| value.to_string()),
            created_at: record.created_at.to_string(),
            updated_at: record.updated_at.to_string(),
        }
    }
}

/// A pairing code as the mobile client sees it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostEnrollmentView {
    /// Enrollment identifier.
    pub enrollment_id: String,
    /// Host the code attaches.
    pub host_id: String,
    /// Pairing code to display and hand to the host runtime.
    pub code: String,
    /// Lifecycle state.
    pub status: sdkwork_birdcoder2_host_runtime_service::EnrollmentStatus,
    /// Expiry instant in epoch seconds.
    pub expires_at: String,
    /// Redemption instant in epoch seconds, when redeemed.
    pub redeemed_at: Option<String>,
    /// Creation instant in epoch seconds.
    pub created_at: String,
}

impl From<&EnrollmentRecord> for HostEnrollmentView {
    fn from(record: &EnrollmentRecord) -> Self {
        Self {
            enrollment_id: record.enrollment_id.clone(),
            host_id: record.host_id.clone(),
            code: record.code.clone(),
            status: record.status,
            expires_at: record.expires_at.to_string(),
            redeemed_at: record.redeemed_at.map(|value| value.to_string()),
            created_at: record.created_at.to_string(),
        }
    }
}

/// A host-runtime lease as the host sees it (internal surface reuses this view).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostLeaseView {
    /// Lease identifier the runtime presents on every call.
    pub lease_id: String,
    /// Host the lease belongs to.
    pub host_id: String,
    /// Expiry instant in epoch seconds.
    pub expires_at: String,
    /// Last heartbeat instant in epoch seconds.
    pub last_heartbeat_at: String,
}

impl From<&HostLeaseRecord> for HostLeaseView {
    fn from(record: &HostLeaseRecord) -> Self {
        Self {
            lease_id: record.lease_id.clone(),
            host_id: record.host_id.clone(),
            expires_at: record.expires_at.to_string(),
            last_heartbeat_at: record.last_heartbeat_at.to_string(),
        }
    }
}

/// An agent conversation as the mobile client sees it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionView {
    /// Session identifier.
    pub session_id: String,
    /// Host that runs the agent.
    pub host_id: String,
    /// Conversation title.
    pub title: String,
    /// Lifecycle state.
    pub status: sdkwork_birdcoder2_host_runtime_service::AgentSessionStatus,
    /// Creation instant in epoch seconds.
    pub created_at: String,
    /// Last activity instant in epoch seconds.
    pub last_activity_at: String,
}

impl From<&AgentSessionRecord> for AgentSessionView {
    fn from(record: &AgentSessionRecord) -> Self {
        Self {
            session_id: record.session_id.clone(),
            host_id: record.host_id.clone(),
            title: record.title.clone(),
            status: record.status,
            created_at: record.created_at.to_string(),
            last_activity_at: record.last_activity_at.to_string(),
        }
    }
}

/// One turn as the mobile client sees it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnView {
    /// Turn identifier.
    pub turn_id: String,
    /// Session the turn belongs to.
    pub session_id: String,
    /// Host that runs the turn.
    pub host_id: String,
    /// Monotonic position inside the session, from `1`.
    pub sequence: String,
    /// Who produced the turn.
    pub role: sdkwork_birdcoder2_host_runtime_service::AgentTurnRole,
    /// Prompt text, or assembled assistant text once finished.
    pub content: Option<String>,
    /// Delivery state.
    pub status: sdkwork_birdcoder2_host_runtime_service::AgentTurnStatus,
    /// Platform error code when the turn failed.
    pub error_code: Option<i32>,
    /// Operator-facing failure detail when the turn failed.
    pub error_message: Option<String>,
    /// Creation instant in epoch seconds.
    pub created_at: String,
    /// Last mutation instant in epoch seconds.
    pub updated_at: String,
}

impl From<&AgentTurnRecord> for AgentTurnView {
    fn from(record: &AgentTurnRecord) -> Self {
        Self {
            turn_id: record.turn_id.clone(),
            session_id: record.session_id.clone(),
            host_id: record.host_id.clone(),
            sequence: record.sequence.to_string(),
            role: record.role,
            content: record.content.clone(),
            status: record.status,
            error_code: record.error_code,
            error_message: record.error_message.clone(),
            created_at: record.created_at.to_string(),
            updated_at: record.updated_at.to_string(),
        }
    }
}

/// One agent event as the mobile client sees it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEventView {
    /// Event identifier.
    pub event_id: String,
    /// Session the event belongs to.
    pub session_id: String,
    /// Turn the event belongs to, when turn-scoped.
    pub turn_id: Option<String>,
    /// Monotonic position inside the session.
    pub sequence: String,
    /// Event kind.
    pub kind: sdkwork_birdcoder2_host_runtime_service::AgentEventKind,
    /// Kind-specific payload, passed through verbatim.
    pub payload: Value,
    /// Emission instant in epoch seconds.
    pub emitted_at: String,
}

impl From<&AgentEventRecord> for AgentEventView {
    fn from(record: &AgentEventRecord) -> Self {
        Self {
            event_id: record.event_id.clone(),
            session_id: record.session_id.clone(),
            turn_id: record.turn_id.clone(),
            sequence: record.sequence.to_string(),
            kind: record.kind,
            payload: record.payload.clone(),
            emitted_at: record.emitted_at.to_string(),
        }
    }
}
