use crate::state::AppState;

use crate::entry::handlers::delete::entry_delete_handler;
use crate::entry::handlers::download::{entry_download_handler, entry_download_url_handler};
use crate::entry::handlers::image::{entry_image_stream_handler, entry_image_url_handler};
use crate::entry::handlers::list::entry_list_handler;
use crate::entry::handlers::upload::{
    MAX_CHUNK_SIZE, entry_upload_cancel_handler, entry_upload_chunk_handler,
    entry_upload_complete_handler, entry_upload_init_handler, entry_upload_status_handler,
};
use crate::entry::handlers::video::{entry_video_play_url_handler, entry_video_stream_handler};
use axum::extract::DefaultBodyLimit;
use axum::{
    Router,
    routing::{delete, get, post},
};

pub(crate) fn build_entry_protected_routers() -> Router<AppState> {
    Router::new()
        .route("/api/entry/list/", get(entry_list_handler))
        .route("/api/entry/list/{*path}", get(entry_list_handler))
        .route("/api/entry/delete/{*path}", delete(entry_delete_handler))
        .route("/api/entry/upload/init", post(entry_upload_init_handler))
        .route(
            "/api/entry/upload/status/{upload_id}",
            get(entry_upload_status_handler),
        )
        .route(
            "/api/entry/upload/chunk/{upload_id}/{index}",
            post(entry_upload_chunk_handler).layer(DefaultBodyLimit::max(
                (MAX_CHUNK_SIZE + 1024 * 1024) as usize,
            )),
        )
        .route(
            "/api/entry/upload/complete/{upload_id}",
            post(entry_upload_complete_handler),
        )
        .route(
            "/api/entry/upload/{upload_id}",
            delete(entry_upload_cancel_handler),
        )
        .route(
            "/api/video/get-play-url/{*path}",
            get(entry_video_play_url_handler),
        )
        .route("/api/image/get-url/{*path}", get(entry_image_url_handler))
        .route(
            "/api/entry/get-download-url/{*path}",
            get(entry_download_url_handler),
        )
}

pub(crate) fn build_entry_public_routers() -> Router<AppState> {
    Router::new()
        .route("/api/video/stream/{*path}", get(entry_video_stream_handler))
        .route("/api/image/stream/{*path}", get(entry_image_stream_handler))
        .route("/api/entry/download/{*path}", get(entry_download_handler))
}
