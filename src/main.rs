use crate::config::AppConfig;
use crate::models::user::User;
use crate::routers::build_global_routers;
use crate::state::AppState;
use std::io::IsTerminal;
use std::sync::Arc;
use tracing::info;
use tracing_subscriber::Layer;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

mod auth;
mod config;
mod entry;
mod extractors;
mod handlers;
mod middlewares;
mod models;
mod routers;
mod state;
mod utils;

fn init_tracing() -> tracing_appender::non_blocking::WorkerGuard {
    let file_appender = tracing_appender::rolling::Builder::new()
        .filename_suffix("log")
        .filename_prefix("axons")
        .max_log_files(3)
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .build("logs")
        .unwrap();

    let (non_blocking_writer, guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .with_ansi_sanitization(false)
                .with_ansi(false)
                .with_line_number(true)
                .with_file(true)
                .json()
                .with_current_span(false)
                .with_span_list(false)
                .flatten_event(true)
                .with_writer(non_blocking_writer)
                .with_filter(tracing_subscriber::EnvFilter::new("info")),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_ansi_sanitization(std::io::stdout().is_terminal())
                .with_line_number(true)
                .with_file(true)
                .pretty()
                .with_filter(
                    tracing_subscriber::EnvFilter::try_from_default_env()
                        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
                ),
        )
        .init();
    guard
}

#[tokio::main(flavor = "multi_thread", worker_threads = 8)]
async fn main() {
    let _guard = init_tracing();
    let app_config = AppConfig::default();
    info!("{:#?}", &app_config);
    let mut db = toasty::Db::builder()
        .models(toasty::models!(crate::*))
        .connect(&app_config.database_url)
        .await
        .expect("Create database connection error");

    // Create tables based on registered models
    let _ = db.push_schema().await;

    // Create a user
    let _ = toasty::create!(User {
        username: "admin",
        password: "admin",
    })
    .exec(&mut db)
    .await
    .expect("Create user error");

    let app_addr = format!("{}:{}", &app_config.ipv4, &app_config.port);
    let app_listener = tokio::net::TcpListener::bind(app_addr)
        .await
        .expect("listener bind error");

    let app_state = AppState {
        config: Arc::new(app_config),
        db,
    };
    let app_routers = build_global_routers(app_state);
    axum::serve(
        app_listener,
        app_routers.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .expect("axon start server error");
}
