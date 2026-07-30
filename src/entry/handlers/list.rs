use std::time::SystemTime;

use crate::handlers::ApiResponse;
use crate::{state::AppState, utils::resolve_and_validate_path};
use axum::{http::StatusCode, response::IntoResponse};
use serde::Serialize;
use tracing::{error, instrument, warn};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ListItem {
    name: String,
    ext: String,
    entry_type: String,
    size: u64,
    created: u64,
    modified: u64,
    accessed: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(transparent)]
struct ListResponse {
    items: Vec<ListItem>,
}

/// 将 std::fs::Metadata 的时间转为 Unix 秒级时间戳，不支持的平台返回 0
fn unix_ts(
    meta: Option<&std::fs::Metadata>,
    f: fn(&std::fs::Metadata) -> std::io::Result<SystemTime>,
) -> u64 {
    meta.and_then(|m| f(m).ok())
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn file_type_str(meta: &std::fs::Metadata) -> &'static str {
    if meta.is_dir() {
        "d"
    } else if meta.is_symlink() {
        "l"
    } else {
        "f"
    }
}

#[instrument(skip(state))]
pub(crate) async fn entry_list_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    option_path: Option<axum::extract::Path<String>>,
) -> impl IntoResponse {
    let path = match option_path {
        Some(axum::extract::Path(ref p)) => p.as_str(),
        None => state.config.data_dir.to_str().unwrap_or_default(),
    };
    let safe_path = match resolve_and_validate_path(&state.config.data_dir, path).await {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };
    let mut items = Vec::new();
    match tokio::fs::read_dir(safe_path).await {
        Ok(mut entries) => {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let name = entry.file_name().into_string().unwrap_or_else(|bad| {
                    warn!("non-UTF8 filename: {:?}", bad);
                    bad.to_string_lossy().into_owned()
                });
                if name.eq_ignore_ascii_case(".") || name.eq_ignore_ascii_case("..") {
                    continue;
                }
                // 分片上传会话目录属内部实现，不对外展示
                if name == super::upload::UPLOAD_TMP_DIR {
                    continue;
                }
                let ext = entry
                    .path()
                    .extension()
                    .map(|e| e.to_string_lossy().into_owned())
                    .unwrap_or_default();

                // 一次 metadata() 调用拿到：类型、大小、时间
                let meta = entry.metadata().await.ok();
                let entry_type = meta.as_ref().map_or("u", file_type_str).to_string();
                let size = meta.as_ref().map_or(0, |m| m.len());
                // 借用 meta 传给 unix_ts，调用结束后再 consume 为 owned strings
                let created = unix_ts(meta.as_ref(), |m| m.created());
                let modified = unix_ts(meta.as_ref(), |m| m.modified());
                let accessed = unix_ts(meta.as_ref(), |m| m.accessed());
                // let mime_type = mime_guess::from_path(entry.path())
                //     .first_or_octet_stream()
                //     .essence_str()
                //     .to_string();

                items.push(ListItem {
                    name,
                    ext,
                    entry_type,
                    size,
                    created,
                    modified,
                    accessed,
                });
            }
        }
        Err(e) => {
            error!("{e}");
            return ApiResponse::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to read folder {path}"),
            )
            .into_response();
        }
    }
    items.sort_by(|a, b|
        a.entry_type.cmp(&b.entry_type)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.modified.cmp(&b.modified).reverse())
    );
    ApiResponse::success(ListResponse { items}).into_response()
}
