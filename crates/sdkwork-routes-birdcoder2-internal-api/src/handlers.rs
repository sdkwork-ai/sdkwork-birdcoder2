//! HTTP handlers of the host-runtime Internal API surface.
//!
//! Every handler takes [`RequireInternalApi`] as its extractor. That guard
//! rejects the request before the body runs unless the composing gateway
//! classified the call as `internal-api` **and** authenticated it with an
//! ingress token, so no handler here reads a credential from a header itself.
//!
//! The lease the runtime received when it redeemed its pairing code is a second,
//! per-host factor: it travels in the request body and every domain call
//! resolves the host from it. A lease that is missing, expired, or already closed
//! is a domain failure, reported as expired credentials.
//!
//! Handlers own wire adaptation only — payload shape, status code, envelope.
//! All lifecycle rules live in [`sdkwork_birdcoder2_host_runtime_service`].
//!
//! [`RequireInternalApi`]: sdkwork_web_core::RequireInternalApi

use std::sync::Arc;

use axum::extract::State;
use axum::response::Response;
use axum::Json;

use sdkwork_birdcoder2_host_runtime_service::HostRuntimeService;
use sdkwork_web_core::RequireInternalApi;

use crate::payloads::{
    AgentEventReportRequest, AgentEventReportView, HostLeaseRequest, HostLeaseView,
    HostRuntimeCloseView, HostRuntimeHelloRequest, HostRuntimeHelloView, TurnClaimRequest,
    TurnClaimView,
};
use crate::response::{created_api_json, finish_api_json, item_data, problem_from, ApiResult};

/// State shared by every handler of this surface.
#[derive(Clone)]
pub struct InternalState {
    /// The host-runtime domain service, shared with the mobile App API surface
    /// so both see one registry.
    pub service: Arc<HostRuntimeService>,
}

impl InternalState {
    /// Binds the surface to one service instance.
    #[must_use]
    pub fn new(service: Arc<HostRuntimeService>) -> Self {
        Self { service }
    }

    /// Binds the surface to a service with its own in-memory store.
    ///
    /// Used by the canonical no-argument mount and by tests; a real deployment
    /// passes the shared instance in through [`InternalState::new`].
    #[must_use]
    pub fn with_default_service() -> Self {
        Self {
            service: Arc::new(HostRuntimeService::new()),
        }
    }
}

/// `POST /internal/v3/api/birdcoder/host-runtimes/hello`
///
/// Redeems a pairing code and grants a lease. Idempotent for the lifetime of the
/// lease: a runtime that re-attaches with the same code gets its existing lease
/// back rather than a second one.
pub async fn hello_host_runtime(
    RequireInternalApi(ctx): RequireInternalApi,
    State(state): State<InternalState>,
    Json(body): Json<HostRuntimeHelloRequest>,
) -> Response {
    let input = match body.into_input() {
        Ok(input) => input,
        Err(error) => return problem_from(&ctx, error),
    };
    let interval = state.service.heartbeat_interval_seconds();
    let result: ApiResult<_> = async {
        let outcome = state.service.hello_host_runtime(&input).await?;
        Ok(item_data(HostRuntimeHelloView::new(
            &outcome.host,
            &outcome.lease,
            interval,
        )))
    }
    .await;
    finish_api_json(&ctx, result)
}

/// `POST /internal/v3/api/birdcoder/host-runtimes/heartbeat`
pub async fn heartbeat_host_runtime(
    RequireInternalApi(ctx): RequireInternalApi,
    State(state): State<InternalState>,
    Json(body): Json<HostLeaseRequest>,
) -> Response {
    let result: ApiResult<_> = async {
        let lease = state
            .service
            .heartbeat_host_runtime(&body.lease_id)
            .await?;
        Ok(item_data(HostLeaseView::from(&lease)))
    }
    .await;
    finish_api_json(&ctx, result)
}

/// `POST /internal/v3/api/birdcoder/host-runtimes/close`
pub async fn close_host_runtime(
    RequireInternalApi(ctx): RequireInternalApi,
    State(state): State<InternalState>,
    Json(body): Json<HostLeaseRequest>,
) -> Response {
    let lease_id = body.lease_id.clone();
    let result: ApiResult<_> = async {
        state.service.close_host_runtime(&lease_id).await?;
        Ok(item_data(HostRuntimeCloseView::closed(lease_id)))
    }
    .await;
    finish_api_json(&ctx, result)
}

/// `POST /internal/v3/api/birdcoder/host-runtimes/turn-claims`
///
/// Claims up to `limit` turns the mobile client enqueued for this host's
/// conversations. Claimed turns move to `dispatched`, so a second claim from the
/// same runtime does not see them again.
pub async fn claim_pending_turns(
    RequireInternalApi(ctx): RequireInternalApi,
    State(state): State<InternalState>,
    Json(body): Json<TurnClaimRequest>,
) -> Response {
    let result: ApiResult<_> = async {
        let turns = state
            .service
            .claim_pending_turns(&body.lease_id, body.limit)
            .await?;
        Ok(item_data(TurnClaimView::from(turns.as_slice())))
    }
    .await;
    created_api_json(&ctx, result)
}

/// `POST /internal/v3/api/birdcoder/host-runtimes/agent-events`
///
/// Stores the agent events the runtime produced, assigns each one the next
/// sequence in its conversation, and fans them out to the mobile client readers.
/// The events are appended in report order, so a batch is always a contiguous
/// stretch of the conversation log.
pub async fn report_agent_events(
    RequireInternalApi(ctx): RequireInternalApi,
    State(state): State<InternalState>,
    Json(body): Json<AgentEventReportRequest>,
) -> Response {
    let (lease_id, session_id, appends) = match body.into_appends() {
        Ok(parts) => parts,
        Err(error) => return problem_from(&ctx, error),
    };
    let result: ApiResult<_> = async {
        let outcome = state
            .service
            .append_agent_events(&lease_id, &session_id, appends)
            .await?;
        Ok(item_data(AgentEventReportView::new(
            &outcome.session,
            &outcome.events,
        )))
    }
    .await;
    created_api_json(&ctx, result)
}
