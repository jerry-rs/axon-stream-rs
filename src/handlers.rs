use serde::{Serialize, Serializer};
use std::borrow::Cow;

fn status_code_as_u16<S>(code: &axum::http::StatusCode, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_u16(code.as_u16())
}

#[derive(Serialize)]
pub(crate) struct ApiResponse<T: Serialize> {
    #[serde(serialize_with = "status_code_as_u16")]
    pub(crate) code: axum::http::StatusCode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) message: Option<Cow<'static, str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) data: Option<T>,
}

impl<T: Serialize> ApiResponse<T> {
    /// 成功,带数据
    pub fn success(data: T) -> Self {
        Self {
            code: axum::http::StatusCode::OK,
            message: None,
            data: Some(data),
        }
    }

    /// 成功,带自定义消息
    #[allow(dead_code)]
    pub fn success_with_message(data: T, message: impl Into<Cow<'static, str>>) -> Self {
        Self {
            code: axum::http::StatusCode::OK,
            message: Some(message.into()),
            data: Some(data),
        }
    }
    /// 成功，自定义状态码（如 201 Created）
    #[allow(dead_code)]
    pub fn success_with_status(status: axum::http::StatusCode, data: T) -> Self {
        Self {
            code: status,
            message: None,
            data: Some(data),
        }
    }
    /// 错误，但仍需要返回数据（例如表单校验失败详情）
    #[allow(dead_code)]
    pub fn error_with_data(
        code: axum::http::StatusCode,
        message: impl Into<Cow<'static, str>>,
        data: T,
    ) -> Self {
        Self {
            code,
            message: Some(message.into()),
            data: Some(data),
        }
    }
}

impl ApiResponse<()> {
    /// 成功，空数据响应 (用于无返回值的操作，如 DELETE / UPDATE)
    pub fn ok() -> Self {
        Self {
            code: axum::http::StatusCode::OK,
            message: Some("success".into()),
            data: None,
        }
    }
    /// 错误响应
    pub fn error(code: axum::http::StatusCode, message: impl Into<Cow<'static, str>>) -> Self {
        Self {
            code,
            message: Some(message.into()),
            data: None,
        }
    }
}

impl<T: Serialize> axum::response::IntoResponse for ApiResponse<T> {
    fn into_response(self) -> axum::response::Response {
        (self.code, axum::Json(self)).into_response()
    }
}
