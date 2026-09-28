//! Wire payloads of the host-runtime Internal API surface.
//!
//! Bodies and responses use JSON `camelCase`; int64 values cross as strings
//! (`API_SPEC.md` section 13.6). The lease identifier travels in the body rather
//! than in the path or the query string so it never lands in an access log.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use sdkwork_birdcoder2_host_runtime_service::{
    AgentEventAppend, AgentEventKind, AgentEventRecord, AgentSessionRecord, AgentTurnRecord,
    HostLeaseRecord, HostPlatform, HostRecord, HostStatus,
};

/// `POST .../host-runtimes/hello` body.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostRuntimeHelloRequest {
    /// Pairing code the owner displayed in the mobile client.
    pub code: String,
    /// Machine kind the runtime detected.
    pub platform: String,
    /// Version of the running `sdkwork-birdcoder2` instance.
    pub runtime_version: Option<String>,
    /// Override for the name the pair code was issued with.
    pub display_name: Option<String>,
    /// Labels the runtime reports for grouping.
    pub labels: Option<Vec<String>>,
}

impl HostRuntimeHelloRequest {
    /// Validates and converts the body into the domain input.
    ///
    /// # Errors
    ///
    /// Returns a bad-request error for an unknown platform value.
    pub fn into_input(
        self,
    ) -> Result<sdkwork_birdcoder2_host_runtime_service::HostHelloInput, sdkwork_web_core::WebFrameworkError>
    {
        let platform = HostPlatform::parse(self.platform.trim()).ok_or_else(|| {
            sdkwork_web_core::WebFrameworkError::bad_request(
                "platform must be windows, linux, macos, docker, or cloud-sandbox",
            )
        })?;
        Ok(sdkwork_birdcoder2_host_runtime_service::HostHelloInput {
            code: self.code,
            platform,
            runtime_version: self.runtime_version,
            display_name: self.display_name,
            labels: self.labels.unwrap_or_default(),
        })
    }
}

/// `POST .../host-runtimes/heartbeat` and `.../close` body.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostLeaseRequest {
    /// Lease the runtime holds.
    pub lease_id: String,
}

/// `POST .../host-runtimes/turn-claims` body.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnClaimRequest {
    /// Lease the runtime holds.
    pub lease_id: String,
    /// Maximum number of turns to claim.
    pub limit: Option<u32>,
}

/// `POST .../host-runtimes/agent-events` body.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEventReportRequest {
    /// Lease the runtime holds.
    pub lease_id: String,
    /// Conversation the events belong to.
    pub session_id: String,
    /// Events to store in report order.
    pub events: Vec<AgentEventReportItem>,
}

/// One reported event.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEventReportItem {
    /// Turn the event belongs to, when turn-scoped.
    pub turn_id: Option<String>,
    /// Event kind in its kebab-case wire spelling.
    pub kind: String,
    /// Kind-specific payload, passed through verbatim.
    pub payload: Option<Value>,
}

impl AgentEventReportItem {
    /// Converts one reported event into the domain input.
    ///
    /// # Errors
    ///
    /// Returns a bad-request error for an unknown event kind.
    pub fn into_append(self) -> Result<AgentEventAppend, sdkwork_web_core::WebFrameworkError> {
        let kind = AgentEventKind::parse(self.kind.trim()).ok_or_else(|| {
            sdkwork_web_core::WebFrameworkError::bad_request(format!(
                "kind {} is not a supported agent event kind",
                self.kind
            ))
        })?;
        Ok(AgentEventAppend {
            turn_id: self.turn_id,
            kind,
            payload: self.payload.unwrap_or(Value::Null),
        })
    }
}

impl AgentEventReportRequest {
    /// Converts the reported events into domain inputs.
    ///
    /// # Errors
    ///
    /// Returns a bad-request error for an empty report or an unknown kind.
    pub fn into_appends(
        self,
    ) -> Result<(String, String, Vec<AgentEventAppend>), sdkwork_web_core::WebFrameworkError> {
        if self.events.is_empty() {
            return Err(sdkwork_web_core::WebFrameworkError::bad_request(
                "events must contain at least one event",
            ));
        }
        let mut appends = Vec::with_capacity(self.events.len());
        for item in self.events {
            appends.push(item.into_append()?);
        }
        Ok((self.lease_id, self.session_id, appends))
    }
}

/// The host as its own runtime sees it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostRuntimeView {
    /// Host identifier.
    pub host_id: String,
    /// User-facing name.
    pub display_name: String,
    /// Machine kind.
    pub platform: HostPlatform,
    /// Version of the attached runtime.
    pub runtime_version: Option<String>,
    /// Reachability.
    pub status: HostStatus,
    /// Last heartbeat in epoch seconds.
    pub last_seen_at: Option<String>,
}

impl From<&HostRecord> for HostRuntimeView {
    fn from(record: &HostRecord) -> Self {
        Self {
            host_id: record.host_id.clone(),
            display_name: record.display_name.clone(),
            platform: record.platform,
            runtime_version: record.runtime_version.clone(),
            status: record.status,
            last_seen_at: record.last_seen_at.map(|value| value.to_string()),
        }
    }
}

/// A lease as its own runtime sees it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostLeaseView {
    /// Lease identifier.
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

/// `hostRuntimes.hello` result.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostRuntimeHelloView {
    /// The attached host.
    pub host: HostRuntimeView,
    /// The lease to present on every subsequent call.
    pub lease: HostLeaseView,
    /// How often the runtime should heartbeat, in seconds.
    pub heartbeat_interval_seconds: String,
}

impl HostRuntimeHelloView {
    /// Assembles the attach result, projecting the domain records.
    #[must_use]
    pub fn new(host: &HostRecord, lease: &HostLeaseRecord, heartbeat_interval_seconds: i64) -> Self {
        Self {
            host: HostRuntimeView::from(host),
            lease: HostLeaseView::from(lease),
            heartbeat_interval_seconds: heartbeat_interval_seconds.to_string(),
        }
    }
}

/// `hostRuntimes.close` result.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostRuntimeCloseView {
    /// Lease that was closed.
    pub lease_id: String,
    /// Always `true`: the surface reports a close only after it closed one.
    pub closed: bool,
}

impl HostRuntimeCloseView {
    /// Reports a lease that was closed by this call.
    #[must_use]
    pub fn closed(lease_id: String) -> Self {
        Self {
            lease_id,
            closed: true,
        }
    }
}

/// A turn as the running host sees it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnView {
    /// Turn identifier.
    pub turn_id: String,
    /// Conversation the turn belongs to.
    pub session_id: String,
    /// Monotonic position inside the conversation.
    pub sequence: String,
    /// Who produced the turn.
    pub role: sdkwork_birdcoder2_host_runtime_service::AgentTurnRole,
    /// Prompt text to hand to the agent.
    pub content: Option<String>,
    /// Delivery state.
    pub status: sdkwork_birdcoder2_host_runtime_service::AgentTurnStatus,
    /// Creation instant in epoch seconds.
    pub created_at: String,
}

impl From<&AgentTurnRecord> for AgentTurnView {
    fn from(record: &AgentTurnRecord) -> Self {
        Self {
            turn_id: record.turn_id.clone(),
            session_id: record.session_id.clone(),
            sequence: record.sequence.to_string(),
            role: record.role,
            content: record.content.clone(),
            status: record.status,
            created_at: record.created_at.to_string(),
        }
    }
}

/// `turnClaims.create` result.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnClaimView {
    /// Turns this runtime now owns.
    pub turns: Vec<AgentTurnView>,
}

impl From<&[AgentTurnRecord]> for TurnClaimView {
    fn from(turns: &[AgentTurnRecord]) -> Self {
        Self {
            turns: turns.iter().map(AgentTurnView::from).collect(),
        }
    }
}

/// An event as the running host sees it after storage.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEventView {
    /// Event identifier.
    pub event_id: String,
    /// Conversation the event belongs to.
    pub session_id: String,
    /// Turn the event belongs to, when turn-scoped.
    pub turn_id: Option<String>,
    /// Monotonic position inside the conversation.
    pub sequence: String,
    /// Event kind.
    pub kind: AgentEventKind,
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

/// The conversation an event report landed in, as the host sees it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEventReportView {
    /// Conversation identifier.
    pub session_id: String,
    /// Conversation title, so the runtime can label its own logs.
    pub session_title: String,
    /// Stored events, in assigned order.
    pub events: Vec<AgentEventView>,
}

impl AgentEventReportView {
    /// Builds the report result from the stored events and their conversation.
    #[must_use]
    pub fn new(session: &AgentSessionRecord, events: &[AgentEventRecord]) -> Self {
        Self {
            session_id: session.session_id.clone(),
            session_title: session.title.clone(),
            events: events.iter().map(AgentEventView::from).collect(),
        }
    }
}
