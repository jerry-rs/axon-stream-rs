use clap::Parser;

#[derive(Parser, Debug)]
pub(crate) struct AppConfig {
    #[arg(long, default_value = "0.0.0.0", env = "APP_SERVER_IP")]
    pub(crate) ipv4: String,
    #[arg(long, default_value = "1000", env = "APP_SERVER_PORT")]
    pub(crate) port: u16,
    #[arg(
        long,
        default_value_os_t = std::env::current_dir().unwrap(),
        env = "APP_SERVER_DATA_DIR"
    )]
    pub(crate) data_dir: std::path::PathBuf,

    #[arg(
        long,
        default_value_t = format!(
            "turso:{}",
            std::env::current_exe()
                .unwrap()
                .parent()
                .unwrap()
                .join("axon.db")
                .display()
        ),
        env ="APP_SERVER_DATABASE_URL"
    )]
    pub(crate) database_url: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self::parse()
    }
}
