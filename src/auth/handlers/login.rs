use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use serde::Deserialize;
use tracing::error;
use crate::extractors::auth::Claims;
use crate::handlers::ApiResponse;
use crate::models::user::User;
use crate::state::AppState;

#[derive(Deserialize)]
pub(crate) struct AuthLoginRequest {
    username: String,
    password: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthLoginResponse {
    token_type: &'static str,
    access_token: String,
    refresh_token: String,
    access_token_expires_in: i64,
    refresh_token_expires_in: i64,
}

pub(crate) async fn auth_login_handler(
    State(mut state): State<AppState>,
    Json(req): Json<AuthLoginRequest>,
) -> impl IntoResponse {
    if let Err(e) = User::filter_by_username(&req.username)
        .filter(User::fields().password().eq(&req.password))
        .first()
        .exec(&mut state.db)
        .await{
        error!("{:#?}", e);
        return ApiResponse::error(StatusCode::UNAUTHORIZED, "invalid username or password")
            .into_response();
    }
    let access_exp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize
        +3_600; // 1 hour
    let access_claims = Claims::new(req.username.clone(), access_exp);
    let access_token = match access_claims.encode() {
        Ok(t) => t,
        Err(e) => {
            error!("Failed JWT encode: {e}");
            return ApiResponse::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to generate token",
            )
            .into_response();
        }
    };

    // Generate refresh token with longer expiration (e.g., 7 days)
    let refresh_exp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize
        + 10_800; // 3 hours
    let refresh_claims = Claims::new(req.username, refresh_exp);
    let refresh_token = match refresh_claims.encode() {
        Ok(t) => t,
        Err(e) => {
            error!("failed JWT refresh token encode: {e}");
            return ApiResponse::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to generate refresh token",
            )
                .into_response();
        }
    };

    ApiResponse::success(AuthLoginResponse {
        token_type:"Bearer",
        access_token,
        refresh_token,
        access_token_expires_in:3_600,
        refresh_token_expires_in:10_800,
    }).into_response()
}
