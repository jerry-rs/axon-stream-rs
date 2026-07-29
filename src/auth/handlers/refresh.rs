use crate::extractors::auth::Claims;
use crate::handlers::ApiResponse;
use crate::state::AppState;
use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use serde::Deserialize;
use tracing::error;

#[derive(Deserialize)]
pub(crate) struct AuthRefreshRequest {
    refresh_token: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthRefreshResponse {
    token_type: &'static str,
    access_token: String,
    refresh_token: String,
    access_token_expires_in: i64,
    refresh_token_expires_in: i64,
}

pub(crate) async fn auth_refresh_handler(
    State(_state): State<AppState>,
    Json(req): Json<AuthRefreshRequest>,
) -> impl IntoResponse {
    // 验证 refresh token
    let refresh_claims = match Claims::decode(&req.refresh_token) {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to decode refresh token: {e}");
            return ApiResponse::error(
                StatusCode::UNAUTHORIZED,
                "invalid or expired refresh token",
            )
            .into_response();
        }
    };

    // 生成新的 access token
    let access_exp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize
        + 3_600; // 1 hours

    let new_access_claims = Claims::new(refresh_claims.sub.clone(), access_exp);

    let access_token = match new_access_claims.encode() {
        Ok(t) => t,
        Err(e) => {
            error!("Failed to encode new access token: {e}");
            return ApiResponse::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to generate new access token",
            )
            .into_response();
        }
    };

    // 生成新的 refresh token（可选：刷新 refresh token 的有效期）
    let refresh_exp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize
        + 10_800; // 3 hours

    let new_refresh_claims = Claims::new(refresh_claims.sub, refresh_exp);

    let refresh_token = match new_refresh_claims.encode() {
        Ok(t) => t,
        Err(e) => {
            error!("Failed to encode new refresh token: {e}");
            return ApiResponse::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to generate new refresh token",
            )
            .into_response();
        }
    };

    ApiResponse::success(AuthRefreshResponse {
        token_type: "Bearer",
        access_token,
        refresh_token,
        access_token_expires_in: 3_600,
        refresh_token_expires_in: 10_800,
    })
    .into_response()
}
