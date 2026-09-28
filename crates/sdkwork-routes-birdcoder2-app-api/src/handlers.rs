//! HTTP handlers of the mobile App API surface.
//!
//! Every handler takes the verified [`WebRequestContext`] as an extractor and
//! never reads an identity from a header, a query parameter, or the body: the
//! composing gateway injects the context after authentication, and a mount
//! without that layer rejects the request before reaching these bodies.
//!
//! Handlers own wire adaptation only — payload shape, status code, envelope.
//! All lifecycle rules live in [`sdkwork_birdcoder2_host_runtime_service`].

use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::response::Response;
use axum::Json;
use serde::Deserialize;

use sdkwork_birdcoder2_host_runtime_service::{
    HostRuntimeService, OwnerScope, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
};
use sdkwork_web_core::{WebFrameworkError, WebRequestContext};

use crate::payloads::{
    AgentEventListQuery, AgentEventView, AgentSessionCreateRequest, AgentSessionListQuery,
    AgentSessionUpdateRequest, AgentSessionView, AgentTurnCreateRequest, AgentTurnListQuery,
    AgentTurnView, HostEnrollmentCreateRequest, HostEnrollmentView, HostListQuery, HostUpdateRequest,
    HostView,
};
use crate::response::{
    created_api_json, cursor_page_data, deleted_api_response, finish_api_json, item_data,
    problem_from, ApiResult,
};

/// State shared by every handler of this surface.
#[derive(Clone)]
pub struct AppState {
    /// The host-runtime domain service.
    pub service: Arc<HostRuntimeService>,
}

impl AppState {
    /// Binds the surface to one service instance.
    #[must_use]
    pub fn new(service: Arc<HostRuntimeService>) -> Self {
        Self { service }
    }

    /// Binds the surface to a service with its own in-memory store.
    ///
    /// Used by the assembly's default constructor and by tests; a real
    /// deployment passes the shared instance in through [`AppState::new`].
    #[must_use]
    pub fn with_default_service() -> Self {
        Self {
            service: Arc::new(HostRuntimeService::new()),
        }
    }
}

/// `{hostId}` path parameter.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostIdPath {
    /// Addressed host.
    pub host_id: String,
}

/// `{sessionId}` path parameter.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionPath {
    /// Addressed conversation.
    pub session_id: String,
}

/// `{sessionId}/{turnId}` path parameters.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnPath {
    /// Addressed conversation.
    pub session_id: String,
    /// Addressed turn.
    pub turn_id: String,
}

fn owner_scope(ctx: &WebRequestContext) -> Option<OwnerScope> {
    ctx.principal()
        .map(|principal| OwnerScope::new(principal.tenant_id(), principal.user_id()))
}

fn missing_principal() -> WebFrameworkError {
    WebFrameworkError::missing_credentials("an authenticated principal is required")
}

/// `GET /app/v3/api/birdcoder/hosts`
pub async fn list_hosts(
    ctx: WebRequestContext,
    State(state): State<AppState>,
    Query(query): Query<HostListQuery>,
) -> Response {
    let Some(scope) = owner_scope(&ctx) else {
        return problem_from(&ctx, missing_principal());
    };
    let result: ApiResult<_> = async {
        let page = state
            .service
            .list_hosts(&scope, query.cursor.as_deref(), query.page_size)
            .await?;
        let items = page.items.iter().map(HostView::from).collect();
        Ok(cursor_page_data(
            items,
            page.next_cursor,
            page.page_size,
            page.has_more,
        ))
    }
    .await;
    finish_api_json(&ctx, result)
}

/// `POST /app/v3/api/birdcoder/host-enrollments`
pub async fn create_host_enrollment(
    ctx: WebRequestContext,
    State(state): State<AppState>,
    Json(body): Json<HostEnrollmentCreateRequest>,
) -> Response {
    let Some(scope) = owner_scope(&ctx) else {
        return problem_from(&ctx, missing_principal());
    };
    let input = match body.into_input() {
        Ok(input) => input,
        Err(error) => return problem_from(&ctx, error),
    };
    let result: ApiResult<_> = async {
        let outcome = state.service.create_host_enrollment(&scope, &input).await?;
        Ok(item_data(HostEnrollmentView::from(&outcome.enrollment)))
    }
    .await;
    created_api_json(&ctx, result)
}

/// `GET /app/v3/api/birdcoder/hosts/{hostId}`
pub async fn retrieve_host(
    ctx: WebRequestContext,
    State(state): State<AppState>,
    Path(path): Path<HostIdPath>,
) -> Response {
    let Some(scope) = owner_scope(&ctx) else {
        return problem_from(&ctx, missing_principal());
    };
    let result: ApiResult<_> = async {
        let host = state.service.retrieve_host(&scope, &path.host_id).await?;
        Ok(item_data(HostView::from(&host)))
    }
    .await;
    finish_api_json(&ctx, result)
}

/// `PATCH /app/v3/api/birdcoder/hosts/{hostId}`
pub async fn update_host(
    ctx: WebRequestContext,
    State(state): State<AppState>,
    Path(path): Path<HostIdPath>,
    Json(body): Json<HostUpdateRequest>,
) -> Response {
    let Some(scope) = owner_scope(&ctx) else {
        return problem_from(&ctx, missing_principal());
    };
    let patch = match body.into_patch() {
        Ok(patch) => patch,
        Err(error) => return problem_from(&ctx, error),
    };
    let result: ApiResult<_> = async {
        let host = state
            .service
            .update_host(&scope, &path.host_id, &patch)
            .await?;
        Ok(item_data(HostView::from(&host)))
    }
    .await;
    finish_api_json(&ctx, result)
}

/// `DELETE /app/v3/api/birdcoder/hosts/{hostId}`
pub async fn delete_host(
    ctx: WebRequestContext,
    State(state): State<AppState>,
    Path(path): Path<HostIdPath>,
) -> Response {
    let Some(scope) = owner_scope(&ctx) else {
        return problem_from(&ctx, missing_principal());
    };
    let result: ApiResult<()> = state.service.delete_host(&scope, &path.host_id).await;
    deleted_api_response(&ctx, result)
}

/// `GET .../hosts/{hostId}/agent-sessions`
pub async fn list_agent_sessions(
    ctx: WebRequestContext,
    State(state): State<AppState>,
    Path(path): Path<HostIdPath>,
    Query(query): Query<AgentSessionListQuery>,
) -> Response {
    let Some(scope) = owner_scope(&ctx) else {
        return problem_from(&ctx, missing_principal());
    };
    let result: ApiResult<_> = async {
        let page = state
            .service
            .list_agent_sessions(
                &scope,
                &path.host_id,
                query.cursor.as_deref(),
                query.page_size,
            )
            .await?;
        let items = page.items.iter().map(AgentSessionView::from).collect();
        Ok(cursor_page_data(
            items,
            page.next_cursor,
            page.page_size,
            page.has_more,
        ))
    }
    .await;
    finish_api_json(&ctx, result)
}

/// `POST .../hosts/{hostId}/agent-sessions`
pub async fn create_agent_session(
    ctx: WebRequestContext,
    State(state): State<AppState>,
    Path(path): Path<HostIdPath>,
    Json(body): Json<AgentSessionCreateRequest>,
) -> Response {
    let Some(scope) = owner_scope(&ctx) else {
        return problem_from(&ctx, missing_principal());
    };
    let result: ApiResult<_> = async {
        let session = state
            .service
            .create_agent_session(&scope, &path.host_id, body.title.as_deref())
            .await?;
        Ok(item_data(AgentSessionView::from(&session)))
    }
    .await;
    created_api_json(&ctx, result)
}

/// `GET .../agent-sessions/{sessionId}`
pub async fn retrieve_agent_session(
    ctx: WebRequestContext,
    State(state): State<AppState>,
    Path(path): Path<AgentSessionPath>,
) -> Response {
    let Some(scope) = owner_scope(&ctx) else {
        return problem_from(&ctx, missing_principal());
    };
    let result: ApiResult<_> = async {
        let session = state
            .service
            .retrieve_agent_session(&scope, &path.session_id)
            .await?;
        Ok(item_data(AgentSessionView::from(&session)))
    }
    .await;
    finish_api_json(&ctx, result)
}

/// `PATCH .../agent-sessions/{sessionId}`
pub async fn update_agent_session(
    ctx: WebRequestContext,
    State(state): State<AppState>,
    Path(path): Path<AgentSessionPath>,
    Json(body): Json<AgentSessionUpdateRequest>,
) -> Response {
    let Some(scope) = owner_scope(&ctx) else {
        return problem_from(&ctx, missing_principal());
    };
    let result: ApiResult<_> = async {
        let session = state
            .service
            .rename_agent_session(&scope, &path.session_id, &body.title)
            .await?;
        Ok(item_data(AgentSessionView::from(&session)))
    }
    .await;
    finish_api_json(&ctx, result)
}

/// `DELETE .../agent-sessions/{sessionId}`
pub async fn delete_agent_session(
    ctx: WebRequestContext,
    State(state): State<AppState>,
    Path(path): Path<AgentSessionPath>,
) -> Response {
    let Some(scope) = owner_scope(&ctx) else {
        return problem_from(&ctx, missing_principal());
    };
    let result: ApiResult<()> = state
        .service
        .delete_agent_session(&scope, &path.session_id)
        .await;
    deleted_api_response(&ctx, result)
}

/// `GET .../agent-sessions/{sessionId}/turns`
pub async fn list_agent_turns(
    ctx: WebRequestContext,
    State(state): State<AppState>,
    Path(path): Path<AgentSessionPath>,
    Query(query): Query<AgentTurnListQuery>,
) -> Response {
    let Some(scope) = owner_scope(&ctx) else {
        return problem_from(&ctx, missing_principal());
    };
    let result: ApiResult<_> = async {
        let page = state
            .service
            .list_agent_turns(
                &scope,
                &path.session_id,
                query.cursor.as_deref(),
                query.page_size,
            )
            .await?;
        let items = page.items.iter().map(AgentTurnView::from).collect();
        Ok(cursor_page_data(
            items,
            page.next_cursor,
            page.page_size,
            page.has_more,
        ))
    }
    .await;
    finish_api_json(&ctx, result)
}

/// `POST .../agent-sessions/{sessionId}/turns`
pub async fn create_agent_turn(
    ctx: WebRequestContext,
    State(state): State<AppState>,
    Path(path): Path<AgentSessionPath>,
    Json(body): Json<AgentTurnCreateRequest>,
) -> Response {
    let Some(scope) = owner_scope(&ctx) else {
        return problem_from(&ctx, missing_principal());
    };
    let result: ApiResult<_> = async {
        let turn = state
            .service
            .create_agent_turn(&scope, &path.session_id, &body.content)
            .await?;
        Ok(item_data(AgentTurnView::from(&turn)))
    }
    .await;
    created_api_json(&ctx, result)
}

/// `POST .../agent-sessions/{sessionId}/turns/{turnId}/cancel`
pub async fn cancel_agent_turn(
    ctx: WebRequestContext,
    State(state): State<AppState>,
    Path(path): Path<AgentTurnPath>,
) -> Response {
    let Some(scope) = owner_scope(&ctx) else {
        return problem_from(&ctx, missing_principal());
    };
    let result: ApiResult<_> = async {
        let turn = state
            .service
            .cancel_agent_turn(&scope, &path.session_id, &path.turn_id)
            .await?;
        Ok(item_data(AgentTurnView::from(&turn)))
    }
    .await;
    finish_api_json(&ctx, result)
}

/// `GET .../agent-sessions/{sessionId}/events`
///
/// The response is a cursor page over the ordered event log: `nextCursor` is the
/// last delivered `sequence`, so the client resumes with
/// `after_sequence=<nextCursor>` and never re-reads the transcript.
pub async fn list_agent_events(
    ctx: WebRequestContext,
    State(state): State<AppState>,
    Path(path): Path<AgentSessionPath>,
    Query(query): Query<AgentEventListQuery>,
) -> Response {
    let Some(scope) = owner_scope(&ctx) else {
        return problem_from(&ctx, missing_principal());
    };
    let limit = query
        .limit
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(1, MAX_PAGE_SIZE - 1);
    let after_sequence = query.after_sequence.unwrap_or(0).max(0);
    let result: ApiResult<_> = async {
        let fetched = state
            .service
            .list_agent_events(&scope, &path.session_id, after_sequence, Some(limit + 1))
            .await?;
        let has_more = fetched.len() > limit as usize;
        let page: Vec<_> = fetched.iter().take(limit as usize).collect();
        let next_cursor = page.last().map(|event| event.sequence.to_string());
        let items = page.iter().map(|event| AgentEventView::from(*event)).collect();
        Ok(cursor_page_data(items, next_cursor, limit, has_more))
    }
    .await;
    finish_api_json(&ctx, result)
}
