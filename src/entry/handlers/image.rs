use crate::extractors::auth::AuthPayload;
use crate::handlers::ApiResponse;
use crate::state::AppState;
use crate::utils::resolve_and_validate_path;
use crate::utils::sign::{generate_signed_url, now_secs, verify_sign};
use axum::{http::StatusCode, response::IntoResponse};
use serde::Deserialize;
use tower::ServiceExt;
use tracing::{error, info, instrument};

/// 图片通道独立 secret：与视频签名不互通，避免视频签名地址被拿去拉图片（反之亦然）
const IMAGE_URL_SECRET: &str = "image-view-url-secret";

#[derive(Deserialize, Debug)]
pub struct ImageStreamQuery {
    expire: u64,
    sign: String,
    uid: String,
}

#[instrument(skip(state, request))]
pub(crate) async fn entry_image_stream_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::extract::Path(path): axum::extract::Path<String>,
    axum::extract::Query(query): axum::extract::Query<ImageStreamQuery>,
    request: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    // 1. 校验过期时间
    if now_secs() > query.expire {
        error!("expire time is set");
        return ApiResponse::error(StatusCode::FORBIDDEN, "no permission").into_response();
    }

    // 2. 校验签名
    if !verify_sign(
        &path,
        query.expire,
        &query.uid,
        &query.sign,
        IMAGE_URL_SECRET,
    ) {
        error!("invalid signature");
        return ApiResponse::error(StatusCode::FORBIDDEN, "no permission").into_response();
    }
    let safe_path = match resolve_and_validate_path(&state.config.data_dir, path.as_str()).await {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };
    match tower_http::services::ServeFile::new(safe_path)
        .oneshot(request)
        .await
    {
        Ok(response) => response.into_response(),
        Err(e) => {
            error!("{e}");
            ApiResponse::error(StatusCode::INTERNAL_SERVER_ERROR, format!("{e}")).into_response()
        }
    }
}

#[instrument]
pub(crate) async fn entry_image_url_handler(
    axum::extract::Path(path): axum::extract::Path<String>,
    payload: AuthPayload,
) -> impl IntoResponse {
    let has_permission = payload.claims.sub.eq_ignore_ascii_case("admin");
    if !has_permission {
        return ApiResponse::error(StatusCode::FORBIDDEN, "no permission").into_response();
    }
    let image_url = generate_signed_url(
        path.as_str(),
        &payload.claims.sub,
        IMAGE_URL_SECRET,
        600,
    );
    info!("{image_url}");
    ApiResponse::success(image_url).into_response()
}
