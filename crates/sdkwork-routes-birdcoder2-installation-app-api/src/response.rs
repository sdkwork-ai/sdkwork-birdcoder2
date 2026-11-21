//! Response construction for the installation App API surface.
//!
//! Success bodies are the platform envelope `{ code, data, traceId }`
//! (`API_SPEC.md` section 15.1); this single-resource read uses `data.item`, and
//! failures are RFC 9457 Problem+json built by the framework from the verified
//! context.

use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use sdkwork_utils_rust::{SdkWorkApiResponse, SdkWorkResourceData};
use sdkwork_web_core::{problem_response, WebFrameworkError, WebRequestContext};
use serde::Serialize;

/// Result of one handler body, already reduced to the framework taxonomy.
pub type ApiResult<T> = Result<T, WebFrameworkError>;

/// Wraps a single resource as `data.item`.
/// @param item - the resource payload.
/// @returns the standard single-resource data envelope.
#[must_use]
pub fn item_data<T>(item: T) -> SdkWorkResourceData<T> {
    SdkWorkResourceData { item }
}

/// Renders a `200` success envelope, mapping a failure to Problem+json.
/// @param ctx - verified request context supplying the correlation ids.
/// @param result - handler payload or the failure that replaced it.
/// @returns the HTTP response.
#[must_use]
pub fn finish_api_json<T: Serialize>(ctx: &WebRequestContext, result: ApiResult<T>) -> Response {
    match result {
        Ok(data) => envelope_response(ctx, StatusCode::OK, data),
        Err(error) => problem_from(ctx, error),
    }
}

/// Renders Problem+json for a handler that failed before building a payload.
/// @param ctx - verified request context supplying the correlation ids.
/// @param error - framework error to project.
/// @returns the Problem+json response.
#[must_use]
pub fn problem_from(ctx: &WebRequestContext, error: WebFrameworkError) -> Response {
    problem_response(&error, ctx.problem_correlation())
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
