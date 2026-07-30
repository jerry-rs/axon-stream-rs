// src/sign.rs
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

pub fn generate_sign(path: &str, expire: u64, uid: &str, secret: &str) -> String {
    let raw = format!("{}:{}:{}", path, expire, uid);
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(raw.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

pub fn verify_sign(path: &str, expire: u64, uid: &str, sign: &str, secret: &str) -> bool {
    let expected = generate_sign(path, expire, uid, secret);
    // 用恒定时间比较，防止时序攻击
    constant_time_eq(expected.as_bytes(), sign.as_bytes())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

/// URL 路径段编码集：在 CONTROLS 基础上额外编码会破坏 URL 结构的字符。
/// 文件名可能含 '#'(fragment)、'?'(query)、'%'(解码错位) 等，必须逐段编码；
/// 非 ASCII 字节由 utf8_percent_encode 统一编码。'-'、'_'、'.' 等保持可读。
const PATH_SEGMENT_ENCODE_SET: &percent_encoding::AsciiSet = &percent_encoding::CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'%')
    .add(b'?')
    .add(b'`')
    .add(b'{')
    .add(b'}');

/// 相对路径逐段 percent-encode，保留 '/' 层级；
/// 服务端 Path<String> 提取时 percent-decode 还原，与签名计算的原始路径一致
fn encode_path_segments(path: &str) -> String {
    path.split('/')
        .map(|seg| {
            percent_encoding::utf8_percent_encode(seg, PATH_SEGMENT_ENCODE_SET).to_string()
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// 生成带过期时间与签名的相对 URL（{path}?expire&sign&uid），
/// 供 video/image/download 等验签公开路由共用
pub(crate) fn generate_signed_url(path: &str, uid: &str, secret: &str, ttl_secs: u64) -> String {
    let expire = now_secs() + ttl_secs;
    let sign = generate_sign(path, expire, uid, secret);
    format!(
        "{}?expire={}&sign={}&uid={}",
        encode_path_segments(path),
        expire,
        sign,
        uid
    )
}