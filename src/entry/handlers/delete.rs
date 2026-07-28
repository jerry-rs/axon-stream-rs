use crate::handlers::ApiResponse;
use crate::state::AppState;
use crate::utils::resolve_and_validate_path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use tracing::{error, info, instrument};

#[instrument(skip(state))]
pub(crate) async fn entry_delete_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::extract::Path(path): axum::extract::Path<String>,
) -> impl IntoResponse {
    let safe_path = match resolve_and_validate_path(&state.config.data_dir, path.as_str()).await {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };

    let result = if safe_path.is_dir() {
        tokio::fs::remove_dir_all(&safe_path).await
    } else {
        tokio::fs::remove_file(&safe_path).await
    };

    match result {
        Ok(()) => {
            info!("removed {}", safe_path.display());
            ApiResponse::ok().into_response()
        }
        Err(e) => {
            error!("{e}");
            ApiResponse::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("failed to remove {path}"),
            )
            .into_response()
        }
    }
}
