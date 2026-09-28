//! Response construction for the host-runtime Internal API surface.
//!
//! Same envelope contract as the mobile surface (`API_SPEC.md` section 15.1):
//! `{ code, data, traceId }` on success, RFC 9457 Problem+json on failure. The
//! platform status still carries REST semantics — `201` for the two creations,
//! `200` for commands.

use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use sdkwork_birdcoder2_host_runtime_service::HostRuntimeError;
use sdkwork_utils_rust::{SdkWorkApiResponse, SdkWorkResourceData};
use sdkwork_web_core::{problem_response, WebFrameworkError, WebRequestContext};

use crate::errors::to_framework_error;

/// Result of one handler body, already reduced to the domain taxonomy.
pub type ApiResult<T> = Result<T, HostRuntimeError>;

/// Wraps a single resource as `data.item`.
#[must_use]
pub fn item_data<T>(item: T) -> SdkWorkResourceData<T> {
    SdkWorkResourceData { item }
}

fn envelope_response<T: Serialize>(
    ctx: &WebRequestContext,
    status: StatusCode,
    data: T,
) -> Response {
    let trace_id = ctx.resolved_trace_id();
    let envelope = SdkWorkApiResponse::success(data, trace_id.clone());
    let mut response = (status, Json(envelope)).into_response();
    if let Ok(value) = HeaderValue::from_str(&trace_id) {
        response
            .headers_mut()
            .insert(HeaderName::from_static("x-sdkwork-trace-id"), value);
    }
    response
}

/// Renders a `200` success envelope, mapping a domain failure to Problem+json.
#[must_use]
pub fn finish_api_json<T: Serialize>(ctx: &WebRequestContext, result: ApiResult<T>) -> Response {
    match result {
        Ok(data) => envelope_response(ctx, StatusCode::OK, data),
        Err(error) => problem_response(&to_framework_error(error), ctx.problem_correlation()),
    }
}

/// Renders a `201` creation envelope, mapping a domain failure to Problem+json.
#[must_use]
pub fn created_api_json<T: Serialize>(ctx: &WebRequestContext, result: ApiResult<T>) -> Response {
    match result {
        Ok(data) => envelope_response(ctx, StatusCode::CREATED, data),
        Err(error) => problem_response(&to_framework_error(error), ctx.problem_correlation()),
    }
}

/// Renders Problem+json for a handler that failed before building a payload.
#[must_use]
pub fn problem_from(ctx: &WebRequestContext, error: WebFrameworkError) -> Response {
    problem_response(&error, ctx.problem_correlation())
}
