pub(crate) mod sign;

use crate::handlers::ApiResponse;
use tracing::error;
pub(crate) async fn resolve_and_validate_path(
    parent: &std::path::Path,
    current: &str,
) -> Result<std::path::PathBuf, ApiResponse<()>> {
    let safe_path = match tokio::fs::canonicalize(parent.join(current)).await {
        Ok(p) => p,
        Err(e) => {
            error!("{e}");
            return Err(ApiResponse::error(
                axum::http::StatusCode::NOT_FOUND,
                format!("Not Found {current}"),
            ));
        }
    };
    if !safe_path.starts_with(parent) {
        error!(
            "{} outside {} directory",
            safe_path.display(),
            parent.display()
        );
        return Err(ApiResponse::error(
            axum::http::StatusCode::FORBIDDEN,
            "Access denied",
        ));
    }
    Ok(safe_path)
}



pub(crate) fn extract_client_ip(headers: &axum::http::HeaderMap, connect_info: &std::net::SocketAddr) -> String {
    if let Some(ip) = headers.get("x-real-ip").and_then(|v| v.to_str().ok()) {
        return ip.to_string();
    }
    if let Some(xff) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        if let Some(first) = xff.split(',').next() {
            return first.trim().to_string();
        }
    }
    connect_info.ip().to_string()
}
