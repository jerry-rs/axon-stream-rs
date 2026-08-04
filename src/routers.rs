use crate::auth::routers::{build_auth_protected_routers, build_auth_public_routers};
use crate::entry::routers::{build_entry_protected_routers, build_entry_public_routers};
use crate::middlewares::auth::auth_middleware;
use crate::state::AppState;
use crate::utils::extract_client_ip;
use axum::body::Body;
use axum::extract::{ConnectInfo, MatchedPath};
use axum::http::{Request, Response, Uri};
use axum::{Router, middleware};
use std::time::Duration;
use tracing::Span;
#[derive(rust_embed::Embed)]
#[folder = "web/dist"]
struct Assets;

// 静态资源及 SPA 路由兜底处理器
async fn static_handler(uri: Uri) -> axum::response::Response {
    let path = uri.path().trim_start_matches('/');
    // 1. 过滤：如果请求的是不存在的 API 接口，直接返回 API 的 404，不返回前端页面
    if path.starts_with("api/") || path == "api" {
        return axum::response::Response::builder()
            .status(axum::http::StatusCode::NOT_FOUND)
            .header(
                axum::http::header::CONTENT_TYPE,
                "text/plain; charset=utf-8",
            )
            .body(axum::body::Body::from("404 Not Found API"))
            .unwrap();
    }

    // 2. 确定请求路径（根路径默认指向 index.html）
    let target_path = if path.is_empty() { "index.html" } else { path };

    // 3. 尝试匹配静态文件（如 .js, .css, .png 等）
    if let Some(content) = Assets::get(target_path) {
        let mime_type = content.metadata.mimetype();
        axum::response::Response::builder()
            .status(axum::http::StatusCode::OK)
            .header(axum::http::header::CONTENT_TYPE, mime_type)
            .body(axum::body::Body::from(content.data))
            .unwrap()
    } else {
        // 4. SPA 路由回退：静态资源未找到时（如访问前端路由 /dashboard），统一返回 index.html
        if let Some(index) = Assets::get("index.html") {
            axum::response::Response::builder()
                .status(axum::http::StatusCode::OK)
                .header(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")
                .body(axum::body::Body::from(index.data))
                .unwrap()
        } else {
            axum::response::Response::builder()
                .status(axum::http::StatusCode::NOT_FOUND)
                .header(
                    axum::http::header::CONTENT_TYPE,
                    "text/plain; charset=utf-8",
                )
                .body(axum::body::Body::from("404 Not Found"))
                .unwrap()
        }
    }
}

fn build_protected_routers() -> Router<AppState> {
    Router::new()
        .merge(build_entry_protected_routers())
        .merge(build_auth_protected_routers())
        .layer(middleware::from_fn(auth_middleware))
}
fn build_public_routers() -> Router<AppState> {
    Router::new()
        .merge(build_auth_public_routers())
        .merge(build_entry_public_routers())
        .route("/health", axum::routing::get(|| async { "healthy" }))
}

pub(crate) fn build_global_routers(state: AppState) -> Router {
    Router::new()
        .merge(build_protected_routers())
        .merge(build_public_routers())
        .fallback(static_handler)
        .layer(
            tower_http::trace::TraceLayer::new_for_http()
                .make_span_with(|request: &Request<Body>| {
                    // request-id 由外层 SetRequestIdLayer 已经写入 header,这里直接读
                    let request_id = request
                        .headers()
                        .get("x-request-id")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("unknown")
                        .to_string();

                    let matched_path = request
                        .extensions()
                        .get::<MatchedPath>()
                        .map(|p| p.as_str())
                        .unwrap_or_else(|| request.uri().path());

                    let ip = request
                        .extensions()
                        .get::<ConnectInfo<std::net::SocketAddr>>()
                        .map(|ci| extract_client_ip(request.headers(), &ci.0))
                        .unwrap_or_else(|| "unknown".to_string());

                    tracing::span!(
                        tracing::Level::INFO,
                        "http_request",
                        request_id = %request_id,
                        method = %request.method(),
                        path = %matched_path,
                        ip = %ip,
                        user_agent = request
                            .headers()
                            .get("user-agent")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or(""),
                        status = tracing::field::Empty,
                        latency_ms = tracing::field::Empty,
                    )
                })
                .on_response(
                    |response: &Response<Body>, latency: Duration, span: &Span| {
                        span.record("status", response.status().as_u16());
                        span.record("latency_ms", latency.as_millis() as u64);
                        tracing::info!(parent: span, "request completed");
                    },
                ),
        )
        .layer(tower_http::request_id::SetRequestIdLayer::x_request_id(
            tower_http::request_id::MakeRequestUuid,
        ))
        .with_state(state)
}
