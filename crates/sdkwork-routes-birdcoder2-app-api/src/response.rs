//! Response construction for the mobile App API surface.
//!
//! Success bodies are the platform envelope `{ code, data, traceId }`
//! (`API_SPEC.md` section 15.1): single resources use `data.item`, lists use
//! `data.items` plus `data.pageInfo`, and failures are RFC 9457 Problem+json
//! built by the framework from the verified context.

use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use sdkwork_birdcoder2_host_runtime_service::HostRuntimeError;
use sdkwork_utils_rust::{PageInfo, PageMode, SdkWorkApiResponse, SdkWorkPageData, SdkWorkResourceData};
use sdkwork_web_core::{problem_response, WebFrameworkError, WebRequestContext};

use crate::errors::to_framework_error;

/// Result of one handler body, already reduced to the domain taxonomy.
pub type ApiResult<T> = Result<T, HostRuntimeError>;

/// Wraps a single resource as `data.item`.
#[must_use]
pub fn item_data<T>(item: T) -> SdkWorkResourceData<T> {
    SdkWorkResourceData { item }
}

/// Wraps a cursor page as `data.items` plus `data.pageInfo`.
///
/// `pageInfo.mode` is always `cursor`: every BirdCoder2 list is watermark
/// paginated so a phone resumes exactly where it stopped
/// (`PAGINATION_SPEC.md` section 3).
#[must_use]
pub fn cursor_page_data<T>(
    items: Vec<T>,
    next_cursor: Option<String>,
    page_size: u32,
    has_more: bool,
) -> SdkWorkPageData<T> {
    SdkWorkPageData {
        items,
        page_info: PageInfo {
            mode: PageMode::Cursor,
            page: None,
            page_size: Some(i32::try_from(page_size).unwrap_or(i32::MAX)),
            total_items: None,
            total_pages: None,
            next_cursor,
            has_more: Some(has_more),
        },
    }
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

/// Renders a `204` deletion with no body, mapping a domain failure to
/// Problem+json.
#[must_use]
pub fn deleted_api_response(ctx: &WebRequestContext, result: ApiResult<()>) -> Response {
    match result {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => problem_response(&to_framework_error(error), ctx.problem_correlation()),
    }
}

/// Renders Problem+json for a handler that failed before building a payload.
#[must_use]
pub fn problem_from(ctx: &WebRequestContext, error: WebFrameworkError) -> Response {
    problem_response(&error, ctx.problem_correlation())
}
