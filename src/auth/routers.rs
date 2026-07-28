use axum::Router;
use axum::routing::post;
use crate::auth::handlers::login::auth_login_handler;
use crate::auth::handlers::refresh::auth_refresh_handler;
use crate::state::AppState;

pub(crate) fn build_auth_protected_routers() -> Router<AppState> {
    Router::new()
        .route("/api/auth/refresh",post(auth_refresh_handler))
}

pub(crate) fn build_auth_public_routers() -> Router<AppState> {
    Router::new()
        .route("/api/auth/login",post(auth_login_handler))
}