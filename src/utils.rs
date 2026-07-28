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
