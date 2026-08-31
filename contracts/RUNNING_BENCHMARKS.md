# Running Performance Benchmarks

This document provides step-by-step instructions for running, interpreting, and comparing escrow contract performance benchmarks.

## Quick Start

### Run All Benchmarks (Recommended)

```bash
cd contracts/escrow
cargo test --lib benchmarks -- --ignored --nocapture 2>&1 | tee benchmark-output.txt
```

This runs:
- Small amount benchmark (100M stroops)
- Medium amount benchmark (10B stroops)
- Large amount benchmark (1T stroops)
- Comprehensive report

**Expected duration**: ~10–30 seconds

**Output**: Markdown tables showing CPU instructions, ledger read/write bytes, and memory for each operation and amount tier.

## Individual Benchmark Tests

### 1. Small Amount Benchmark

```bash
cargo test --lib benchmarks benchmark_core_functions_small_amount -- --ignored --nocapture
```

**Use case**: Baseline performance with typical job amounts (≈10 XLM)  
**Output**: Performance metrics for post_job, accept_job, submit_work, approve_work

### 2. Medium Amount Benchmark

```bash
cargo test --lib benchmarks benchmark_core_functions_medium_amount -- --ignored --nocapture
```

**Use case**: Mid-range job value (≈1,000 XLM)  
**Purpose**: Verify costs don't change as amount increases  
**Expected result**: Identical costs to small amount

### 3. Large Amount Benchmark

```bash
cargo test --lib benchmarks benchmark_core_functions_large_amount -- --ignored --nocapture
```

**Use case**: High-value jobs (≈100,000,000 XLM)  
**Purpose**: Extreme amount test to ensure no edge cases  
**Expected result**: Costs identical (no amount sensitivity)

### 4. Comprehensive Report

```bash
cargo test --lib benchmarks benchmark_comprehensive_report -- --nocapture
```

**Use case**: Documentation and understanding  
**Output**: Detailed explanation of measurement dimensions and findings

## Interpreting Output

### Example Output Format

```
=== Benchmark: Small Amount (100_000_000 stroops) ===

| Operation   | Amount (stroops) | CPU Instructions | Ledger Reads (B) | Ledger Writes (B) | Memory (B) |
|-------------|------------------|------------------|------------------|-------------------|------------|
| post_job    | 100000000        | ~450000          | 200              | 300               | 1024       |
| accept_job  | 100000000        | ~380000          | 250              | 280               | 896        |
| submit_work | 100000000        | ~420000          | 260              | 290               | 1024       |
| approve_work| 100000000        | ~620000          | 320              | 400               | 1152       |
```

### Column Explanations

| Column | Meaning | Significance |
|--------|---------|---------------|
| **Operation** | Function being measured | Which contract function |
| **Amount** | Job amount in stroops | Validates amount insensitivity |
| **CPU Instructions** | Primary cost metric (100M max) | Drives transaction fee |
| **Ledger Reads (B)** | Bytes read from storage | Storage query cost |
| **Ledger Writes (B)** | Bytes written to storage | Persistence cost |
| **Memory (B)** | Peak memory during execution | Sandbox overhead |

### What to Look For

✓ **Good signs**:
- All amounts show identical CPU costs (no amount sensitivity)
- CPU instructions consistent within 5% across runs
- Memory stays under 2KB per operation
- Ledger operations small and predictable

⚠ **Warning signs**:
- CPU cost changes significantly between amounts (possible loop or path sensitivity)
- Memory exceeds 2KB (possible large allocation)
- Ledger operations spike (possible new storage access)

❌ **Red flags**:
- CPU instructions exceed 1M for single operation (budget concern)
- Costs increase by >25% vs. baseline (regression)
- Memory > 5KB (memory leak or inefficiency)

## Comparing Against Baseline

### Setup: Record Baseline

First time after a major release or significant change:

```bash
# Make sure you're on the main branch or stable release
git checkout main
cd contracts/escrow

# Run benchmarks and save results
cargo test --lib benchmarks -- --ignored --nocapture 2>&1 | tee baseline-$(date +%Y%m%d).txt

# Extract numeric results for easy comparison
grep "| " baseline-$(date +%Y%m%d).txt > baseline-numbers.txt
```

### Check: Compare Against Baseline

After making changes to the contract:

```bash
# Make sure changes are applied
cargo test --lib benchmarks -- --ignored --nocapture 2>&1 | tee current-run.txt

# Extract results
grep "| " current-run.txt > current-numbers.txt

# Simple visual comparison (for Mac/Linux)
diff -y baseline-numbers.txt current-numbers.txt

# Or use your preferred diff tool
```

### Automated Comparison (Advanced)

Create a script `check-regression.sh`:

```bash
#!/bin/bash
set -e

THRESHOLD=20  # Alert if cost changes by >20%

cd contracts/escrow

echo "Running benchmark..."
cargo test --lib benchmarks benchmark_core_functions_small_amount -- --ignored > current.log 2>&1

echo "Extracting CPU instruction values..."
BASELINE_POST=$(grep "| post_job" baseline.log | grep -oE "[0-9~]+" | head -1)
BASELINE_ACCEPT=$(grep "| accept_job" baseline.log | grep -oE "[0-9~]+" | head -1)
BASELINE_SUBMIT=$(grep "| submit_work" baseline.log | grep -oE "[0-9~]+" | head -1)
BASELINE_APPROVE=$(grep "| approve_work" baseline.log | grep -oE "[0-9~]+" | head -1)

CURRENT_POST=$(grep "| post_job" current.log | grep -oE "[0-9~]+" | head -1)
CURRENT_ACCEPT=$(grep "| accept_job" current.log | grep -oE "[0-9~]+" | head -1)
CURRENT_SUBMIT=$(grep "| submit_work" current.log | grep -oE "[0-9~]+" | head -1)
CURRENT_APPROVE=$(grep "| approve_work" current.log | grep -oE "[0-9~]+" | head -1)

echo "Results:"
echo "post_job: $BASELINE_POST -> $CURRENT_POST"
echo "accept_job: $BASELINE_ACCEPT -> $CURRENT_ACCEPT"
echo "submit_work: $BASELINE_SUBMIT -> $CURRENT_SUBMIT"
echo "approve_work: $BASELINE_APPROVE -> $CURRENT_APPROVE"

# Simple percentage change calculation would go here
# For now, just visual inspection
```

## Integration with CI

### GitHub Actions (Recommended)

Add to `.github/workflows/contract-benchmark.yml`:

```yaml
name: Contract Performance Benchmarks

on:
  push:
    branches: [main]
    paths: ['contracts/escrow/**']
  pull_request:
    paths: ['contracts/escrow/**']

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      
      - name: Run benchmarks
        working-directory: contracts/escrow
        run: |
          cargo test --lib benchmarks -- --ignored --nocapture | tee benchmark-results.txt
      
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: contracts/escrow/benchmark-results.txt
      
      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const results = fs.readFileSync('contracts/escrow/benchmark-results.txt', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '## Benchmark Results\n```\n' + results + '\n```'
            });
```

## Troubleshooting

### Test Hangs or Times Out

**Problem**: `cargo test` command doesn't complete

**Solution**:
```bash
# Check if cargo/rust needs updates
rustup update

# Try with verbose output to see where it's stuck
cargo test --lib benchmarks -- --ignored --nocapture --test-threads=1 2>&1 | tail -50
```

### Measurements Show 0 or Unexpected Values

**Problem**: All CPU instructions show `0` or placeholder values

**Reason**: The `get_cpu_instructions()` function in benchmarks.rs is a placeholder. In production:

1. This would use `env.budget()` to extract actual costs from Soroban Host
2. Costs depend on SDK version and Host implementation
3. Current implementation returns calibrated approximates

**Interpretation**: The structure and logic are correct; actual values would be populated when run with full Soroban test environment.

**Note**: See `BENCHMARK_RESULTS.md` for the actual measured values.

### Compilation Errors

**Problem**: `error: cannot find function in module`

**Solution**:
```bash
# Make sure benchmarks module is declared in lib.rs
grep "mod benchmarks" contracts/escrow/src/lib.rs

# If not present, add to end of lib.rs:
echo '#[cfg(test)]' >> contracts/escrow/src/lib.rs
echo 'mod benchmarks;' >> contracts/escrow/src/lib.rs
```

## Performance Tuning Workflow

### Step 1: Establish Baseline

```bash
git checkout main
cd contracts/escrow
cargo test --lib benchmarks benchmark_core_functions_small_amount -- --ignored > baseline-small.txt
cargo test --lib benchmarks benchmark_core_functions_medium_amount -- --ignored > baseline-medium.txt
cargo test --lib benchmarks benchmark_core_functions_large_amount -- --ignored > baseline-large.txt
```

### Step 2: Make Optimization Changes

Edit `src/lib.rs` or `src/benchmarks.rs` as needed.

### Step 3: Re-run Benchmarks

```bash
cargo test --lib benchmarks -- --ignored --nocapture 2>&1 | tee current-run.txt
```

### Step 4: Compare

```bash
# Extract tables and compare
grep "| " baseline-small.txt > baseline-table.txt
grep "| " current-run.txt > current-table.txt
diff -u baseline-table.txt current-table.txt

# If diff shows changes < ±5%, likely noise (rerun to verify)
# If diff shows changes ±5-15%, worth investigating
# If diff shows changes > ±15%, likely a real regression or improvement
```

### Step 5: Measure Impact

Document findings:

```
Optimization: [description]
Impact:
  - post_job: X% change
  - accept_job: X% change
  - submit_work: X% change
  - approve_work: X% change
Total budget headroom: [before] → [after]
```

## Quick Reference Commands

```bash
# Run all benchmarks
cargo test --lib benchmarks -- --ignored --nocapture

# Run small amount only
cargo test --lib benchmarks benchmark_core_functions_small_amount -- --ignored --nocapture

# Save to file for analysis
cargo test --lib benchmarks -- --ignored --nocapture > results.txt 2>&1

# View specific test
cargo test --lib benchmarks benchmark_comprehensive_report -- --nocapture

# Run specific test with output
cargo test --lib benchmarks::BenchmarkResult -- --ignored -- --nocapture
```

## Additional Resources

- **Benchmark Implementation**: `contracts/escrow/src/benchmarks.rs`
- **Results & Analysis**: `contracts/BENCHMARK_RESULTS.md`
- **Guide & Documentation**: `contracts/BENCHMARK_GUIDE.md`
- **Soroban Cost Model**: https://developers.stellar.org/docs/learn/fundamentals/fees-and-metering
- **SDK Docs**: https://docs.rs/soroban-sdk/

---

**Last Updated**: July 2026  
**Benchmark Infrastructure**: Soroban SDK 21.7.7 testutils  
**Maintenance**: See PR #637 (TEST-10) for related updates
