use crate::handlers::ApiResponse;
use crate::state::AppState;
use crate::utils::resolve_and_validate_path;
use crate::utils::sign::now_secs;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::sync::atomic::{AtomicU64, Ordering};
use tracing::{error, info, instrument, warn};

/// 分片会话临时目录名（位于 data_dir 下，合并 rename 时不跨文件系统）
pub(super) const UPLOAD_TMP_DIR: &str = ".uploads";
/// 单分片大小上限，路由层据此放宽 DefaultBodyLimit
pub(crate) const MAX_CHUNK_SIZE: u64 = 32 * 1024 * 1024;
const MIN_CHUNK_SIZE: u64 = 1024 * 1024;
const DEFAULT_CHUNK_SIZE: u64 = 8 * 1024 * 1024;
/// 会话保留时长，过期会话由 init 惰性清理
const SESSION_TTL_SECS: u64 = 24 * 3600;
const META_FILE: &str = "meta.json";
const LOCK_FILE: &str = "merge.lock";
const PART_SUFFIX: &str = ".part";
const MERGING_SUFFIX: &str = ".uploading";

/// 分片临时文件名后缀，避免同分片并发写互相截断
static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct UploadMeta {
    filename: String,
    /// 目标目录（相对 data_dir 的原始客户端路径）
    target_dir: String,
    total_size: u64,
    chunk_size: u64,
    /// 可选的文件整体 sha256（hex），提供时合并阶段校验
    file_hash: Option<String>,
    created_at: u64,
}

impl UploadMeta {
    fn total_chunks(&self) -> u64 {
        self.total_size.div_ceil(self.chunk_size)
    }

    fn expected_chunk_size(&self, index: u64) -> u64 {
        let start = index * self.chunk_size;
        self.chunk_size.min(self.total_size - start)
    }
}

fn is_valid_upload_id(id: &str) -> bool {
    id.len() == 64 && id.bytes().all(|b| b.is_ascii_hexdigit())
}

fn validate_filename(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains('/') && !name.contains('\\')
}

/// upload_id 由目标位置与文件指纹确定性生成：
/// 客户端刷新/重连后用相同参数重新 init 即可找回会话续传
fn compute_upload_id(
    target_dir: &std::path::Path,
    filename: &str,
    total_size: u64,
    file_hash: Option<&str>,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(target_dir.as_os_str().as_encoded_bytes());
    hasher.update([0]);
    hasher.update(filename.as_bytes());
    hasher.update([0]);
    hasher.update(total_size.to_string().as_bytes());
    hasher.update([0]);
    hasher.update(file_hash.unwrap_or_default().as_bytes());
    hex::encode(hasher.finalize())
}

fn session_dir(data_dir: &std::path::Path, upload_id: &str) -> std::path::PathBuf {
    data_dir.join(UPLOAD_TMP_DIR).join(upload_id)
}

async fn load_meta(dir: &std::path::Path) -> Result<UploadMeta, ApiResponse<()>> {
    let bytes = tokio::fs::read(dir.join(META_FILE)).await.map_err(|e| {
        error!("read upload meta failed: {e}");
        ApiResponse::error(StatusCode::NOT_FOUND, "upload session not found or expired")
    })?;
    serde_json::from_slice(&bytes).map_err(|e| {
        error!("parse upload meta failed: {e}");
        ApiResponse::error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "corrupted upload session",
        )
    })
}

/// 列出会话目录中已落盘的分片序号（`{index}.part`）
async fn list_uploaded_chunks(dir: &std::path::Path) -> Result<BTreeSet<u64>, ApiResponse<()>> {
    let mut set = BTreeSet::new();
    let mut entries = tokio::fs::read_dir(dir).await.map_err(|e| {
        error!("read upload session dir failed: {e}");
        ApiResponse::error(StatusCode::NOT_FOUND, "upload session not found or expired")
    })?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if let Some(index) = name
            .strip_suffix(PART_SUFFIX)
            .and_then(|s| s.parse::<u64>().ok())
        {
            set.insert(index);
        }
    }
    Ok(set)
}

/// 清理超过 SESSION_TTL_SECS 的失效会话；meta 缺失/损坏时按目录 mtime 判断
async fn cleanup_stale_sessions(data_dir: std::path::PathBuf) {
    let root = data_dir.join(UPLOAD_TMP_DIR);
    let mut entries = match tokio::fs::read_dir(&root).await {
        Ok(e) => e,
        Err(_) => return,
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let Ok(file_type) = entry.file_type().await else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let Some(id) = name.to_str() else { continue };
        if !is_valid_upload_id(id) {
            continue;
        }
        let created = match tokio::fs::read(entry.path().join(META_FILE)).await {
            Ok(bytes) => serde_json::from_slice::<UploadMeta>(&bytes)
                .ok()
                .map(|m| m.created_at),
            Err(_) => None,
        };
        let created = match created {
            Some(t) => t,
            None => entry
                .metadata()
                .await
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or_else(now_secs),
        };
        if now_secs().saturating_sub(created) > SESSION_TTL_SECS {
            info!("cleanup stale upload session {id}");
            if let Err(e) = tokio::fs::remove_dir_all(entry.path()).await {
                warn!("cleanup upload session {id} failed: {e}");
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/* init / status                                                       */
/* ------------------------------------------------------------------ */

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InitUploadRequest {
    /// 目标目录（相对 data_dir，缺省为根目录），必须已存在
    path: Option<String>,
    filename: String,
    total_size: u64,
    chunk_size: Option<u64>,
    file_hash: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InitUploadResponse {
    upload_id: String,
    chunk_size: u64,
    total_chunks: u64,
    /// 已落盘的分片序号，断点续传时客户端只需补传其余分片
    uploaded_chunks: Vec<u64>,
    /// 目标文件已存在且大小一致，无需上传（简易秒传）
    completed: bool,
}

#[instrument(skip(state, req))]
pub(crate) async fn upload_init_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::Json(req): axum::Json<InitUploadRequest>,
) -> impl IntoResponse {
    if !validate_filename(&req.filename) {
        return ApiResponse::error(StatusCode::BAD_REQUEST, "invalid filename").into_response();
    }
    if req.total_size == 0 {
        return ApiResponse::error(StatusCode::BAD_REQUEST, "total_size must be greater than 0")
            .into_response();
    }
    let chunk_size = req.chunk_size.unwrap_or(DEFAULT_CHUNK_SIZE);
    if !(MIN_CHUNK_SIZE..=MAX_CHUNK_SIZE).contains(&chunk_size) {
        return ApiResponse::error(
            StatusCode::BAD_REQUEST,
            format!("chunk_size must be in [{MIN_CHUNK_SIZE}, {MAX_CHUNK_SIZE}]"),
        )
        .into_response();
    }

    let target_rel = req.path.as_deref().unwrap_or_default();
    let target_dir = match resolve_and_validate_path(&state.config.data_dir, target_rel).await {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };
    match tokio::fs::metadata(&target_dir).await {
        Ok(m) if m.is_dir() => {}
        _ => {
            return ApiResponse::error(StatusCode::BAD_REQUEST, "target path is not a directory")
                .into_response();
        }
    }

    let upload_id = compute_upload_id(
        &target_dir,
        &req.filename,
        req.total_size,
        req.file_hash.as_deref(),
    );
    let final_path = target_dir.join(&req.filename);
    if let Ok(file_meta) = tokio::fs::metadata(&final_path).await
        && file_meta.is_file()
    {
        // 同名同大小视为秒传成功；大小不一致直接拒绝，由调用方改名或先删除
        if file_meta.len() == req.total_size {
            info!("instant upload hit: {}", final_path.display());
            let total_chunks = req.total_size.div_ceil(chunk_size);
            return ApiResponse::success(InitUploadResponse {
                upload_id,
                chunk_size,
                total_chunks,
                uploaded_chunks: (0..total_chunks).collect(),
                completed: true,
            })
            .into_response();
        }
        return ApiResponse::error(
            StatusCode::CONFLICT,
            format!("file '{}' already exists", req.filename),
        )
        .into_response();
    }

    let dir = session_dir(&state.config.data_dir, &upload_id);
    let meta = if tokio::fs::try_exists(&dir).await.unwrap_or(false) {
        // 会话已存在：断点续传，以服务端 meta 为准（客户端 chunk_size 可能变化）
        match load_meta(&dir).await {
            Ok(m) => m,
            Err(e) => return e.into_response(),
        }
    } else {
        if let Err(e) = tokio::fs::create_dir_all(&dir).await {
            error!("create upload session dir failed: {e}");
            return ApiResponse::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to init upload session",
            )
            .into_response();
        }
        let meta = UploadMeta {
            filename: req.filename.clone(),
            target_dir: target_rel.to_string(),
            total_size: req.total_size,
            chunk_size,
            file_hash: req.file_hash.clone(),
            created_at: now_secs(),
        };
        let persisted = match serde_json::to_vec(&meta) {
            Ok(bytes) => {
                let tmp = dir.join(format!("{META_FILE}.tmp"));
                match tokio::fs::write(&tmp, &bytes).await {
                    Ok(()) => tokio::fs::rename(&tmp, dir.join(META_FILE)).await,
                    Err(e) => Err(e),
                }
            }
            Err(e) => Err(std::io::Error::new(std::io::ErrorKind::InvalidData, e)),
        };
        if let Err(e) = persisted {
            error!("persist upload meta failed: {e}");
            return ApiResponse::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to init upload session",
            )
            .into_response();
        }
        meta
    };

    let uploaded = match list_uploaded_chunks(&dir).await {
        Ok(s) => s,
        Err(e) => return e.into_response(),
    };

    tokio::spawn(cleanup_stale_sessions(state.config.data_dir.clone()));

    ApiResponse::success(InitUploadResponse {
        upload_id,
        chunk_size: meta.chunk_size,
        total_chunks: meta.total_chunks(),
        uploaded_chunks: uploaded.into_iter().collect(),
        completed: false,
    })
    .into_response()
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UploadStatusResponse {
    upload_id: String,
    chunk_size: u64,
    total_size: u64,
    total_chunks: u64,
    uploaded_chunks: Vec<u64>,
}

#[instrument(skip(state))]
pub(crate) async fn upload_status_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::extract::Path(upload_id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if !is_valid_upload_id(&upload_id) {
        return ApiResponse::error(StatusCode::BAD_REQUEST, "invalid upload id").into_response();
    }
    let dir = session_dir(&state.config.data_dir, &upload_id);
    let meta = match load_meta(&dir).await {
        Ok(m) => m,
        Err(e) => return e.into_response(),
    };
    let uploaded = match list_uploaded_chunks(&dir).await {
        Ok(s) => s,
        Err(e) => return e.into_response(),
    };
    ApiResponse::success(UploadStatusResponse {
        upload_id,
        chunk_size: meta.chunk_size,
        total_size: meta.total_size,
        total_chunks: meta.total_chunks(),
        uploaded_chunks: uploaded.into_iter().collect(),
    })
    .into_response()
}

/* ------------------------------------------------------------------ */
/* chunk                                                               */
/* ------------------------------------------------------------------ */

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UploadChunkResponse {
    index: u64,
    received: u64,
}

#[instrument(skip(state, body), fields(upload_id = %upload_id, index = index))]
pub(crate) async fn upload_chunk_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::extract::Path((upload_id, index)): axum::extract::Path<(String, u64)>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    if !is_valid_upload_id(&upload_id) {
        return ApiResponse::error(StatusCode::BAD_REQUEST, "invalid upload id").into_response();
    }
    let dir = session_dir(&state.config.data_dir, &upload_id);
    let meta = match load_meta(&dir).await {
        Ok(m) => m,
        Err(e) => return e.into_response(),
    };

    let total_chunks = meta.total_chunks();
    if index >= total_chunks {
        return ApiResponse::error(
            StatusCode::BAD_REQUEST,
            format!("chunk index out of range (total {total_chunks})"),
        )
        .into_response();
    }
    let expected = meta.expected_chunk_size(index);
    if body.len() as u64 != expected {
        return ApiResponse::error(
            StatusCode::BAD_REQUEST,
            format!(
                "chunk {index} size mismatch: expect {expected} bytes, got {}",
                body.len()
            ),
        )
        .into_response();
    }

    // 写唯一临时文件再 rename：同分片并发/重传时互相覆盖也是原子提交
    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp = dir.join(format!(
        "{index}{PART_SUFFIX}.{}-{seq}.tmp",
        std::process::id()
    ));
    if let Err(e) = tokio::fs::write(&tmp, &body).await {
        error!("write chunk {index} failed: {e}");
        return ApiResponse::error(StatusCode::INTERNAL_SERVER_ERROR, "failed to store chunk")
            .into_response();
    }
    if let Err(e) = tokio::fs::rename(&tmp, dir.join(format!("{index}{PART_SUFFIX}"))).await {
        error!("commit chunk {index} failed: {e}");
        let _ = tokio::fs::remove_file(&tmp).await;
        return ApiResponse::error(StatusCode::INTERNAL_SERVER_ERROR, "failed to store chunk")
            .into_response();
    }

    ApiResponse::success(UploadChunkResponse {
        index,
        received: body.len() as u64,
    })
    .into_response()
}

/* ------------------------------------------------------------------ */
/* complete / cancel                                                   */
/* ------------------------------------------------------------------ */

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MissingChunks {
    missing: Vec<u64>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CompleteUploadResponse {
    /// 合并后的文件路径（相对 data_dir）
    path: String,
    size: u64,
}

/// 顺序合并分片到临时文件，逐分片校验大小，可选校验整体 sha256。
/// 返回写入总字节数；Err 为人可读原因（分片损坏时指明序号）。
fn merge_chunks(
    dir: &std::path::Path,
    meta: &UploadMeta,
    merging_path: &std::path::Path,
) -> Result<u64, String> {
    use std::io::{BufReader, BufWriter, Read, Write};

    let out =
        std::fs::File::create(merging_path).map_err(|e| format!("create merging file: {e}"))?;
    let mut writer = BufWriter::with_capacity(1024 * 1024, out);
    let mut hasher = meta.file_hash.as_ref().map(|_| Sha256::new());
    let mut buf = vec![0u8; 256 * 1024];
    let mut written = 0u64;

    for index in 0..meta.total_chunks() {
        let part_path = dir.join(format!("{index}{PART_SUFFIX}"));
        let expected = meta.expected_chunk_size(index);
        let part_len = std::fs::metadata(&part_path)
            .map_err(|e| format!("chunk {index}: {e}"))?
            .len();
        if part_len != expected {
            return Err(format!(
                "chunk {index} corrupted: expect {expected} bytes, got {part_len}"
            ));
        }
        let part = std::fs::File::open(&part_path).map_err(|e| format!("chunk {index}: {e}"))?;
        let mut reader = BufReader::with_capacity(256 * 1024, part);
        loop {
            let n = reader
                .read(&mut buf)
                .map_err(|e| format!("chunk {index} read: {e}"))?;
            if n == 0 {
                break;
            }
            writer
                .write_all(&buf[..n])
                .map_err(|e| format!("merge write: {e}"))?;
            if let Some(h) = hasher.as_mut() {
                h.update(&buf[..n]);
            }
            written += n as u64;
        }
    }
    writer.flush().map_err(|e| format!("merge flush: {e}"))?;

    if written != meta.total_size {
        return Err(format!(
            "total size mismatch: expect {}, got {written}",
            meta.total_size
        ));
    }
    if let (Some(h), Some(expected_hex)) = (hasher, meta.file_hash.as_deref()) {
        let actual = hex::encode(h.finalize());
        if !actual.eq_ignore_ascii_case(expected_hex) {
            return Err(format!(
                "file hash mismatch: expect {expected_hex}, got {actual}"
            ));
        }
    }
    Ok(written)
}

async fn finalize_upload(
    state: &AppState,
    dir: &std::path::Path,
    meta: &UploadMeta,
) -> Result<CompleteUploadResponse, axum::response::Response> {
    let total_chunks = meta.total_chunks();
    let uploaded = list_uploaded_chunks(dir)
        .await
        .map_err(|e| e.into_response())?;
    if (uploaded.len() as u64) < total_chunks {
        let missing: Vec<u64> = (0..total_chunks)
            .filter(|i| !uploaded.contains(i))
            .collect();
        return Err(ApiResponse::error_with_data(
            StatusCode::BAD_REQUEST,
            "missing chunks",
            MissingChunks { missing },
        )
        .into_response());
    }

    let target_dir = resolve_and_validate_path(&state.config.data_dir, &meta.target_dir)
        .await
        .map_err(|e| e.into_response())?;
    let final_path = target_dir.join(&meta.filename);
    if tokio::fs::try_exists(&final_path).await.unwrap_or(false) {
        return Err(ApiResponse::error(
            StatusCode::CONFLICT,
            format!("file '{}' already exists", meta.filename),
        )
        .into_response());
    }

    // 先合并到 .uploading 临时文件再 rename，避免中途失败留下同名半成品
    let merging_path = target_dir.join(format!("{}{MERGING_SUFFIX}", meta.filename));
    let session_dir = dir.to_path_buf();
    let meta_owned = meta.clone();
    let merging_arg = merging_path.clone();
    let written = match tokio::task::spawn_blocking(move || {
        merge_chunks(&session_dir, &meta_owned, &merging_arg)
    })
    .await
    {
        Ok(Ok(n)) => n,
        Ok(Err(msg)) => {
            error!("merge chunks failed: {msg}");
            let _ = tokio::fs::remove_file(&merging_path).await;
            return Err(ApiResponse::error(StatusCode::CONFLICT, msg).into_response());
        }
        Err(e) => {
            error!("merge task failed: {e}");
            let _ = tokio::fs::remove_file(&merging_path).await;
            return Err(ApiResponse::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to merge chunks",
            )
            .into_response());
        }
    };

    if let Err(e) = tokio::fs::rename(&merging_path, &final_path).await {
        error!("commit merged file failed: {e}");
        let _ = tokio::fs::remove_file(&merging_path).await;
        return Err(
            ApiResponse::error(StatusCode::INTERNAL_SERVER_ERROR, "failed to commit file")
                .into_response(),
        );
    }

    info!("upload merged: {} ({written} bytes)", final_path.display());
    let rel_path = if meta.target_dir.is_empty() {
        meta.filename.clone()
    } else {
        format!("{}/{}", meta.target_dir.trim_matches('/'), meta.filename)
    };
    Ok(CompleteUploadResponse {
        path: rel_path,
        size: written,
    })
}

#[instrument(skip(state), fields(upload_id = %upload_id))]
pub(crate) async fn upload_complete_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::extract::Path(upload_id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if !is_valid_upload_id(&upload_id) {
        return ApiResponse::error(StatusCode::BAD_REQUEST, "invalid upload id").into_response();
    }
    let dir = session_dir(&state.config.data_dir, &upload_id);
    let meta = match load_meta(&dir).await {
        Ok(m) => m,
        Err(e) => return e.into_response(),
    };

    // 锁文件防并发合并；合并成功后锁随会话目录一并清理
    let lock_path = dir.join(LOCK_FILE);
    let lock_acquired = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
        .await
        .is_ok();
    if !lock_acquired {
        return ApiResponse::error(StatusCode::CONFLICT, "upload is being finalized")
            .into_response();
    }

    match finalize_upload(&state, &dir, &meta).await {
        Ok(resp) => {
            if let Err(e) = tokio::fs::remove_dir_all(&dir).await {
                warn!("cleanup session {} failed: {e}", dir.display());
            }
            ApiResponse::success(resp).into_response()
        }
        Err(resp) => {
            let _ = tokio::fs::remove_file(&lock_path).await;
            resp
        }
    }
}

#[instrument(skip(state))]
pub(crate) async fn upload_cancel_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::extract::Path(upload_id): axum::extract::Path<String>,
) -> impl IntoResponse {
    if !is_valid_upload_id(&upload_id) {
        return ApiResponse::error(StatusCode::BAD_REQUEST, "invalid upload id").into_response();
    }
    let dir = session_dir(&state.config.data_dir, &upload_id);
    match tokio::fs::remove_dir_all(&dir).await {
        Ok(()) => info!("upload session {upload_id} cancelled"),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => {
            error!("cancel upload session {upload_id} failed: {e}");
            return ApiResponse::error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to cancel upload",
            )
            .into_response();
        }
    }
    ApiResponse::ok().into_response()
}
