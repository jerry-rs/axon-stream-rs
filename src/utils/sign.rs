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

pub(crate) fn generate_play_url(path: &str, uid: &str, secret: &str, ttl_secs: u64) -> String {
    let expire = now_secs() + ttl_secs;
    let sign = generate_sign(path, expire, uid, secret);
    format!(
        "{}?expire={}&sign={}&uid={}",
        path, expire, sign, uid
    )
}