use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReplayEvent {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ledger: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_index: Option<u32>,
    pub timestamp: DateTime<Utc>,
    pub event_type: String,
    pub contract_id: String,
    pub topic: Vec<String>,
    pub data: serde_json::Value,
}

impl ReplayEvent {
    /// Generates a stable identity key to detect and reject/deduplicate repeated events.
    pub fn identity_key(&self) -> String {
        if let Some(ref id) = self.id {
            if !id.trim().is_empty() {
                return id.clone();
            }
        }
        if self.ledger.is_some() || self.tx_hash.is_some() || self.event_index.is_some() {
            return format!(
                "{}:{}:{}:{}",
                self.contract_id,
                self.ledger.unwrap_or(0),
                self.tx_hash.as_deref().unwrap_or(""),
                self.event_index.unwrap_or(0)
            );
        }
        format!(
            "{}:{}:{}:{:?}:{}",
            self.contract_id,
            self.timestamp.timestamp_millis(),
            self.event_type,
            self.topic,
            self.data
        )
    }

    /// Extracts token identifier from event data (e.g. "USDC", "XLM", or "native").
    pub fn token_asset(&self) -> String {
        self.data
            .get("token")
            .and_then(|v| v.as_str())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or("native")
            .to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReplayDataset {
    pub contract_id: String,
    pub network: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub events: Vec<ReplayEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReplayReport {
    pub dataset: ReplayDataset,
    pub events_processed: usize,
    pub state_transitions: Vec<String>,
    pub final_balances: HashMap<String, String>,
    pub summary: String,
}

#[derive(Debug, Clone, Default)]
struct TokenAccount {
    contract_balance: i128,
    escrow_liabilities: i128,
    platform_fees: i128,
}

pub fn load_dataset_from_file<P: AsRef<Path>>(path: P) -> Result<ReplayDataset> {
    let data = fs::read_to_string(path).context("Failed to read dataset file")?;
    let dataset: ReplayDataset = serde_json::from_str(&data).context("Failed to parse dataset JSON")?;
    Ok(dataset)
}

/// Parses a nonnegative i128 amount from integer or decimal string without fallback defaults.
fn parse_amount(val: Option<&serde_json::Value>, field_name: &str, event_index: usize) -> Result<i128> {
    let v = val.ok_or_else(|| {
        anyhow::anyhow!(
            "Missing required financial field '{}' at event index {}",
            field_name,
            event_index
        )
    })?;

    let amount = match v {
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                i as i128
            } else if let Some(u) = n.as_u64() {
                i128::from(u)
            } else {
                n.to_string().parse::<i128>().map_err(|e| {
                    anyhow::anyhow!(
                        "Field '{}' at index {} is not a valid i128 integer: {}",
                        field_name,
                        event_index,
                        e
                    )
                })?
            }
        }
        serde_json::Value::String(s) => {
            s.trim().parse::<i128>().map_err(|e| {
                anyhow::anyhow!(
                    "Failed to parse i128 decimal string for '{}' at index {}: {}",
                    field_name,
                    event_index,
                    e
                )
            })?
        }
        _ => {
            bail!(
                "Field '{}' at index {} must be an integer or decimal string, found {:?}",
                field_name,
                event_index,
                v
            );
        }
    };

    if amount < 0 {
        bail!(
            "Field '{}' cannot be negative at index {}: {}",
            field_name,
            event_index,
            amount
        );
    }

    Ok(amount)
}

pub fn replay_events(dataset: &ReplayDataset) -> Result<ReplayReport> {
    let mut state_transitions = Vec::new();

    // Balances maintained independently per payment token asset (BUG-85)
    let mut accounts_by_token: HashMap<String, TokenAccount> = HashMap::new();

    // Stable event identity tracking for deduplication & conflict detection.
    let mut seen_events: HashMap<String, (String, serde_json::Value)> = HashMap::new();
    let mut processed_count = 0;

    for (index, event) in dataset.events.iter().enumerate() {
        if event.event_type.trim().is_empty() {
            bail!("Event at index {} has an empty event_type", index);
        }

        let key = event.identity_key();
        if let Some((prev_type, prev_data)) = seen_events.get(&key) {
            if prev_type != &event.event_type || prev_data != &event.data {
                bail!(
                    "Duplicate event identity '{}' with conflicting payload at index {}",
                    key,
                    index
                );
            }
            // Skip repeated identical event from overlapping fetch windows
            continue;
        }
        seen_events.insert(key, (event.event_type.clone(), event.data.clone()));
        processed_count += 1;

        state_transitions.push(format!(
            "{}: {}",
            event.timestamp.format("%Y-%m-%d %H:%M:%S"),
            event.event_type
        ));

        let token = event.token_asset();
        let account = accounts_by_token.entry(token.clone()).or_default();

        match event.event_type.as_str() {
            "job_posted" | "job_created" => {
                let amount = parse_amount(event.data.get("amount"), "amount", index)?;
                account.contract_balance = account
                    .contract_balance
                    .checked_add(amount)
                    .context("Arithmetic overflow in contract_balance during job posting")?;
                account.escrow_liabilities = account
                    .escrow_liabilities
                    .checked_add(amount)
                    .context("Arithmetic overflow in escrow_liabilities during job posting")?;
            }
            "job_approved" => {
                let payout = parse_amount(event.data.get("payout"), "payout", index)?;
                let fee = parse_amount(event.data.get("fee"), "fee", index)?;
                let total = payout
                    .checked_add(fee)
                    .context("Arithmetic overflow in payout + fee during job approval")?;

                if account.escrow_liabilities < total {
                    bail!(
                        "Insufficient escrow liabilities ({}) for token '{}' approval payout + fee ({}) at index {}",
                        account.escrow_liabilities,
                        token,
                        total,
                        index
                    );
                }
                if account.contract_balance < payout {
                    bail!(
                        "Insufficient contract cash ({}) for token '{}' payout ({}) at index {}",
                        account.contract_balance,
                        token,
                        payout,
                        index
                    );
                }

                account.escrow_liabilities = account
                    .escrow_liabilities
                    .checked_sub(total)
                    .context("Underflow in escrow_liabilities")?;
                // Cash movement: actual token payout leaves contract; fee remains retained until withdrawn.
                account.contract_balance = account
                    .contract_balance
                    .checked_sub(payout)
                    .context("Underflow in contract_balance")?;
                account.platform_fees = account
                    .platform_fees
                    .checked_add(fee)
                    .context("Overflow in platform_fees")?;
            }
            "fees_withdrawn" => {
                let withdrawn = parse_amount(event.data.get("amount"), "amount", index)?;
                if account.platform_fees < withdrawn {
                    bail!(
                        "Insufficient platform fees ({}) for token '{}' to withdraw ({}) at index {}",
                        account.platform_fees,
                        token,
                        withdrawn,
                        index
                    );
                }
                if account.contract_balance < withdrawn {
                    bail!(
                        "Insufficient contract cash ({}) for token '{}' to withdraw fees ({}) at index {}",
                        account.contract_balance,
                        token,
                        withdrawn,
                        index
                    );
                }

                account.platform_fees = account
                    .platform_fees
                    .checked_sub(withdrawn)
                    .context("Underflow in platform_fees")?;
                account.contract_balance = account
                    .contract_balance
                    .checked_sub(withdrawn)
                    .context("Underflow in contract_balance")?;
            }
            "job_cancelled" => {
                let refund = parse_amount(event.data.get("refund"), "refund", index)?;
                if account.escrow_liabilities < refund {
                    bail!(
                        "Insufficient escrow liabilities ({}) for token '{}' refund ({}) at index {}",
                        account.escrow_liabilities,
                        token,
                        refund,
                        index
                    );
                }
                if account.contract_balance < refund {
                    bail!(
                        "Insufficient contract cash ({}) for token '{}' refund ({}) at index {}",
                        account.contract_balance,
                        token,
                        refund,
                        index
                    );
                }

                account.escrow_liabilities = account
                    .escrow_liabilities
                    .checked_sub(refund)
                    .context("Underflow in escrow_liabilities")?;
                account.contract_balance = account
                    .contract_balance
                    .checked_sub(refund)
                    .context("Underflow in contract_balance")?;
            }
            "dispute_resolved" => {
                let client_share = parse_amount(event.data.get("client_amount"), "client_amount", index)?;
                let freelancer_share =
                    parse_amount(event.data.get("freelancer_amount"), "freelancer_amount", index)?;
                let total = client_share
                    .checked_add(freelancer_share)
                    .context("Arithmetic overflow in dispute amounts")?;

                if account.escrow_liabilities < total {
                    bail!(
                        "Insufficient escrow liabilities ({}) for token '{}' dispute resolution ({}) at index {}",
                        account.escrow_liabilities,
                        token,
                        total,
                        index
                    );
                }
                if account.contract_balance < total {
                    bail!(
                        "Insufficient contract cash ({}) for token '{}' dispute resolution ({}) at index {}",
                        account.contract_balance,
                        token,
                        total,
                        index
                    );
                }

                account.escrow_liabilities = account
                    .escrow_liabilities
                    .checked_sub(total)
                    .context("Underflow in escrow_liabilities")?;
                account.contract_balance = account
                    .contract_balance
                    .checked_sub(total)
                    .context("Underflow in contract_balance")?;
            }
            "job_accepted"
            | "work_submitted"
            | "job_submitted"
            | "job_rejected"
            | "deadline_enforced"
            | "job_disputed"
            | "admin_transferred"
            | "fee_updated"
            | "max_active_jobs_updated" => {
                // Known lifecycle events with non-balance state transitions
            }
            unknown => {
                bail!(
                    "Unknown or malformed event type: '{}' at index {}",
                    unknown,
                    index
                );
            }
        }

        // Invariant assertion per token
        let total_accounted = account
            .escrow_liabilities
            .checked_add(account.platform_fees)
            .context("Overflow checking balance conservation")?;
        if account.contract_balance != total_accounted {
            bail!(
                "Conservation invariant violated for token '{}' at event index {}: contract_balance ({}) != escrow ({}) + fees ({})",
                token,
                index,
                account.contract_balance,
                account.escrow_liabilities,
                account.platform_fees
            );
        }

        if account.contract_balance < 0 || account.escrow_liabilities < 0 || account.platform_fees < 0 {
            bail!(
                "Negative balance detected for token '{}' at event index {}: contract={}, escrow={}, fees={}",
                token,
                index,
                account.contract_balance,
                account.escrow_liabilities,
                account.platform_fees
            );
        }
    }

    let mut final_balances = HashMap::new();
    for (token, acct) in &accounts_by_token {
        final_balances.insert(format!("{}:contract_balance", token), acct.contract_balance.to_string());
        final_balances.insert(format!("{}:escrow_liabilities", token), acct.escrow_liabilities.to_string());
        final_balances.insert(format!("{}:platform_fees", token), acct.platform_fees.to_string());

        // For single-token or "native" datasets, also expose unprefixed balance keys
        if token == "native" || accounts_by_token.len() == 1 {
            final_balances.insert("contract_balance".to_string(), acct.contract_balance.to_string());
            final_balances.insert("escrow_liabilities".to_string(), acct.escrow_liabilities.to_string());
            final_balances.insert("platform_fees".to_string(), acct.platform_fees.to_string());
        }
    }

    let report = ReplayReport {
        dataset: dataset.clone(),
        events_processed: processed_count,
        state_transitions,
        final_balances,
        summary: format!(
            "Processed {} events from {} to {}",
            processed_count,
            dataset.start_time.format("%Y-%m-%d"),
            dataset.end_time.format("%Y-%m-%d")
        ),
    };

    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_two_distinct_tokens_reported_separately() {
        let now = Utc::now();
        let dataset = ReplayDataset {
            contract_id: "test".to_string(),
            network: "testnet".to_string(),
            start_time: now,
            end_time: now,
            events: vec![
                ReplayEvent {
                    id: Some("tx-xlm-1".to_string()),
                    ledger: Some(1),
                    tx_hash: Some("0x1".to_string()),
                    event_index: Some(1),
                    timestamp: now,
                    event_type: "job_posted".to_string(),
                    contract_id: "test".to_string(),
                    topic: vec!["job_posted".to_string()],
                    data: serde_json::json!({ "job_id": 1, "amount": 10000000, "token": "XLM" }),
                },
                ReplayEvent {
                    id: Some("tx-usdc-1".to_string()),
                    ledger: Some(2),
                    tx_hash: Some("0x2".to_string()),
                    event_index: Some(1),
                    timestamp: now,
                    event_type: "job_posted".to_string(),
                    contract_id: "test".to_string(),
                    topic: vec!["job_posted".to_string()],
                    data: serde_json::json!({ "job_id": 2, "amount": 500000, "token": "USDC" }),
                },
            ],
        };

        let report = replay_events(&dataset).expect("Two token replay should succeed");
        assert_eq!(report.final_balances.get("XLM:contract_balance").map(|s| s.as_str()), Some("10000000"));
        assert_eq!(report.final_balances.get("USDC:contract_balance").map(|s| s.as_str()), Some("500000"));
    }
}
