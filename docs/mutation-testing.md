# Mutation Testing

TEST-14 ([#765](https://github.com/anumukul/Stellar-work-/issues/765)).

Statement coverage says a line ran. It does not say a test would have noticed if
that line behaved differently. For a contract that moves other people's money,
the second question is the one that matters.

Mutation testing answers it directly: change the code in small ways, and check
whether the test suite fails. A mutant that **survives** is a behavioural change
no test detects.

## The distinction, concretely

A fee calculation with 100% line coverage:

```rust
let fee = checked_mul_div(&e, amount, fee_bps, BPS_DENOMINATOR);
```

Mutants a tool will try:

| Mutant | Survives if… |
| --- | --- |
| return `0` | no test asserts a non-zero fee |
| return `amount` | no test asserts the fee is *smaller* than the amount |
| `*` → `/` | every test uses an amount where both happen to agree |

Each of those is a live path by which the platform over- or under-charges, and
line coverage reports 100% for all of them.

## Running locally

```bash
cargo install cargo-mutants --locked
cd contracts/escrow
cargo mutants
```

Configuration is in
[`contracts/escrow/.cargo/mutants.toml`](../contracts/escrow/.cargo/mutants.toml).
It is scoped on purpose: a full pass over `lib.rs` generates thousands of
mutants and takes hours, which in practice means it never gets run. The config
targets the escrow lifecycle, the arithmetic helpers and access control — where
an undetected behaviour change costs users funds.

One function, while iterating:

```bash
cargo mutants --regex "resolve_single_dispute"
```

List what would be tried, without running anything:

```bash
cargo mutants --list
```

### Check the baseline first

`cargo mutants` runs the suite unmutated before it starts. **If that baseline is
red, every result is meaningless** — a suite that already fails "kills" every
mutant and reports a perfect score. Make sure `cargo test --lib` is green
before you start:

```bash
cd contracts/escrow && cargo test --lib
```

## Reading the output

Each mutant lands in one of four buckets:

| Outcome | Meaning |
| --- | --- |
| **caught** | A test failed. The suite detects this change |
| **missed** | Every test still passed. Nothing detects this change |
| **timeout** | The mutant hung — usually an infinite loop; treat as caught |
| **unviable** | Did not compile. Not a gap |

Results are written to `mutants.out/`, one file per outcome.

## Target

**80% kill rate on lifecycle functions** — `post_job`, `accept_job`,
`submit_work`, `approve_work`, `reject_work`, `cancel_job`, `raise_dispute`,
`resolve_single_dispute`, `resolve_dispute_split` — and on the arithmetic
helpers.

Not 100%, for a reason worth stating: some mutants are **equivalent** — they
change the code without changing observable behaviour, so no test can kill
them. Chasing 100% means writing assertions that exist to kill mutants rather
than to describe behaviour, which makes the suite worse. A dropped TTL-extension
call is the usual example here: it changes nothing a test can see, but removing
it for real would eventually expire storage.

## Handling a survivor

For each one, in order:

1. **Is it a real gap?** Would this change break a user? If so, write a test
   asserting the behaviour — not a test that merely touches the line.
2. **Is it equivalent?** Behaviour is genuinely unchanged. Document it below
   rather than deleting it silently; the next person will otherwise re-derive
   the same conclusion.
3. **Is it dead code?** Delete the code.

The failure mode to avoid is adding an assertion that kills a mutant without
describing anything a user cares about. That raises the score and lowers the
value of the suite.

## Known equivalent mutants

Recorded so nobody re-investigates them.

| Location | Mutant | Why it cannot be killed |
| --- | --- | --- |
| _(none recorded yet — add rows as the first full pass is triaged)_ | | |

## CI

[`.github/workflows/mutation.yml`](../.github/workflows/mutation.yml) runs
weekly on Mondays and on demand via **workflow_dispatch**.

It is **non-blocking** (`continue-on-error: true`). Mutation testing is a
quality signal, not a gate — a survivor may be a missing test, an equivalent
mutant, or dead code, and only a person can tell which. Blocking merges on the
score would train people to game it.

The run posts a kill-rate summary to the job page and uploads the full report
as an artifact, retained 30 days.

## Where this fits

| Suite | Question it answers |
| --- | --- |
| `cargo test --lib` | Does the contract do what we intended? |
| [Fuzzing](../.github/workflows/fuzz.yml) | Does it survive inputs we did not imagine? |
| **Mutation** | **Would we notice if it stopped doing what we intended?** |
| [Visual regression](visual-regression-testing.md) | Does the interface still look right? |

Mutation testing is the only one that tests the *tests*.
