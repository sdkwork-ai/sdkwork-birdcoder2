//! Transport-neutral domain records and inputs.
//!
//! JSON field names are camelCase (`API_SPEC.md`); query parameters are
//! lower_snake_case and therefore carry no rename. Enum values are kebab-case.
//! Nothing here knows about axum, SQL, or the envelope.

use serde::{Deserialize, Serialize};

/// Default page size for every cursor-paginated list.
pub const DEFAULT_PAGE_SIZE: u32 = 20;
/// Upper bound accepted for `page_size`.
pub const MAX_PAGE_SIZE: u32 = 100;
/// Default host-lease lifetime in seconds.
pub const HOST_LEASE_SECONDS: i64 = 90;
/// Default pairing-code lifetime in seconds (15 minutes).
pub const DEFAULT_ENROLLMENT_TTL_SECONDS: i64 = 900;
/// Maximum number of pending turns a host may claim in one request.
pub const DEFAULT_TURN_CLAIM_LIMIT: u32 = 8;
/// Longest accepted session title, in characters.
pub const AGENT_SESSION_TITLE_MAX_CHARS: usize = 120;
/// Longest accepted page cursor, in bytes.
pub const PAGE_CURSOR_MAX_CHARS: usize = 128;

/// Tenant/owner pair every user-scoped call is bound to.
///
/// The pair comes from the verified web request context, never from a
/// client-writable field, so no handler can be handed a foreign scope by its
/// caller.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OwnerScope {
    /// Verified tenant identifier.
    pub tenant_id: String,
    /// Verified user identifier inside the tenant.
    pub owner_id: String,
}

impl OwnerScope {
    /// Builds a scope from the verified principal.
    #[must_use]
    pub fn new(tenant_id: impl Into<String>, owner_id: impl Into<String>) -> Self {
        Self {
            tenant_id: tenant_id.into(),
            owner_id: owner_id.into(),
        }
    }
}

/// Kind of machine a host runtime executes on.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HostPlatform {
    /// Windows workstation or server.
    Windows,
    /// Linux workstation or server.
    Linux,
    /// macOS workstation.
    Macos,
    /// Container image host.
    Docker,
    /// Cloud `sdkwork-sandbox` instance.
    CloudSandbox,
}

impl HostPlatform {
    /// Parses a wire value, returning `None` for an unknown platform.
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "windows" => Some(Self::Windows),
            "linux" => Some(Self::Linux),
            "macos" => Some(Self::Macos),
            "docker" => Some(Self::Docker),
            "cloud-sandbox" => Some(Self::CloudSandbox),
            _ => None,
        }
    }

    /// Stable wire value.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Windows => "windows",
            Self::Linux => "linux",
            Self::Macos => "macos",
            Self::Docker => "docker",
            Self::CloudSandbox => "cloud-sandbox",
        }
    }
}

/// Reachability of a host, projected from its lease on every read.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HostStatus {
    /// Registered but no runtime has attached yet.
    Pending,
    /// A runtime holds a live lease.
    Online,
    /// The lease lapsed or was closed.
    Offline,
    /// An operator disabled the host; it is not selectable for conversation.
    Disabled,
}

impl HostStatus {
    /// Parses a wire value, returning `None` for an unknown status.
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "pending" => Some(Self::Pending),
            "online" => Some(Self::Online),
            "offline" => Some(Self::Offline),
            "disabled" => Some(Self::Disabled),
            _ => None,
        }
    }

    /// Stable wire value.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Online => "online",
            Self::Offline => "offline",
            Self::Disabled => "disabled",
        }
    }
}

/// Lifecycle of a pairing code.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EnrollmentStatus {
    /// Issued and waiting for a host runtime to redeem it.
    Active,
    /// Redeemed by a host runtime.
    Redeemed,
    /// Passed its expiry without redemption.
    Expired,
    /// Retired by the owner before redemption.
    Revoked,
}

/// Lifecycle of an agent conversation on one host.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentSessionStatus {
    /// Accepts new turns.
    Active,
    /// Read-only; accepts no new turn.
    Archived,
}

/// Who produced a turn.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentTurnRole {
    /// The mobile user.
    User,
    /// The agent running on the host.
    Assistant,
}

/// Delivery state of a turn.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentTurnStatus {
    /// Enqueued, not yet claimed by the host.
    Pending,
    /// Claimed by the host and running.
    Running,
    /// Finished successfully.
    Completed,
    /// Finished with an error.
    Failed,
    /// Cancelled before completion.
    Cancelled,
}

impl AgentTurnStatus {
    /// Stable wire value.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }

    /// Parses a wire value, returning `None` for an unknown status.
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "pending" => Some(Self::Pending),
            "running" => Some(Self::Running),
            "completed" => Some(Self::Completed),
            "failed" => Some(Self::Failed),
            "cancelled" => Some(Self::Cancelled),
            _ => None,
        }
    }

    /// Whether the turn reached a terminal state.
    #[must_use]
    pub const fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }
}

/// Kind of agent event a host runtime reports for a session.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentEventKind {
    /// The host accepted the turn and started the runtime.
    TurnStarted,
    /// Incremental assistant output.
    AssistantDelta,
    /// The assistant finished the turn.
    AssistantCompleted,
    /// A tool call started.
    ToolStarted,
    /// A tool call finished.
    ToolCompleted,
    /// The turn failed.
    TurnFailed,
    /// The turn was cancelled.
    TurnCancelled,
    /// The host's reachability changed.
    HostStatusChanged,
}

impl AgentEventKind {
    /// Stable wire value.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::TurnStarted => "turn-started",
            Self::AssistantDelta => "assistant-delta",
            Self::AssistantCompleted => "assistant-completed",
            Self::ToolStarted => "tool-started",
            Self::ToolCompleted => "tool-completed",
            Self::TurnFailed => "turn-failed",
            Self::TurnCancelled => "turn-cancelled",
            Self::HostStatusChanged => "host-status-changed",
        }
    }

    /// Parses a wire value, returning `None` for an unknown kind.
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "turn-started" => Some(Self::TurnStarted),
            "assistant-delta" => Some(Self::AssistantDelta),
            "assistant-completed" => Some(Self::AssistantCompleted),
            "tool-started" => Some(Self::ToolStarted),
            "tool-completed" => Some(Self::ToolCompleted),
            "turn-failed" => Some(Self::TurnFailed),
            "turn-cancelled" => Some(Self::TurnCancelled),
            "host-status-changed" => Some(Self::HostStatusChanged),
            _ => None,
        }
    }
}

/// A cursor page of records.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Page<T> {
    /// Page contents in stable order.
    pub items: Vec<T>,
    /// Cursor to pass back for the next page; `None` on the last page.
    pub next_cursor: Option<String>,
    /// Whether more records exist after this page.
    pub has_more: bool,
    /// Page size the service honoured.
    pub page_size: u32,
}

/// A registered host.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostRecord {
    /// Host identifier, stable for the host's lifetime.
    pub host_id: String,
    /// Owning tenant.
    pub tenant_id: String,
    /// Owning user.
    pub owner_id: String,
    /// User-facing name.
    pub display_name: String,
    /// Machine kind.
    pub platform: HostPlatform,
    /// Operator labels used for grouping.
    pub labels: Vec<String>,
    /// Version reported by the attached runtime, when one is attached.
    pub runtime_version: Option<String>,
    /// Reachability, projected from the lease on read.
    pub status: HostStatus,
    /// Active lease identifier, when a runtime is attached.
    pub lease_id: Option<String>,
    /// Lease expiry instant in epoch seconds.
    pub lease_expires_at: Option<i64>,
    /// Last heartbeat instant in epoch seconds.
    pub last_seen_at: Option<i64>,
    /// Creation instant in epoch seconds.
    pub created_at: i64,
    /// Last mutation instant in epoch seconds.
    pub updated_at: i64,
}

/// A pending or redeemed pairing code.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrollmentRecord {
    /// Enrollment identifier.
    pub enrollment_id: String,
    /// Host the enrollment will attach.
    pub host_id: String,
    /// Owning tenant.
    pub tenant_id: String,
    /// Owning user.
    pub owner_id: String,
    /// Human-transcribable pairing code.
    pub code: String,
    /// Lifecycle state.
    pub status: EnrollmentStatus,
    /// Expiry instant in epoch seconds.
    pub expires_at: i64,
    /// Redemption instant in epoch seconds, when redeemed.
    pub redeemed_at: Option<i64>,
    /// Creation instant in epoch seconds.
    pub created_at: i64,
}

/// A live host-runtime lease.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostLeaseRecord {
    /// Lease identifier the runtime presents on every call.
    pub lease_id: String,
    /// Host this lease belongs to.
    pub host_id: String,
    /// Expiry instant in epoch seconds.
    pub expires_at: i64,
    /// Last heartbeat instant in epoch seconds.
    pub last_heartbeat_at: i64,
}

/// An agent conversation bound to exactly one host.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionRecord {
    /// Session identifier.
    pub session_id: String,
    /// Owning tenant.
    pub tenant_id: String,
    /// Owning user.
    pub owner_id: String,
    /// Host that runs the agent.
    pub host_id: String,
    /// User-facing title.
    pub title: String,
    /// Lifecycle state.
    pub status: AgentSessionStatus,
    /// Creation instant in epoch seconds.
    pub created_at: i64,
    /// Last turn or event instant in epoch seconds.
    pub last_activity_at: i64,
}

/// One user or assistant turn inside a session.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnRecord {
    /// Turn identifier.
    pub turn_id: String,
    /// Session the turn belongs to.
    pub session_id: String,
    /// Host that runs the turn.
    pub host_id: String,
    /// Monotonic position inside the session, from `1`.
    pub sequence: i64,
    /// Who produced the turn.
    pub role: AgentTurnRole,
    /// Prompt text for a user turn, or assembled assistant text once finished.
    pub content: Option<String>,
    /// Delivery state.
    pub status: AgentTurnStatus,
    /// Platform error code when the turn failed.
    pub error_code: Option<i32>,
    /// Operator-facing failure detail when the turn failed.
    pub error_message: Option<String>,
    /// Creation instant in epoch seconds.
    pub created_at: i64,
    /// Last mutation instant in epoch seconds.
    pub updated_at: i64,
}

/// One ordered event a host runtime reported for a session.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEventRecord {
    /// Event identifier, unique per session.
    pub event_id: String,
    /// Session the event belongs to.
    pub session_id: String,
    /// Turn the event belongs to, when it is turn-scoped.
    pub turn_id: Option<String>,
    /// Monotonic position inside the session, starting after the last turn.
    pub sequence: i64,
    /// Event kind.
    pub kind: AgentEventKind,
    /// Kind-specific payload, passed through verbatim.
    pub payload: serde_json::Value,
    /// Emission instant in epoch seconds.
    pub emitted_at: i64,
}

/// Fields an owner may change on a host.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostPatch {
    /// Replacement display name.
    pub display_name: Option<String>,
    /// Replacement label set.
    pub labels: Option<Vec<String>>,
    /// Replacement administrative state; only `offline` and `disabled` are
    /// accepted, because `online` is lease-owned.
    pub status: Option<HostStatus>,
}

/// Input for creating a pairing code.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostEnrollmentCreateInput {
    /// Name the host receives before it first attaches.
    pub display_name: Option<String>,
    /// Machine kind the code is intended for.
    pub platform: Option<HostPlatform>,
    /// Requested lifetime in seconds; clamped to the platform bounds.
    pub ttl_seconds: Option<i64>,
}
