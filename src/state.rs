use crate::config::AppConfig;
use std::sync::Arc;
use toasty::Db;

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) config: Arc<AppConfig>,
    pub(crate) db: Db,
}
