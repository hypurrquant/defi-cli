mod commands;

use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    if let Err(e) = commands::run().await {
        let json_mode = std::env::args().any(|a| a == "--json" || a == "--ndjson");
        if json_mode {
            println!("{}", serde_json::json!({ "error": e.to_string() }));
        } else {
            eprintln!("Error: {e}");
        }
        std::process::exit(1);
    }
}
