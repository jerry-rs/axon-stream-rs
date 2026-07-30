use crate::extractors::auth::AuthPayload;
use crate::handlers::ApiResponse;
use crate::state::AppState;
use crate::utils::resolve_and_validate_path;
use crate::utils::sign::{generate_signed_url, now_secs, verify_sign};
use axum::http::StatusCode;
use axum::http::header::{CONTENT_DISPOSITION, CONTENT_TYPE};
use axum::response::IntoResponse;
use serde::Deserialize;
use std::io::Write;
use tower::ServiceExt;
use tracing::{error, info, instrument};

/// 下载通道独立 secret：与视频/图片签名不互通
const DOWNLOAD_URL_SECRET: &str = "download-url-secret";

/// 将 Path 转换为标准 Tar 归档所需的 POSIX 相对路径（使用 '/' 分隔）
fn path_to_posix(path: &std::path::Path) -> String {
    path.components()
        .filter_map(|c| match c {
            std::path::Component::Normal(s) => Some(s.to_string_lossy()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// 生成安全的 Content-Disposition 头，支持中文/特殊字符文件名
/// 同时提供 filename（ASCII 兼容降级）和 filename*（UTF-8 编码，RFC 5987）两种形式
fn build_content_disposition(filename: &str) -> axum::http::HeaderValue {
    // ASCII 降级版本：非 ASCII 字符替换为 _，保证旧浏览器/中间件兼容
    let ascii_fallback: String = filename
        .chars()
        .map(|c| if c.is_ascii() && c != '"' { c } else { '_' })
        .collect();

    // RFC 5987 percent-encoding，支持真正的 UTF-8 文件名（现代浏览器优先使用这个）
    let encoded =
        percent_encoding::utf8_percent_encode(filename, percent_encoding::NON_ALPHANUMERIC)
            .to_string();
    let value = format!(
        "attachment; filename=\"{}\"; filename*=UTF-8''{}",
        ascii_fallback, encoded
    );

    // 兜底：万一还是构造失败（理论上不会），退回最基础的 attachment
    axum::http::HeaderValue::from_str(&value)
        .unwrap_or_else(|_| axum::http::HeaderValue::from_static("attachment"))
}

async fn download_file_stream(
    download_path: &std::path::Path,
    request: axum::http::Request<axum::body::Body>,
) -> axum::response::Response {
    // 取出真实文件名，用于 Content-Disposition
    let filename = download_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download");

    match tower_http::services::ServeFile::new(&download_path)
        .oneshot(request)
        .await
    {
        Ok(mut response) => {
            info!("Downloading '{}' successfully", filename);
            let disposition = build_content_disposition(filename);
            response
                .headers_mut()
                .insert(CONTENT_DISPOSITION, disposition);
            response.into_response()
        }
        Err(e) => {
            error!("serve file error for {:?}: {e}", download_path);
            ApiResponse::error(StatusCode::INTERNAL_SERVER_ERROR, "failed to read file")
                .into_response()
        }
    }
}

/// 流式打包目录为纯 tar（不压缩）：
/// - jwalk 并行遍历目录树，多线程 stat，加速海量文件场景
/// - tar 写入单线程顺序进行（格式要求），通过 duplex 管道边写边发送给客户端
async fn download_dir_stream(dir_path: &std::path::Path) -> axum::response::Response {
    let raw_dir_name = dir_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download");

    let base_dir_posix = path_to_posix(std::path::Path::new(raw_dir_name));

    const PIPE_CAPACITY: usize = 1024 * 1024; // 1MB
    const WRITE_BUF_SIZE: usize = 256 * 1024; // 256KB

    let (async_writer, async_reader) = tokio::io::duplex(PIPE_CAPACITY);
    let sync_writer = tokio_util::io::SyncIoBridge::new(async_writer);
    let buffered_writer = std::io::BufWriter::with_capacity(WRITE_BUF_SIZE, sync_writer);

    let dir_path_buf = dir_path.to_path_buf();

    tokio::task::spawn_blocking(move || -> std::io::Result<()> {
        let mut tar_builder = tar::Builder::new(buffered_writer);
        tar_builder.follow_symlinks(false);

        let walker = jwalk::WalkDir::new(&dir_path_buf).follow_links(false);

        for entry_result in walker {
            let entry = match entry_result {
                Ok(e) => e,
                Err(e) => {
                    error!("jwalk entry error: {e}");
                    continue;
                }
            };

            let path = entry.path();

            let rel_path = match path.strip_prefix(&dir_path_buf) {
                Ok(p) => p,
                Err(_) => continue,
            };
            let rel_posix = path_to_posix(rel_path);
            if rel_posix.is_empty() {
                continue;
            }

            // 拼接标准的 POSIX Tar 路径 (例: root_dir/sub_folder/file.txt)
            let tar_entry_path = if base_dir_posix.is_empty() {
                rel_posix
            } else {
                format!("{}/{}", base_dir_posix, rel_posix)
            };
            let file_type = entry.file_type();

            if file_type.is_dir() {
                tar_builder.append_dir(&tar_entry_path, &path)?;
            } else if file_type.is_file() {
                let mut file = match std::fs::File::open(&path) {
                    Ok(f) => f,
                    Err(e) => {
                        error!("Failed to open file {:?}: {e}", path);
                        continue;
                    }
                };
                tar_builder.append_file(&tar_entry_path, &mut file)?;
            } else if file_type.is_symlink() {
                if let Ok(target) = std::fs::read_link(&path) {
                    let mut header = tar::Header::new_gnu();
                    header.set_entry_type(tar::EntryType::Symlink);
                    header.set_size(0);
                    header.set_mode(0o777);
                    if let Ok(metadata) = entry.metadata() {
                        let _ =
                            header.set_metadata_in_mode(&metadata, tar::HeaderMode::Deterministic);
                    }
                    tar_builder.append_link(&mut header, &tar_entry_path, &target)?;
                }
            }
        }

        tar_builder.finish()?;
        let mut buffered_writer = tar_builder.into_inner()?;
        buffered_writer.flush()?;
        Ok(())
    });

    // 传输 Block Size 建议设置在 64KB 左右，对于 HTTP 流传输更平滑
    let stream = tokio_util::io::ReaderStream::with_capacity(async_reader, 64 * 1024);
    let body = axum::body::Body::from_stream(stream);
    info!("download {} file  successfully", raw_dir_name);
    let disposition = build_content_disposition(&format!("{raw_dir_name}.tar"));
    let mut response = body.into_response();
    response
        .headers_mut()
        .insert(CONTENT_DISPOSITION, disposition);
    response.headers_mut().insert(
        CONTENT_TYPE,
        axum::http::HeaderValue::from_static("application/x-tar"),
    );
    response
}

#[derive(Deserialize, Debug)]
pub struct DownloadQuery {
    expire: u64,
    sign: String,
    uid: String,
}

#[instrument(skip(state, request))]
pub(crate) async fn entry_download_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::extract::Path(path): axum::extract::Path<String>,
    axum::extract::Query(query): axum::extract::Query<DownloadQuery>,
    request: axum::http::Request<axum::body::Body>,
) -> impl IntoResponse {
    // 1. 校验过期时间
    if now_secs() > query.expire {
        error!("expire time is set");
        return ApiResponse::error(StatusCode::FORBIDDEN, "no permission").into_response();
    }

    // 2. 校验签名wa
    if !verify_sign(
        &path,
        query.expire,
        &query.uid,
        &query.sign,
        DOWNLOAD_URL_SECRET,
    ) {
        error!("invalid signature");
        return ApiResponse::error(StatusCode::FORBIDDEN, "no permission").into_response();
    }

    let safe_path = match resolve_and_validate_path(&state.config.data_dir, path.as_str()).await {
        Ok(p) => p,
        Err(e) => return e.into_response(),
    };
    // 优化：异步获取文件/目录元数据，避免阻塞 Tokio Async 工作线程
    let metadata = match tokio::fs::metadata(&safe_path).await {
        Ok(m) => m,
        Err(e) => {
            error!("Failed to fetch metadata for {:?}: {e}", safe_path);
            return ApiResponse::error(StatusCode::NOT_FOUND, "not found").into_response();
        }
    };

    if metadata.is_dir() {
        download_dir_stream(&safe_path).await
    } else {
        download_file_stream(&safe_path, request).await
    }
}

#[instrument]
pub(crate) async fn entry_download_url_handler(
    axum::extract::Path(path): axum::extract::Path<String>,
    payload: AuthPayload,
) -> impl IntoResponse {
    let has_permission = payload.claims.sub.eq_ignore_ascii_case("admin");
    if !has_permission {
        return ApiResponse::error(StatusCode::FORBIDDEN, "no permission").into_response();
    }
    let download_url = generate_signed_url(
        path.as_str(),
        &payload.claims.sub,
        DOWNLOAD_URL_SECRET,
        600,
    );
    info!("{download_url}");
    ApiResponse::success(download_url).into_response()
}
