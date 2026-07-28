use crate::extractors::auth::AuthPayload;
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;

pub(crate) async fn auth_middleware(
    payload: AuthPayload,
    request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    if payload.claims.sub == "admin" {
        Ok(next.run(request).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}
