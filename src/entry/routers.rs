use crate::state::AppState;

use crate::entry::handlers::delete::delete_handler;
use crate::entry::handlers::download::{download_handler, download_url_handler};
use crate::entry::handlers::image::{image_stream_handler, image_url_handler};
use crate::entry::handlers::list::list_handler;
use crate::entry::handlers::upload::{
    MAX_CHUNK_SIZE, upload_cancel_handler, upload_chunk_handler, upload_complete_handler,
    upload_init_handler, upload_status_handler,
};
use crate::entry::handlers::video::{video_play_url_handler, video_stream_handler};
use axum::extract::DefaultBodyLimit;
use axum::{
    Router,
    routing::{delete, get, post},
};

pub(crate) fn build_entry_protected_routers() -> Router<AppState> {
    Router::new()
        .route("/api/entry/list/", get(list_handler))
        .route("/api/entry/list/{*path}", get(list_handler))
        .route("/api/entry/delete/{*path}", delete(delete_handler))
        .route("/api/entry/upload/init", post(upload_init_handler))
        .route(
            "/api/entry/upload/status/{upload_id}",
            get(upload_status_handler),
        )
        .route(
            "/api/entry/upload/chunk/{upload_id}/{index}",
            post(upload_chunk_handler).layer(DefaultBodyLimit::max(
                (MAX_CHUNK_SIZE + 1024 * 1024) as usize,
            )),
        )
        .route(
            "/api/entry/upload/complete/{upload_id}",
            post(upload_complete_handler),
        )
        .route(
            "/api/entry/upload/{upload_id}",
            delete(upload_cancel_handler),
        )
        .route(
            "/api/video/get-play-url/{*path}",
            get(video_play_url_handler),
        )
        .route("/api/image/get-url/{*path}", get(image_url_handler))
        .route(
            "/api/entry/get-download-url/{*path}",
            get(download_url_handler),
        )
}

pub(crate) fn build_entry_public_routers() -> Router<AppState> {
    Router::new()
        .route("/api/video/stream/{*path}", get(video_stream_handler))
        .route("/api/image/stream/{*path}", get(image_stream_handler))
        .route("/api/entry/download/{*path}", get(download_handler))
}
