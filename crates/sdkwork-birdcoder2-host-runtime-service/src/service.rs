//! The host-runtime service: registry, lease lifecycle, and conversation relay.
//!
//! Every method is scoped either by [`OwnerScope`] (mobile, user-owned records)
//! or by a lease identifier (host runtime, host-owned records). No method
//! accepts an unscoped identifier, so a caller cannot address a foreign tenant's
//! host by guessing an id.
//!
//! The methods are `async` because the production adapter is a database-backed
//! repository; this crate wires an in-memory store whose critical sections are
//! synchronous and never held across an `await`.

use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{RwLock, RwLockReadGuard, RwLockWriteGuard};

use serde_json::{json, Map, Value};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::clock::unix_seconds;
use crate::error::HostRuntimeError;
use crate::model::{
    AgentEventKind, AgentEventRecord, AgentSessionRecord, AgentSessionStatus, AgentTurnRecord,
    AgentTurnRole, AgentTurnStatus, EnrollmentRecord, EnrollmentStatus, HostEnrollmentCreateInput,
    HostLeaseRecord, HostPatch, HostPlatform, HostRecord, HostStatus, OwnerScope, Page,
    AGENT_SESSION_TITLE_MAX_CHARS, DEFAULT_ENROLLMENT_TTL_SECONDS, DEFAULT_PAGE_SIZE,
    DEFAULT_TURN_CLAIM_LIMIT, HOST_LEASE_SECONDS, MAX_PAGE_SIZE, PAGE_CURSOR_MAX_CHARS,
};

/// Tunables of a service instance.
#[derive(Clone, Copy, Debug)]
pub struct HostRuntimeConfig {
    /// Lifetime granted to a host-runtime lease, in seconds.
    pub host_lease_seconds: i64,
    /// Default pairing-code lifetime, in seconds.
    pub default_enrollment_ttl_seconds: i64,
    /// Per-session event fan-out buffer.
    pub event_fanout_capacity: usize,
}

impl Default for HostRuntimeConfig {
    fn default() -> Self {
        Self {
            host_lease_seconds: HOST_LEASE_SECONDS,
            default_enrollment_ttl_seconds: DEFAULT_ENROLLMENT_TTL_SECONDS,
            event_fanout_capacity: 256,
        }
    }
}

/// Lifetime granted to a host-runtime lease when no configuration is supplied.
pub const DEFAULT_HOST_LEASE_SECONDS: i64 = HOST_LEASE_SECONDS;

/// What a host runtime sends when it attaches with a pairing code.
#[derive(Clone, Debug)]
pub struct HostHelloInput {
    /// Pairing code the owner displayed on the mobile client.
    pub code: String,
    /// Machine kind the runtime detected.
    pub platform: HostPlatform,
    /// Version string of the running `sdkwork-birdcoder2` instance.
    pub runtime_version: Option<String>,
    /// Override for the pre-assigned host name.
    pub display_name: Option<String>,
    /// Labels the runtime reports for grouping.
    pub labels: Vec<String>,
}

/// Result of creating a pairing code.
#[derive(Clone, Debug)]
pub struct HostEnrollmentOutcome {
    /// Issued pairing code.
    pub enrollment: EnrollmentRecord,
    /// Pending host the code will attach.
    pub host: HostRecord,
}

/// Result of a successful host-runtime attach.
#[derive(Clone, Debug)]
pub struct HostHelloOutcome {
    /// Host that was attached.
    pub host: HostRecord,
    /// Lease the runtime must present on every subsequent call.
    pub lease: HostLeaseRecord,
}

/// One event a host runtime reports for a session.
#[derive(Clone, Debug)]
pub struct AgentEventAppend {
    /// Turn the event belongs to, when turn-scoped.
    pub turn_id: Option<String>,
    /// Event kind.
    pub kind: AgentEventKind,
    /// Kind-specific payload, passed through verbatim.
    pub payload: Value,
}

/// Outcome of appending a batch of host-reported events.
#[derive(Clone, Debug)]
pub struct AgentEventAppendOutcome {
    /// Events as stored, in the order they were assigned.
    pub events: Vec<AgentEventRecord>,
    /// Session the events landed in.
    pub session: AgentSessionRecord,
}

#[derive(Default)]
struct Store {
    hosts: HashMap<String, HostRecord>,
    enrollments: HashMap<String, EnrollmentRecord>,
    leases: HashMap<String, HostLeaseRecord>,
    sessions: HashMap<String, AgentSessionRecord>,
    turns: HashMap<String, AgentTurnRecord>,
    events: HashMap<String, Vec<AgentEventRecord>>,
    /// Highest sequence handed out per session; shared by turns and events so a
    /// client can resume a stream from a single watermark.
    sequences: HashMap<String, i64>,
    fanout: HashMap<String, broadcast::Sender<AgentEventRecord>>,
}

/// Multi-host registry, lease lifecycle, and agent conversation relay.
pub struct HostRuntimeService {
    store: RwLock<Store>,
    config: HostRuntimeConfig,
    clock_offset_seconds: AtomicI64,
}

impl HostRuntimeService {
    /// Builds a service with the default configuration and an in-memory store.
    #[must_use]
    pub fn new() -> Self {
        Self::with_config(HostRuntimeConfig::default())
    }

    /// Builds a service with an explicit configuration.
    #[must_use]
    pub fn with_config(config: HostRuntimeConfig) -> Self {
        Self {
            store: RwLock::new(Store::default()),
            config,
            clock_offset_seconds: AtomicI64::new(0),
        }
    }

    /// Shifts this instance's clock forward.
    ///
    /// A test seam: lease and pairing-code expiry are otherwise only observable
    /// by waiting out the real lifetime.
    pub fn set_clock_offset_seconds(&self, offset: i64) {
        self.clock_offset_seconds.store(offset, Ordering::SeqCst);
    }

    /// How often a host runtime must heartbeat to keep its lease alive.
    ///
    /// One third of the granted lease, so two consecutive heartbeats may be lost
    /// before the lease lapses. The runtime is told this value when it attaches;
    /// it is the domain that owns the policy, not the wire surface.
    #[must_use]
    pub fn heartbeat_interval_seconds(&self) -> i64 {
        (self.config.host_lease_seconds / 3).clamp(5, 600)
    }

    // ---------------------------------------------------------------- hosts

    /// Lists the owner's hosts, newest first, cursor-paginated.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::InvalidInput`] for an over-long cursor.
    pub async fn list_hosts(
        &self,
        scope: &OwnerScope,
        cursor: Option<&str>,
        page_size: Option<u32>,
    ) -> Result<Page<HostRecord>, HostRuntimeError> {
        validate_cursor(cursor)?;
        let page_size = normalize_page_size(page_size);
        let now = self.now();

        let mut store = self.write_store();
        let mut hosts: Vec<HostRecord> = store
            .hosts
            .values_mut()
            .filter(|host| host.tenant_id == scope.tenant_id && host.owner_id == scope.owner_id)
            .map(|host| {
                project_host(host, now);
                host.clone()
            })
            .collect();
        hosts.sort_by(|left, right| {
            right
                .created_at
                .cmp(&left.created_at)
                .then_with(|| left.host_id.cmp(&right.host_id))
        });
        Ok(paginate(hosts, cursor, page_size, |host| host.host_id.clone()))
    }

    /// Reads one host inside the caller's scope.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::NotFound`] when the host is absent or owned
    /// by another scope.
    pub async fn retrieve_host(
        &self,
        scope: &OwnerScope,
        host_id: &str,
    ) -> Result<HostRecord, HostRuntimeError> {
        let now = self.now();
        let mut store = self.write_store();
        let host = store
            .hosts
            .get_mut(host_id)
            .filter(|host| host.tenant_id == scope.tenant_id && host.owner_id == scope.owner_id)
            .ok_or_else(|| HostRuntimeError::NotFound {
                resource: "host",
                id: host_id.to_owned(),
            })?;
        project_host(host, now);
        Ok(host.clone())
    }

    /// Applies an owner-supplied patch to a host.
    ///
    /// `status` may only move between `offline` and `disabled`: `online` is
    /// owned by the lease lifecycle, and `pending` belongs to enrollment.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::NotFound`] or
    /// [`HostRuntimeError::InvalidInput`].
    pub async fn update_host(
        &self,
        scope: &OwnerScope,
        host_id: &str,
        patch: &HostPatch,
    ) -> Result<HostRecord, HostRuntimeError> {
        let now = self.now();
        let mut store = self.write_store();
        let host = store
            .hosts
            .get_mut(host_id)
            .filter(|host| host.tenant_id == scope.tenant_id && host.owner_id == scope.owner_id)
            .ok_or_else(|| HostRuntimeError::NotFound {
                resource: "host",
                id: host_id.to_owned(),
            })?;
        project_host(host, now);

        if let Some(display_name) = patch.display_name.as_deref() {
            host.display_name = require_name("displayName", display_name)?;
        }
        if let Some(labels) = patch.labels.as_ref() {
            host.labels = normalize_labels(labels)?;
        }
        if let Some(status) = patch.status {
            match status {
                HostStatus::Offline | HostStatus::Disabled => {
                    host.status = status;
                    if status == HostStatus::Disabled {
                        host.lease_id = None;
                        host.lease_expires_at = None;
                    }
                }
                HostStatus::Online | HostStatus::Pending => {
                    return Err(HostRuntimeError::InvalidInput {
                        field: "status",
                        message: format!(
                            "{} is owned by the runtime lifecycle and cannot be set directly",
                            status.as_str()
                        ),
                    });
                }
            }
        }
        host.updated_at = now;
        Ok(host.clone())
    }

    /// Retires a host and every lease and session under it.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::NotFound`] when the host is outside the
    /// caller's scope.
    pub async fn delete_host(
        &self,
        scope: &OwnerScope,
        host_id: &str,
    ) -> Result<(), HostRuntimeError> {
        let mut store = self.write_store();
        let owned = store
            .hosts
            .get(host_id)
            .is_some_and(|host| host.tenant_id == scope.tenant_id && host.owner_id == scope.owner_id);
        if !owned {
            return Err(HostRuntimeError::NotFound {
                resource: "host",
                id: host_id.to_owned(),
            });
        }
        store.hosts.remove(host_id);
        store.leases.retain(|_, lease| lease.host_id != host_id);
        let retired_sessions: Vec<String> = store
            .sessions
            .values()
            .filter(|session| session.host_id == host_id)
            .map(|session| session.session_id.clone())
            .collect();
        for session_id in retired_sessions {
            store.sessions.remove(&session_id);
            store.turns.retain(|_, turn| turn.session_id != session_id);
            store.events.remove(&session_id);
            store.sequences.remove(&session_id);
            store.fanout.remove(&session_id);
        }
        store.enrollments.retain(|_, enrollment| enrollment.host_id != host_id);
        Ok(())
    }

    /// Issues a pairing code and the pending host it attaches.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::InvalidInput`] for a name or TTL outside the
    /// accepted bounds.
    pub async fn create_host_enrollment(
        &self,
        scope: &OwnerScope,
        input: &HostEnrollmentCreateInput,
    ) -> Result<HostEnrollmentOutcome, HostRuntimeError> {
        let now = self.now();
        let display_name = match input.display_name.as_deref() {
            Some(value) => require_name("displayName", value)?,
            None => "BirdCoder host".to_owned(),
        };
        let ttl = clamp_ttl(
            input.ttl_seconds,
            self.config.default_enrollment_ttl_seconds,
        )?;

        let host_id = new_id("host");
        let enrollment_id = new_id("enr");
        let host = HostRecord {
            host_id: host_id.clone(),
            tenant_id: scope.tenant_id.clone(),
            owner_id: scope.owner_id.clone(),
            display_name,
            platform: input.platform.unwrap_or(HostPlatform::Linux),
            labels: Vec::new(),
            runtime_version: None,
            status: HostStatus::Pending,
            lease_id: None,
            lease_expires_at: None,
            last_seen_at: None,
            created_at: now,
            updated_at: now,
        };
        let enrollment = EnrollmentRecord {
            enrollment_id: enrollment_id.clone(),
            host_id: host_id.clone(),
            tenant_id: scope.tenant_id.clone(),
            owner_id: scope.owner_id.clone(),
            code: new_pairing_code(),
            status: EnrollmentStatus::Active,
            expires_at: now.saturating_add(ttl),
            redeemed_at: None,
            created_at: now,
        };

        let mut store = self.write_store();
        store.hosts.insert(host_id, host.clone());
        store.enrollments.insert(enrollment_id, enrollment.clone());
        Ok(HostEnrollmentOutcome { enrollment, host })
    }

    // ---------------------------------------------------------- host runtime

    /// Redeems a pairing code and attaches a host runtime.
    ///
    /// The operation is idempotent for a runtime that retries with the same
    /// code: a redeemed code that already produced a live lease returns that
    /// lease instead of failing.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::EnrollmentExpired`],
    /// [`HostRuntimeError::EnrollmentNotRedeemable`], or
    /// [`HostRuntimeError::HostDisabled`].
    pub async fn hello_host_runtime(
        &self,
        input: &HostHelloInput,
    ) -> Result<HostHelloOutcome, HostRuntimeError> {
        let now = self.now();
        let code = input.code.trim().to_ascii_uppercase();
        if code.is_empty() {
            return Err(HostRuntimeError::InvalidInput {
                field: "code",
                message: "a pairing code is required".to_owned(),
            });
        }

        let mut store = self.write_store();
        let enrollment_id = store
            .enrollments
            .values()
            .find(|enrollment| enrollment.code == code)
            .map(|enrollment| enrollment.enrollment_id.clone())
            .ok_or(HostRuntimeError::EnrollmentNotRedeemable)?;

        let (host_id, already_redeemed) = {
            let enrollment = store
                .enrollments
                .get_mut(&enrollment_id)
                .ok_or(HostRuntimeError::EnrollmentNotRedeemable)?;
            match enrollment.status {
                EnrollmentStatus::Active => {
                    if enrollment.expires_at <= now {
                        enrollment.status = EnrollmentStatus::Expired;
                        let expired = HostRuntimeError::EnrollmentExpired {
                            enrollment_id: enrollment.enrollment_id.clone(),
                            expires_at: enrollment.expires_at,
                        };
                        return Err(expired);
                    }
                    enrollment.status = EnrollmentStatus::Redeemed;
                    enrollment.redeemed_at = Some(now);
                    (enrollment.host_id.clone(), false)
                }
                EnrollmentStatus::Redeemed => (enrollment.host_id.clone(), true),
                EnrollmentStatus::Expired | EnrollmentStatus::Revoked => {
                    return Err(HostRuntimeError::EnrollmentNotRedeemable);
                }
            }
        };

        if already_redeemed {
            let live = store
                .leases
                .values()
                .find(|lease| lease.host_id == host_id && lease.expires_at > now)
                .cloned();
            if let Some(lease) = live {
                let host = store
                    .hosts
                    .get(&host_id)
                    .cloned()
                    .ok_or_else(|| HostRuntimeError::NotFound {
                        resource: "host",
                        id: host_id.clone(),
                    })?;
                return Ok(HostHelloOutcome { host, lease });
            }
        }

        let lease = HostLeaseRecord {
            lease_id: new_id("lease"),
            host_id: host_id.clone(),
            expires_at: now.saturating_add(self.config.host_lease_seconds),
            last_heartbeat_at: now,
        };
        let host = {
            let host = store
                .hosts
                .get_mut(&host_id)
                .ok_or_else(|| HostRuntimeError::NotFound {
                    resource: "host",
                    id: host_id.clone(),
                })?;
            if host.status == HostStatus::Disabled {
                return Err(HostRuntimeError::HostDisabled { host_id });
            }
            host.platform = input.platform;
            if let Some(version) = input.runtime_version.as_deref() {
                host.runtime_version = Some(require_name("runtimeVersion", version)?);
            }
            if let Some(name) = input.display_name.as_deref() {
                host.display_name = require_name("displayName", name)?;
            }
            if !input.labels.is_empty() {
                host.labels = normalize_labels(&input.labels)?;
            }
            host.status = HostStatus::Online;
            host.lease_id = Some(lease.lease_id.clone());
            host.lease_expires_at = Some(lease.expires_at);
            host.last_seen_at = Some(now);
            host.updated_at = now;
            host.clone()
        };
        store.leases.insert(lease.lease_id.clone(), lease.clone());
        Ok(HostHelloOutcome { host, lease })
    }

    /// Extends a lease and refreshes its host's reachability.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::LeaseNotActive`] when the lease is unknown or
    /// past its expiry.
    pub async fn heartbeat_host_runtime(
        &self,
        lease_id: &str,
    ) -> Result<HostLeaseRecord, HostRuntimeError> {
        let now = self.now();
        let mut store = self.write_store();
        let host_id = {
            let lease = store
                .leases
                .get_mut(lease_id)
                .filter(|lease| lease.expires_at > now)
                .ok_or_else(|| HostRuntimeError::LeaseNotActive {
                    lease_id: lease_id.to_owned(),
                })?;
            lease.expires_at = now.saturating_add(self.config.host_lease_seconds);
            lease.last_heartbeat_at = now;
            lease.host_id.clone()
        };
        let lease = store
            .leases
            .get(lease_id)
            .cloned()
            .ok_or_else(|| HostRuntimeError::LeaseNotActive {
                lease_id: lease_id.to_owned(),
            })?;
        if let Some(host) = store.hosts.get_mut(&host_id) {
            if host.status != HostStatus::Disabled {
                host.status = HostStatus::Online;
            }
            host.lease_id = Some(lease.lease_id.clone());
            host.lease_expires_at = Some(lease.expires_at);
            host.last_seen_at = Some(now);
            host.updated_at = now;
        }
        Ok(lease)
    }

    /// Closes a lease, returning its host to `offline`.
    ///
    /// Unknown lease identifiers are reported as inactive rather than silently
    /// accepted, so a runtime that lost its lease learns about it.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::LeaseNotActive`].
    pub async fn close_host_runtime(&self, lease_id: &str) -> Result<(), HostRuntimeError> {
        let now = self.now();
        let mut store = self.write_store();
        let lease = store
            .leases
            .remove(lease_id)
            .ok_or_else(|| HostRuntimeError::LeaseNotActive {
                lease_id: lease_id.to_owned(),
            })?;
        if let Some(host) = store.hosts.get_mut(&lease.host_id) {
            if host.lease_id.as_deref() == Some(lease_id) {
                host.lease_id = None;
                host.lease_expires_at = None;
                if host.status == HostStatus::Online {
                    host.status = HostStatus::Offline;
                }
            }
            host.updated_at = now;
        }
        Ok(())
    }

    /// Claims up to `limit` pending turns for the lease's host.
    ///
    /// Claiming is the host's half of the relay: the mobile client enqueues a
    /// turn, and the host takes ownership of it here before running the agent.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::LeaseNotActive`].
    pub async fn claim_pending_turns(
        &self,
        lease_id: &str,
        limit: Option<u32>,
    ) -> Result<Vec<AgentTurnRecord>, HostRuntimeError> {
        let now = self.now();
        let limit = limit.unwrap_or(DEFAULT_TURN_CLAIM_LIMIT).clamp(1, 64);
        let mut store = self.write_store();
        let host_id = active_host_id(&store, lease_id, now)?;
        let session_ids: Vec<String> = store
            .sessions
            .values()
            .filter(|session| session.host_id == host_id)
            .map(|session| session.session_id.clone())
            .collect();

        let mut claimed: Vec<AgentTurnRecord> = Vec::new();
        for session_id in session_ids {
            if claimed.len() >= limit as usize {
                break;
            }
            let mut candidates: Vec<String> = store
                .turns
                .values()
                .filter(|turn| {
                    turn.session_id == session_id && turn.status == AgentTurnStatus::Pending
                })
                .map(|turn| turn.turn_id.clone())
                .collect();
            candidates.sort();
            for turn_id in candidates {
                if claimed.len() >= limit as usize {
                    break;
                }
                if let Some(turn) = store.turns.get_mut(&turn_id) {
                    turn.status = AgentTurnStatus::Running;
                    turn.updated_at = now;
                    claimed.push(turn.clone());
                }
            }
        }
        if let Some(host) = store.hosts.get_mut(&host_id) {
            host.last_seen_at = Some(now);
        }
        claimed.sort_by(|left, right| left.sequence.cmp(&right.sequence));
        Ok(claimed)
    }

    /// Stores host-reported events and fans them out to live subscribers.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::LeaseNotActive`] when the lease is stale, or
    /// [`HostRuntimeError::NotFound`] when an event addresses a session this
    /// host does not own.
    pub async fn append_agent_events(
        &self,
        lease_id: &str,
        session_id: &str,
        items: Vec<AgentEventAppend>,
    ) -> Result<AgentEventAppendOutcome, HostRuntimeError> {
        let now = self.now();
        let mut store = self.write_store();
        let host_id = active_host_id(&store, lease_id, now)?;
        let owns_session = store
            .sessions
            .get(session_id)
            .is_some_and(|session| session.host_id == host_id);
        if !owns_session {
            return Err(HostRuntimeError::NotFound {
                resource: "agent session",
                id: session_id.to_owned(),
            });
        }

        let mut stored: Vec<AgentEventRecord> = Vec::with_capacity(items.len());
        for item in items {
            let sequence = next_sequence(&mut store, session_id);
            let event = AgentEventRecord {
                event_id: new_id("evt"),
                session_id: session_id.to_owned(),
                turn_id: item.turn_id.clone(),
                sequence,
                kind: item.kind,
                payload: item.payload,
                emitted_at: now,
            };
            apply_turn_transition(&mut store, &event, now);
            store
                .events
                .entry(session_id.to_owned())
                .or_default()
                .push(event.clone());
            if let Some(session) = store.sessions.get_mut(session_id) {
                session.last_activity_at = now;
            }
            if let Some(sender) = store.fanout.get(session_id) {
                let _ = sender.send(event.clone());
            }
            stored.push(event);
        }

        let session = store
            .sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| HostRuntimeError::NotFound {
                resource: "agent session",
                id: session_id.to_owned(),
            })?;
        Ok(AgentEventAppendOutcome {
            events: stored,
            session,
        })
    }

    // -------------------------------------------------- agent conversation

    /// Creates a conversation bound to one host.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::NotFound`], [`HostRuntimeError::HostDisabled`],
    /// or [`HostRuntimeError::InvalidInput`].
    pub async fn create_agent_session(
        &self,
        scope: &OwnerScope,
        host_id: &str,
        title: Option<&str>,
    ) -> Result<AgentSessionRecord, HostRuntimeError> {
        let now = self.now();
        let mut store = self.write_store();
        let host = store
            .hosts
            .get(host_id)
            .filter(|host| host.tenant_id == scope.tenant_id && host.owner_id == scope.owner_id)
            .ok_or_else(|| HostRuntimeError::NotFound {
                resource: "host",
                id: host_id.to_owned(),
            })?;
        if host.status == HostStatus::Disabled {
            return Err(HostRuntimeError::HostDisabled {
                host_id: host_id.to_owned(),
            });
        }
        let title = match title {
            Some(value) => require_title(value)?,
            None => "New conversation".to_owned(),
        };
        let session = AgentSessionRecord {
            session_id: new_id("ses"),
            tenant_id: scope.tenant_id.clone(),
            owner_id: scope.owner_id.clone(),
            host_id: host_id.to_owned(),
            title,
            status: AgentSessionStatus::Active,
            created_at: now,
            last_activity_at: now,
        };
        store
            .sessions
            .insert(session.session_id.clone(), session.clone());
        store.events.insert(session.session_id.clone(), Vec::new());
        Ok(session)
    }

    /// Lists the owner's conversations on one host, most recent first.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::NotFound`] when the host is outside the
    /// caller's scope.
    pub async fn list_agent_sessions(
        &self,
        scope: &OwnerScope,
        host_id: &str,
        cursor: Option<&str>,
        page_size: Option<u32>,
    ) -> Result<Page<AgentSessionRecord>, HostRuntimeError> {
        validate_cursor(cursor)?;
        let page_size = normalize_page_size(page_size);
        let store = self.read_store();
        let host_owned = store
            .hosts
            .get(host_id)
            .is_some_and(|host| host.tenant_id == scope.tenant_id && host.owner_id == scope.owner_id);
        if !host_owned {
            return Err(HostRuntimeError::NotFound {
                resource: "host",
                id: host_id.to_owned(),
            });
        }
        let mut sessions: Vec<AgentSessionRecord> = store
            .sessions
            .values()
            .filter(|session| {
                session.host_id == host_id
                    && session.tenant_id == scope.tenant_id
                    && session.owner_id == scope.owner_id
            })
            .cloned()
            .collect();
        sessions.sort_by(|left, right| {
            right
                .last_activity_at
                .cmp(&left.last_activity_at)
                .then_with(|| right.session_id.cmp(&left.session_id))
        });
        Ok(paginate(sessions, cursor, page_size, |session| {
            session.session_id.clone()
        }))
    }

    /// Reads one conversation inside the caller's scope.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::NotFound`].
    pub async fn retrieve_agent_session(
        &self,
        scope: &OwnerScope,
        session_id: &str,
    ) -> Result<AgentSessionRecord, HostRuntimeError> {
        let store = self.read_store();
        owned_session(&store, scope, session_id).cloned()
    }

    /// Renames a conversation.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::NotFound`] or
    /// [`HostRuntimeError::InvalidInput`].
    pub async fn rename_agent_session(
        &self,
        scope: &OwnerScope,
        session_id: &str,
        title: &str,
    ) -> Result<AgentSessionRecord, HostRuntimeError> {
        let title = require_title(title)?;
        let mut store = self.write_store();
        let session = store
            .sessions
            .get_mut(session_id)
            .filter(|session| {
                session.tenant_id == scope.tenant_id && session.owner_id == scope.owner_id
            })
            .ok_or_else(|| HostRuntimeError::NotFound {
                resource: "agent session",
                id: session_id.to_owned(),
            })?;
        session.title = title;
        Ok(session.clone())
    }

    /// Deletes a conversation together with its turns and events.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::NotFound`].
    pub async fn delete_agent_session(
        &self,
        scope: &OwnerScope,
        session_id: &str,
    ) -> Result<(), HostRuntimeError> {
        let mut store = self.write_store();
        owned_session(&store, scope, session_id)?;
        store.sessions.remove(session_id);
        store.turns.retain(|_, turn| turn.session_id != session_id);
        store.events.remove(session_id);
        store.sequences.remove(session_id);
        store.fanout.remove(session_id);
        Ok(())
    }

    /// Enqueues a user turn and returns it in `pending`.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::NotFound`],
    /// [`HostRuntimeError::SessionArchived`], or
    /// [`HostRuntimeError::InvalidInput`].
    pub async fn create_agent_turn(
        &self,
        scope: &OwnerScope,
        session_id: &str,
        prompt: &str,
    ) -> Result<AgentTurnRecord, HostRuntimeError> {
        let prompt = require_prompt(prompt)?;
        let now = self.now();
        let mut store = self.write_store();
        let session = owned_session(&store, scope, session_id)?;
        if session.status == AgentSessionStatus::Archived {
            return Err(HostRuntimeError::SessionArchived {
                session_id: session_id.to_owned(),
            });
        }
        let host_id = session.host_id.clone();
        if store
            .hosts
            .get(&host_id)
            .is_some_and(|host| host.status == HostStatus::Disabled)
        {
            return Err(HostRuntimeError::HostDisabled { host_id });
        }
        let sequence = next_sequence(&mut store, session_id);
        let turn = AgentTurnRecord {
            turn_id: new_id("turn"),
            session_id: session_id.to_owned(),
            host_id,
            sequence,
            role: AgentTurnRole::User,
            content: Some(prompt),
            status: AgentTurnStatus::Pending,
            error_code: None,
            error_message: None,
            created_at: now,
            updated_at: now,
        };
        store.turns.insert(turn.turn_id.clone(), turn.clone());
        if let Some(session) = store.sessions.get_mut(session_id) {
            session.last_activity_at = now;
        }
        Ok(turn)
    }

    /// Lists a conversation's turns oldest-first, cursor-paginated.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::NotFound`] or
    /// [`HostRuntimeError::InvalidInput`].
    pub async fn list_agent_turns(
        &self,
        scope: &OwnerScope,
        session_id: &str,
        cursor: Option<&str>,
        page_size: Option<u32>,
    ) -> Result<Page<AgentTurnRecord>, HostRuntimeError> {
        validate_cursor(cursor)?;
        let page_size = normalize_page_size(page_size);
        let store = self.read_store();
        owned_session(&store, scope, session_id)?;
        let mut turns: Vec<AgentTurnRecord> = store
            .turns
            .values()
            .filter(|turn| turn.session_id == session_id)
            .cloned()
            .collect();
        turns.sort_by(|left, right| {
            left.sequence
                .cmp(&right.sequence)
                .then_with(|| left.turn_id.cmp(&right.turn_id))
        });
        Ok(paginate(turns, cursor, page_size, |turn| {
            turn.sequence.to_string()
        }))
    }

    /// Cancels a turn that has not reached a terminal state.
    ///
    /// The cancellation is recorded as a session event so the mobile stream and
    /// the host both observe it in order.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::NotFound`] or
    /// [`HostRuntimeError::TurnNotCancellable`].
    pub async fn cancel_agent_turn(
        &self,
        scope: &OwnerScope,
        session_id: &str,
        turn_id: &str,
    ) -> Result<AgentTurnRecord, HostRuntimeError> {
        let now = self.now();
        let mut store = self.write_store();
        owned_session(&store, scope, session_id)?;
        let turn = store
            .turns
            .get(turn_id)
            .filter(|turn| turn.session_id == session_id)
            .cloned()
            .ok_or_else(|| HostRuntimeError::NotFound {
                resource: "agent turn",
                id: turn_id.to_owned(),
            })?;
        if turn.status.is_terminal() {
            return Err(HostRuntimeError::TurnNotCancellable {
                turn_id: turn_id.to_owned(),
                status: turn.status.as_str().to_owned(),
            });
        }
        let sequence = next_sequence(&mut store, session_id);
        let event = AgentEventRecord {
            event_id: new_id("evt"),
            session_id: session_id.to_owned(),
            turn_id: Some(turn_id.to_owned()),
            sequence,
            kind: AgentEventKind::TurnCancelled,
            payload: json!({ "reason": "cancelled-by-owner" }),
            emitted_at: now,
        };
        apply_turn_transition(&mut store, &event, now);
        store
            .events
            .entry(session_id.to_owned())
            .or_default()
            .push(event.clone());
        if let Some(session) = store.sessions.get_mut(session_id) {
            session.last_activity_at = now;
        }
        if let Some(sender) = store.fanout.get(session_id) {
            let _ = sender.send(event);
        }
        store
            .turns
            .get(turn_id)
            .cloned()
            .ok_or_else(|| HostRuntimeError::NotFound {
                resource: "agent turn",
                id: turn_id.to_owned(),
            })
    }

    /// Reads a conversation's events after a watermark, oldest-first.
    ///
    /// # Errors
    ///
    /// Returns [`HostRuntimeError::NotFound`].
    pub async fn list_agent_events(
        &self,
        scope: &OwnerScope,
        session_id: &str,
        after_sequence: i64,
        limit: Option<u32>,
    ) -> Result<Vec<AgentEventRecord>, HostRuntimeError> {
        let store = self.read_store();
        owned_session(&store, scope, session_id)?;
        let limit = limit.unwrap_or(DEFAULT_PAGE_SIZE).clamp(1, MAX_PAGE_SIZE);
        let mut events: Vec<AgentEventRecord> = store
            .events
            .get(session_id)
            .map(|events| {
                events
                    .iter()
                    .filter(|event| event.sequence > after_sequence)
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();
        events.sort_by_key(|event| event.sequence);
        events.truncate(limit as usize);
        Ok(events)
    }

    /// Subscribes to the live event stream of a conversation.
    ///
    /// Subscribers that cannot keep up lose the oldest buffered events and are
    /// expected to re-read [`Self::list_agent_events`] from their last applied
    /// watermark; the ordered event log, not the fan-out channel, is the
    /// authoritative transcript.
    #[must_use]
    pub fn subscribe(&self, session_id: &str) -> broadcast::Receiver<AgentEventRecord> {
        let mut store = self.write_store();
        store
            .fanout
            .entry(session_id.to_owned())
            .or_insert_with(|| broadcast::channel(self.config.event_fanout_capacity).0)
            .subscribe()
    }

    // ------------------------------------------------------------- internals

    fn now(&self) -> i64 {
        unix_seconds().saturating_add(self.clock_offset_seconds.load(Ordering::SeqCst))
    }

    fn read_store(&self) -> RwLockReadGuard<'_, Store> {
        match self.store.read() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        }
    }

    fn write_store(&self) -> RwLockWriteGuard<'_, Store> {
        match self.store.write() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        }
    }
}

impl Default for HostRuntimeService {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for HostRuntimeService {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("HostRuntimeService")
            .field("host_lease_seconds", &self.config.host_lease_seconds)
            .finish_non_exhaustive()
    }
}

fn owned_session<'a>(
    store: &'a Store,
    scope: &OwnerScope,
    session_id: &str,
) -> Result<&'a AgentSessionRecord, HostRuntimeError> {
    store
        .sessions
        .get(session_id)
        .filter(|session| {
            session.tenant_id == scope.tenant_id && session.owner_id == scope.owner_id
        })
        .ok_or_else(|| HostRuntimeError::NotFound {
            resource: "agent session",
            id: session_id.to_owned(),
        })
}

fn active_host_id(
    store: &Store,
    lease_id: &str,
    now: i64,
) -> Result<String, HostRuntimeError> {
    store
        .leases
        .get(lease_id)
        .filter(|lease| lease.expires_at > now)
        .map(|lease| lease.host_id.clone())
        .ok_or_else(|| HostRuntimeError::LeaseNotActive {
            lease_id: lease_id.to_owned(),
        })
}

fn next_sequence(store: &mut Store, session_id: &str) -> i64 {
    let entry = store
        .sequences
        .entry(session_id.to_owned())
        .or_insert(0);
    *entry = entry.saturating_add(1);
    *entry
}

/// Applies an event's effect on the turn and session it addresses.
fn apply_turn_transition(store: &mut Store, event: &AgentEventRecord, now: i64) {
    let Some(turn_id) = event.turn_id.as_deref() else {
        return;
    };
    let Some(turn) = store.turns.get_mut(turn_id) else {
        return;
    };
    turn.updated_at = now;
    match event.kind {
        AgentEventKind::TurnStarted => {
            turn.status = AgentTurnStatus::Running;
        }
        AgentEventKind::AssistantCompleted => {
            turn.status = AgentTurnStatus::Completed;
            if let Some(content) = event.payload.get("content").and_then(Value::as_str) {
                turn.content = Some(content.to_owned());
            }
        }
        AgentEventKind::TurnFailed => {
            turn.status = AgentTurnStatus::Failed;
            turn.error_code = event
                .payload
                .get("code")
                .and_then(Value::as_i64)
                .and_then(|code| i32::try_from(code).ok());
            turn.error_message = event
                .payload
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_owned);
        }
        AgentEventKind::TurnCancelled => {
            turn.status = AgentTurnStatus::Cancelled;
        }
        AgentEventKind::AssistantDelta
        | AgentEventKind::ToolStarted
        | AgentEventKind::ToolCompleted
        | AgentEventKind::HostStatusChanged => {}
    }
}

/// Projects a lapsed lease onto the host's reachability, retiring the lease.
fn project_host(host: &mut HostRecord, now: i64) {
    if host.status == HostStatus::Online
        && host
            .lease_expires_at
            .is_some_and(|expires_at| expires_at <= now)
    {
        host.status = HostStatus::Offline;
        host.lease_id = None;
        host.lease_expires_at = None;
    }
}

fn normalize_page_size(page_size: Option<u32>) -> u32 {
    page_size.unwrap_or(DEFAULT_PAGE_SIZE).clamp(1, MAX_PAGE_SIZE)
}

fn paginate<T, F>(items: Vec<T>, cursor: Option<&str>, page_size: u32, key: F) -> Page<T>
where
    F: Fn(&T) -> String,
{
    let start = match cursor {
        Some(cursor) => items
            .iter()
            .position(|item| key(item) == cursor)
            .map_or(0, |index| index + 1),
        None => 0,
    };
    let mut selected: Vec<T> = items;
    let remaining = selected.split_off(start.min(selected.len()));
    let mut page_items = remaining;
    let has_more = page_items.len() > page_size as usize;
    if has_more {
        page_items.truncate(page_size as usize);
    }
    let next_cursor = if has_more {
        page_items.last().map(&key)
    } else {
        None
    };
    Page {
        items: page_items,
        next_cursor,
        has_more,
        page_size,
    }
}

fn validate_cursor(cursor: Option<&str>) -> Result<(), HostRuntimeError> {
    if let Some(cursor) = cursor {
        if cursor.len() > PAGE_CURSOR_MAX_CHARS {
            return Err(HostRuntimeError::InvalidInput {
                field: "cursor",
                message: format!("must be at most {PAGE_CURSOR_MAX_CHARS} bytes"),
            });
        }
    }
    Ok(())
}

fn require_name(field: &'static str, value: &str) -> Result<String, HostRuntimeError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(HostRuntimeError::InvalidInput {
            field,
            message: "must not be empty".to_owned(),
        });
    }
    if trimmed.chars().count() > AGENT_SESSION_TITLE_MAX_CHARS {
        return Err(HostRuntimeError::InvalidInput {
            field,
            message: format!("must be at most {AGENT_SESSION_TITLE_MAX_CHARS} characters"),
        });
    }
    Ok(trimmed.to_owned())
}

fn require_title(value: &str) -> Result<String, HostRuntimeError> {
    require_name("title", value)
}

fn require_prompt(value: &str) -> Result<String, HostRuntimeError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(HostRuntimeError::InvalidInput {
            field: "content",
            message: "must not be empty".to_owned(),
        });
    }
    Ok(trimmed.to_owned())
}

fn normalize_labels(labels: &[String]) -> Result<Vec<String>, HostRuntimeError> {
    if labels.len() > 32 {
        return Err(HostRuntimeError::InvalidInput {
            field: "labels",
            message: "must contain at most 32 entries".to_owned(),
        });
    }
    let mut normalized = Vec::with_capacity(labels.len());
    for label in labels {
        normalized.push(require_name("labels", label)?);
    }
    normalized.sort();
    normalized.dedup();
    Ok(normalized)
}

fn clamp_ttl(requested: Option<i64>, fallback: i64) -> Result<i64, HostRuntimeError> {
    let ttl = requested.unwrap_or(fallback);
    if !(60..=86_400).contains(&ttl) {
        return Err(HostRuntimeError::InvalidInput {
            field: "ttlSeconds",
            message: "must be between 60 and 86400 seconds".to_owned(),
        });
    }
    Ok(ttl)
}

fn new_id(prefix: &str) -> String {
    let uuid = Uuid::new_v4();
    format!("{prefix}_{}", uuid.simple())
}

/// Pairing codes are transcribed by hand, so they avoid characters that are
/// ambiguous in the product's UI font (I, L, O, U, 0, 1).
fn new_pairing_code() -> String {
    const ALPHABET: &[u8] = b"23456789ABCDEFGHJKMNPQRSTVWXYZ";
    let bytes = Uuid::new_v4().into_bytes();
    let mut code = String::with_capacity(9);
    for (index, byte) in bytes.iter().take(8).enumerate() {
        if index == 4 {
            code.push('-');
        }
        let position = usize::from(*byte) % ALPHABET.len();
        let Some(character) = ALPHABET.get(position).copied() else {
            continue;
        };
        code.push(char::from(character));
    }
    code
}

/// Builds the canonical event payload for a host status change.
#[must_use]
pub fn host_status_changed_payload(status: HostStatus, host_id: &str) -> Value {
    let mut payload = Map::new();
    payload.insert("hostId".to_owned(), Value::String(host_id.to_owned()));
    payload.insert(
        "status".to_owned(),
        Value::String(status.as_str().to_owned()),
    );
    Value::Object(payload)
}
