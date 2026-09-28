#![forbid(unsafe_code)]
//! BirdCoder2 multi-host runtime domain service.
//!
//! One SDKWork user owns zero or more *hosts*. A host is a machine or runtime
//! that runs exactly one `sdkwork-birdcoder2` instance and reaches the platform
//! through this service, never through an inbound port of its own:
//!
//! - Windows, Linux, and macOS hosts run the signed desktop/CLI instance.
//! - Docker hosts run the container image.
//! - Cloud hosts are `sdkwork-sandbox` instances.
//!
//! Because the mobile client cannot run the agent runtime itself, every host
//! connects outward to the platform and the platform relays the conversation:
//! the mobile App API enqueues turns, the host claims them over the Internal
//! API, and the host pushes the resulting agent events back for fan-out.
//!
//! Both HTTP surfaces are thin adapters over [`HostRuntimeService`]:
//! `sdkwork-routes-birdcoder2-app-api` (mobile, user-scoped) and
//! `sdkwork-routes-birdcoder2-internal-api` (host runtime, lease-scoped). This
//! crate owns the vocabulary, the lifecycle rules, and the transport-neutral
//! records; it owns no HTTP, no SQL, and no process state that outlives it.
//!
//! Storage: [`HostRuntimeService::new`] wires an in-memory store, which is the
//! standalone/test adapter. A SQLx-backed repository is the next increment; the
//! service API is already scoped by [`OwnerScope`] so the swap does not change
//! a single call site.

mod clock;
mod error;
mod model;
mod service;

pub use clock::unix_seconds;
pub use error::HostRuntimeError;
pub use model::{
    AgentEventKind, AgentEventRecord, AgentSessionRecord, AgentSessionStatus, AgentTurnRecord,
    AgentTurnRole, AgentTurnStatus, EnrollmentRecord, EnrollmentStatus, HostEnrollmentCreateInput,
    HostLeaseRecord, HostPatch, HostPlatform, HostRecord, HostStatus, OwnerScope, Page,
    AGENT_SESSION_TITLE_MAX_CHARS, DEFAULT_ENROLLMENT_TTL_SECONDS, DEFAULT_PAGE_SIZE,
    DEFAULT_TURN_CLAIM_LIMIT, HOST_LEASE_SECONDS, MAX_PAGE_SIZE, PAGE_CURSOR_MAX_CHARS,
};
pub use service::{
    host_status_changed_payload, AgentEventAppend, AgentEventAppendOutcome, HostEnrollmentOutcome,
    HostHelloInput, HostHelloOutcome, HostRuntimeConfig, HostRuntimeService,
    DEFAULT_HOST_LEASE_SECONDS,
};
