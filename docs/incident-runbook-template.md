# Incident Runbook Template

Template for recording a production incident end-to-end. Copy this file to `docs/incidents/YYYY-MM-DD-<incident-id>.md` when an incident starts and fill it in as you go. The filled-in file becomes the input for the [postmortem](#postmortem) section.

Severity levels and the escalation ladder live in [production-escalation.md](./production-escalation.md).

## Metadata

| Field | Value |
|-------|-------|
| Incident ID | `INC-<number>` |
| Date opened | `YYYY-MM-DD HH:MM UTC` |
| Date closed | `YYYY-MM-DD HH:MM UTC` |
| Severity | SEV-1 / SEV-2 / SEV-3 / SEV-4 |
| Status | Detecting / Responding / Mitigated / Resolved / Postmortem |
| Lead responder | `handle` |
| On-call | `handle(s)` |
| Affected service(s) | e.g. frontend, Soroban RPC, escrow contract, Horizon |
| Impact | users affected, % traffic, funds at risk |
| Blast radius | routes / endpoints / contracts / regions |

## Detection

- [ ] Detection source (alert name, user report #, dashboards link, CI failure)
- [ ] Detected at: `YYYY-MM-DD HH:MM UTC`
- [ ] Detected by: `handle`
- [ ] Link to alert / dashboards snapshot

## Triage

- [ ] Initial hypothesis
- [ ] Evidence gathered (logs, metrics, contract events, repro)
- [ ] Is a `maintenance-window-announcement-template.md` notice needed? (user-visible impact)
- [ ] Severity raised / lowered to: `SEV-x` at `HH:MM UTC` by `handle`

## Response timeline

| Time (UTC) | Actor | Action |
|------------|-------|--------|
| `HH:MM` | | | 

Add rows as you go. Keep them factual: what was tried, what was ruled out, what worked.

## Communication

- [ ] Status updates posted to `#incidents` every 30 min (target)
- [ ] PagerDuty / escalation chain invoked: yes/no
- [ ] Incident commander assigned
- [ ] User-facing status posted (status page / announcement) if SEV-1/2

## Mitigation

- [ ] Mitigation performed (rollback, feature flag off, fund recovery, upgrade cancelled)
- [ ] Mitigation verified (link to verification run / check)
- [ ] Residual risk accepted / tracked as issue #

## Resolution

- [ ] Service healthy at: `HH:MM UTC` (health check link)
- [ ] Monitoring confirms recovery for ≥ 1h
- [ ] Incident closed at: `HH:MM UTC`

## Postmortem

Fill in within 5 working days. Blameless: the goal is root cause and prevention, not attribution.

### Summary

One or two sentences: what happened, what users saw, how long.

### Root cause

### Contributing factors

### What worked well

### What went wrong

### Action items

| # | Action | Owner | Due | Tracking issue |
|---|--------|-------|-----|----------------|
| 1 | | | | # |
| 2 | | | | # |

### Follow-up checklist

- [ ] Dashboards/alerts added to catch this in the future
- [ ] Runbook updated with the incident (this template) and linked from [OPS_RUNBOOK.md](./OPS_RUNBOOK.md)
- [ ] Incident ID referenced in changelog / release notes
- [ ] Affected contract funds reconciled (if applicable)

## Related docs

- [production-escalation.md](./production-escalation.md) — severity definitions, escalation ladder, first response
- [OPS_RUNBOOK.md](./OPS_RUNBOOK.md) — monitoring, backups, incident procedures per scenario
- [maintenance-window-announcement-template.md](./maintenance-window-announcement-template.md) — planned-downtime announcements
- [MONITORING.md](./MONITORING.md) — dashboards and alert rules
- [TRIAGE.md](./TRIAGE.md) — issue labels/triage process for follow-ups