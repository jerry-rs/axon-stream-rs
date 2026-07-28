use crate::auth::routers::{build_auth_protected_routers, build_auth_public_routers};
use crate::entry::routers::{build_entry_protected_routers, build_entry_public_routers};
use crate::middlewares::auth::auth_middleware;
use crate::state::AppState;
use axum::{Router, middleware};
use axum::http::Uri;

#[derive(rust_embed::Embed)]
#[folder = "dist/"]
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
}

pub(crate) fn build_global_routers(state: AppState) -> Router {
    Router::new()
        .merge(build_protected_routers())
        .merge(build_public_routers())
        .fallback(static_handler)
        .with_state(state)
}
