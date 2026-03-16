pub mod agent;
mod commands;
mod executor;
mod output;

use clap::Parser;
use commands::Cli;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let cli = Cli::parse();
    let json_mode = cli.json;

    if let Err(e) = commands::run(cli).await {
        if json_mode {
            let err = serde_json::json!({
                "error": e.to_string(),
            });
            eprintln!("{}", serde_json::to_string_pretty(&err).unwrap());
        } else {
            eprintln!("Error: {e}");
        }
        std::process::exit(1);
    }
}
