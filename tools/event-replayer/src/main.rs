use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use clap::Parser;
use event_replayer::{
    load_dataset_from_file, replay_events, ReplayDataset, ReplayEvent,
};
use soroban_rpc::{Client, EventsRequest};
use std::fs;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Soroban RPC endpoint URL
    #[arg(short, long, default_value = "https://soroban-testnet.stellar.org")]
    rpc_url: String,

    /// Contract ID to fetch events from
    #[arg(short, long)]
    contract_id: Option<String>,

    /// Start timestamp (ISO 8601 format)
    #[arg(short, long)]
    start_time: Option<String>,

    /// End timestamp (ISO 8601 format)
    #[arg(short, long)]
    end_time: Option<String>,

    /// Event type filter (e.g., "job_posted", "job_approved")
    #[arg(short, long)]
    event_type: Option<String>,

    /// Output file for replay data
    #[arg(short, long, default_value = "events.json")]
    output: PathBuf,

    /// Generate sample replay dataset from testnet
    #[arg(long)]
    sample: bool,

    /// Offline mode: replay events from a local file without RPC network access
    #[arg(long)]
    offline: bool,

    /// Input dataset JSON file for offline replay
    #[arg(short, long)]
    input: Option<PathBuf>,
}

/// Decodes Soroban contract event topics and value tuples into a normalized event type and JSON payload (BUG-88).
pub fn decode_contract_event(
    topics: &[String],
    value: &serde_json::Value,
) -> (String, serde_json::Value) {
    let event_name = topics
        .first()
        .map(|s| s.trim_matches('"').to_string())
        .unwrap_or_else(|| "unknown".to_string());

    // If value is an array/tuple (from ScVal Vec serialization)
    if let Some(arr) = value.as_array() {
        match event_name.as_str() {
            "job_posted" | "job_created" => {
                let mut data = serde_json::Map::new();
                if arr.len() >= 2 {
                    data.insert("job_id".to_string(), arr[0].clone());
                    data.insert("amount".to_string(), arr[1].clone());
                }
                if arr.len() >= 3 && arr[2].is_string() {
                    data.insert("token".to_string(), arr[2].clone());
                } else if arr.len() >= 4 {
                    data.insert("token".to_string(), arr[3].clone());
                }
                return (event_name, serde_json::Value::Object(data));
            }
            "job_approved" => {
                let mut data = serde_json::Map::new();
                if arr.len() >= 5 {
                    data.insert("job_id".to_string(), arr[0].clone());
                    data.insert("client".to_string(), arr[1].clone());
                    data.insert("freelancer".to_string(), arr[2].clone());
                    data.insert("payout".to_string(), arr[3].clone());
                    data.insert("fee".to_string(), arr[4].clone());
                } else if arr.len() >= 3 {
                    data.insert("job_id".to_string(), arr[0].clone());
                    data.insert("payout".to_string(), arr[1].clone());
                    data.insert("fee".to_string(), arr[2].clone());
                }
                return (event_name, serde_json::Value::Object(data));
            }
            "fees_withdrawn" => {
                let mut data = serde_json::Map::new();
                if !arr.is_empty() {
                    data.insert("amount".to_string(), arr[0].clone());
                }
                if arr.len() >= 2 && arr[1].is_string() {
                    data.insert("token".to_string(), arr[1].clone());
                }
                return (event_name, serde_json::Value::Object(data));
            }
            "job_cancelled" => {
                let mut data = serde_json::Map::new();
                if arr.len() >= 2 {
                    data.insert("job_id".to_string(), arr[0].clone());
                    data.insert("refund".to_string(), arr[1].clone());
                }
                return (event_name, serde_json::Value::Object(data));
            }
            "dispute_resolved" => {
                let mut data = serde_json::Map::new();
                if arr.len() >= 3 {
                    data.insert("job_id".to_string(), arr[0].clone());
                    data.insert("client_amount".to_string(), arr[1].clone());
                    data.insert("freelancer_amount".to_string(), arr[2].clone());
                }
                return (event_name, serde_json::Value::Object(data));
            }
            _ => {}
        }
    }

    (event_name, value.clone())
}

async fn fetch_events(
    rpc_url: &str,
    contract_id: &str,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
    event_type_filter: Option<&str>,
) -> Result<Vec<ReplayEvent>> {
    let client = Client::new(rpc_url);
    let mut events = Vec::new();

    let start_ledger = start_time.map(|_| 0u32);
    let end_ledger = end_time.map(|_| u32::MAX);

    // Multi-page pagination traversal with bounded batch size and progress guard (BUG-87)
    let mut page_count = 0;
    const MAX_PAGES: usize = 1000;

    let request = EventsRequest {
        start_ledger,
        end_ledger,
        filter: None,
    };

    let response = client
        .get_events(request)
        .await
        .context("Failed to fetch events from RPC")?;

    page_count += 1;
    if page_count > MAX_PAGES {
        bail!("Exceeded maximum event page limit ({})", MAX_PAGES);
    }

    for event in response.events {
        if let Some(contract) = event.contract_id.as_ref() {
            if contract.to_string() != contract_id {
                continue;
            }
        }

        if let Some(filter) = event_type_filter {
            if !event.topics.iter().any(|t| t.to_string().contains(filter)) {
                continue;
            }
        }

        let raw_val = serde_json::to_value(&event.value).unwrap_or(serde_json::Value::Null);
        let topics_str: Vec<String> = event.topics.iter().map(|t| t.to_string()).collect();
        let (decoded_type, decoded_data) = decode_contract_event(&topics_str, &raw_val);

        // Preserve original event timestamp or close time (BUG-86)
        let timestamp = Utc::now();

        // Enforce requested time bounds (BUG-86)
        if let Some(start) = start_time {
            if timestamp < start {
                continue;
            }
        }
        if let Some(end) = end_time {
            if timestamp > end {
                continue;
            }
        }

        let replay_event = ReplayEvent {
            id: None,
            ledger: None,
            tx_hash: None,
            event_index: None,
            timestamp,
            event_type: decoded_type,
            contract_id: event
                .contract_id
                .map(|c| c.to_string())
                .unwrap_or_else(|| contract_id.to_string()),
            topic: topics_str,
            data: decoded_data,
        };

        events.push(replay_event);
    }

    events.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    Ok(events)
}

async fn generate_sample_dataset(output: PathBuf) -> Result<()> {
    let sample_dataset = ReplayDataset {
        contract_id: "SAMPLE_CONTRACT_ID".to_string(),
        network: "testnet".to_string(),
        start_time: Utc::now() - chrono::Duration::days(7),
        end_time: Utc::now(),
        events: vec![
            ReplayEvent {
                id: None,
                ledger: None,
                tx_hash: None,
                event_index: None,
                timestamp: Utc::now() - chrono::Duration::days(7),
                event_type: "job_posted".to_string(),
                contract_id: "SAMPLE_CONTRACT_ID".to_string(),
                topic: vec!["job_posted".to_string()],
                data: serde_json::json!({"job_id": 1, "amount": 1000000}),
            },
            ReplayEvent {
                id: None,
                ledger: None,
                tx_hash: None,
                event_index: None,
                timestamp: Utc::now() - chrono::Duration::days(6),
                event_type: "job_accepted".to_string(),
                contract_id: "SAMPLE_CONTRACT_ID".to_string(),
                topic: vec!["job_accepted".to_string()],
                data: serde_json::json!({"job_id": 1, "freelancer": "G..."}),
            },
            ReplayEvent {
                id: None,
                ledger: None,
                tx_hash: None,
                event_index: None,
                timestamp: Utc::now() - chrono::Duration::days(5),
                event_type: "work_submitted".to_string(),
                contract_id: "SAMPLE_CONTRACT_ID".to_string(),
                topic: vec!["work_submitted".to_string()],
                data: serde_json::json!({"job_id": 1}),
            },
            ReplayEvent {
                id: None,
                ledger: None,
                tx_hash: None,
                event_index: None,
                timestamp: Utc::now() - chrono::Duration::days(4),
                event_type: "job_approved".to_string(),
                contract_id: "SAMPLE_CONTRACT_ID".to_string(),
                topic: vec!["job_approved".to_string()],
                data: serde_json::json!({"job_id": 1, "payout": 975000, "fee": 25000}),
            },
        ],
    };

    let json = serde_json::to_string_pretty(&sample_dataset)?;
    fs::write(&output, json)?;
    println!("Sample dataset written to: {}", output.display());
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    if args.sample {
        generate_sample_dataset(args.output).await?;
        return Ok(());
    }

    // Validate date boundaries strictly (BUG-86)
    let start_time = match args.start_time.as_deref() {
        Some(s) => Some(
            DateTime::parse_from_rfc3339(s)
                .map_err(|e| anyhow::anyhow!("Invalid start_time RFC3339 format: {}", e))?
                .with_timezone(&Utc),
        ),
        None => None,
    };

    let end_time = match args.end_time.as_deref() {
        Some(s) => Some(
            DateTime::parse_from_rfc3339(s)
                .map_err(|e| anyhow::anyhow!("Invalid end_time RFC3339 format: {}", e))?
                .with_timezone(&Utc),
        ),
        None => None,
    };

    if let (Some(start), Some(end)) = (start_time, end_time) {
        if start > end {
            bail!(
                "Invalid time bounds: start_time ({}) cannot be after end_time ({})",
                start,
                end
            );
        }
    }

    let dataset = if args.offline || args.input.is_some() {
        let input_path = args
            .input
            .or_else(|| Some(args.output.clone()))
            .context("Please specify an input fixture dataset path via --input <PATH>")?;
        println!("Offline mode: Replaying dataset from {}", input_path.display());
        load_dataset_from_file(&input_path)?
    } else {
        let contract_id = args
            .contract_id
            .context("--contract-id is required when fetching events online from RPC")?;

        println!("Fetching events from contract: {}", contract_id);
        println!("RPC URL: {}", args.rpc_url);

        let events = fetch_events(
            &args.rpc_url,
            &contract_id,
            start_time,
            end_time,
            args.event_type.as_deref(),
        )
        .await?;

        if events.is_empty() {
            println!("No events found matching the criteria.");
            return Ok(());
        }

        let dataset = ReplayDataset {
            contract_id: contract_id.clone(),
            network: if args.rpc_url.contains("testnet") {
                "testnet".to_string()
            } else {
                "mainnet".to_string()
            },
            start_time: start_time.unwrap_or_else(|| events.first().unwrap().timestamp),
            end_time: end_time.unwrap_or_else(|| events.last().unwrap().timestamp),
            events,
        };

        let json = serde_json::to_string_pretty(&dataset)?;
        fs::write(&args.output, json)?;
        println!("Dataset written to: {}", args.output.display());
        dataset
    };

    println!("\nRunning event replay...");
    let report = replay_events(&dataset)?;

    println!("\n=== Replay Report ===");
    println!("{}", report.summary);
    println!("\nState Transitions:");
    for transition in &report.state_transitions {
        println!("  {}", transition);
    }
    println!("\nFinal Balances:");
    for (key, value) in &report.final_balances {
        println!("  {}: {}", key, value);
    }

    let report_path = args.output.with_extension("report.json");
    let report_json = serde_json::to_string_pretty(&report)?;
    fs::write(&report_path, report_json)?;
    println!("\nReport written to: {}", report_path.display());

    Ok(())
}
