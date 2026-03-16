use crate::output::OutputMode;
use clap::Args;
use defi_core::error::Result;

#[derive(Args)]
pub struct SchemaArgs {
    /// Command to get schema for (e.g. "dex.swap", "lending.supply")
    pub command: Option<String>,
    /// Show all schemas
    #[arg(long)]
    pub all: bool,
}

pub async fn run(args: SchemaArgs, output: &OutputMode) -> Result<()> {
    let action = if args.all {
        "all".to_string()
    } else {
        args.command.unwrap_or_else(|| "all".to_string())
    };
    let params = serde_json::json!({"action": action});
    let schema = crate::agent::handle_schema(&params)?;
    output.print(&schema)?;
    Ok(())
}
