use crate::state::AppState;

use super::handlers::{entry_delete_handler, entry_list_handler};
use crate::entry::handlers::stream::{entry_video_play_url_handler, entry_video_stream_handler};
use axum::{
    Router,
    routing::{delete, get},
};
use crate::entry::handlers::download::entry_download_handler;

pub(crate) fn build_entry_protected_routers() -> Router<AppState> {
    Router::new()
        .route("/api/entry/list/", get(entry_list_handler))
        .route("/api/entry/list/{*path}", get(entry_list_handler))
        .route("/api/entry/delete/{*path}", delete(entry_delete_handler))
        .route("/api/entry/download/{*path}",get(entry_download_handler))
        .route("/api/video/get-play-url/{*path}", get(entry_video_play_url_handler))
}

pub(crate) fn build_entry_public_routers() -> Router<AppState> {
    Router::new().route("/api/video/stream/{*path}", get(entry_video_stream_handler))
}
