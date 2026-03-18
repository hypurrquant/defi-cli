use crate::commands::Cli;
use serde::Serialize;

pub struct OutputMode {
    pub json: bool,
    pub ndjson: bool,
    pub fields: Option<Vec<String>>,
}

impl OutputMode {
    pub fn from_cli(cli: &Cli) -> Self {
        Self {
            json: cli.json || cli.ndjson,
            ndjson: cli.ndjson,
            fields: cli
                .fields
                .as_ref()
                .map(|f| f.split(',').map(|s| s.trim().to_string()).collect()),
        }
    }

    pub fn print<T: Serialize>(&self, value: &T) -> Result<(), defi_core::error::DefiError> {
        if self.ndjson {
            let s = serde_json::to_string(value)
                .map_err(|e| defi_core::error::DefiError::Internal(e.to_string()))?;
            println!("{s}");
        } else if self.json {
            let mut json_val = serde_json::to_value(value)
                .map_err(|e| defi_core::error::DefiError::Internal(e.to_string()))?;

            if let Some(ref fields) = self.fields
                && let serde_json::Value::Object(ref map) = json_val
            {
                let filtered: serde_json::Map<String, serde_json::Value> = map
                    .iter()
                    .filter(|(k, _)| fields.contains(k))
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect();
                json_val = serde_json::Value::Object(filtered);
            }

            println!("{}", serde_json::to_string_pretty(&json_val).unwrap());
        } else {
            // Human-readable: try table format, fallback to pretty JSON
            let json_val = serde_json::to_value(value)
                .map_err(|e| defi_core::error::DefiError::Internal(e.to_string()))?;
            if let Some(table) = crate::table::render(&json_val) {
                println!("{}", table);
            } else {
                println!("{}", serde_json::to_string_pretty(&json_val).unwrap());
            }
        }
        Ok(())
    }
}
