use crate::config::AppConfig;
use crate::models::user::User;
use crate::routers::build_global_routers;
use crate::state::AppState;
use std::sync::Arc;
use tracing::info;
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

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_ansi_sanitization(true)
                .with_line_number(true)
                .pretty(),
        )
        .init();

    let mut db = toasty::Db::builder()
        .models(toasty::models!(crate::*))
        .connect("turso:./axon.db")
        .await
        .expect("Create database connection error");

    // Create tables based on registered models
    db.push_schema()
        .await
        .expect("Create database schema error");

    // Create a user
    let _ = toasty::create!(User {
        username: "admin",
        password: "admin",
    })
    .exec(&mut db)
    .await
    .expect("Create user error");

    let app_config = AppConfig::default();
    info!("{:#?}", &app_config);
    let app_addr = format!("{}:{}", &app_config.ipv4, &app_config.port);
    let app_listener = tokio::net::TcpListener::bind(app_addr)
        .await
        .expect("listener bind error");

    let app_state = AppState {
        config: Arc::new(app_config),
        db:db,
    };
    let app_routers = build_global_routers(app_state);
    axum::serve(
        app_listener,
        app_routers.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .expect("axon start server error");
}
