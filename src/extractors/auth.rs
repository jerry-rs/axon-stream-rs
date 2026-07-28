use std::sync::LazyLock;

use axum::RequestPartsExt;
use axum::extract::FromRequestParts;
use axum::http::StatusCode;
use axum::http::request::Parts;
use axum_extra::TypedHeader;
use axum_extra::headers::Authorization;
use axum_extra::headers::authorization::Bearer;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};

struct Keys {
    encoding: EncodingKey,
    decoding: DecodingKey,
}

impl Keys {
    fn new(secret: &[u8]) -> Self {
        Self {
            encoding: EncodingKey::from_secret(secret),
            decoding: DecodingKey::from_secret(secret),
        }
    }
}

static KEYS: LazyLock<Keys> = LazyLock::new(|| {
    let secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "JWT_SECRET".to_string());
    Keys::new(secret.as_bytes())
});

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Claims {
    pub(crate) sub: String,
    pub(crate) exp: usize,
}

impl Claims {
    pub fn new(sub: String, exp: usize) -> Self {
        Self { sub, exp }
    }

    pub fn encode(&self) -> Result<String, jsonwebtoken::errors::Error> {
        encode(&Header::default(), self, &KEYS.encoding)
    }

    pub fn decode(token: &str) -> Result<Self, jsonwebtoken::errors::Error> {
        decode::<Claims>(token, &KEYS.decoding, &Validation::default())
            .map(|token_data| token_data.claims)
    }
}

#[derive(Debug, Deserialize)]
pub(crate) struct AuthPayload {
    pub(crate) claims: Claims,
}

impl<S> FromRequestParts<S> for AuthPayload
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let TypedHeader(Authorization(bearer)) = parts
            .extract::<TypedHeader<Authorization<Bearer>>>()
            .await
            .map_err(|_| StatusCode::UNAUTHORIZED)?;

        let claims = Claims::decode(bearer.token()).map_err(|_| StatusCode::UNAUTHORIZED)?;

        Ok(AuthPayload { claims })
    }
}
