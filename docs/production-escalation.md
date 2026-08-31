# Production Escalation Path

Use this guide when a production-impacting issue is detected in StellarWork (frontend, contract interaction, or infrastructure).

## Escalation levels

| Level | Severity | Examples | Response target |
| :--- | :--- | :--- | :--- |
| **SEV-1** | Critical / full outage | Funds at risk, contract exploit suspected, app unreachable for all users | Acknowledge within **1 hour**; mitigation started within **4 hours** |
| **SEV-2** | Major degradation | Core flows broken (post job, accept, approve), widespread RPC failures | Acknowledge within **4 hours**; mitigation within **1 business day** |
| **SEV-3** | Partial impact | Non-critical page broken, intermittent errors, single-region RPC issues | Acknowledge within **1 business day**; fix planned in next release cycle |
| **SEV-4** | Low impact | Cosmetic UI issues, docs drift, non-blocking warnings | Track in GitHub; handle per [TRIAGE.md](./TRIAGE.md) SLA |

## First response

1. Confirm scope: frontend only, contract/RPC, or mixed.
2. Assign severity using the table above.
3. Open a GitHub issue with labels `bug` and `priority: high` (or appropriate priority).
4. Post an initial status note in the maintainer release channel.

## Escalation ladder

| Step | Who | Action |
| :--- | :--- | :--- |
| 1 | **On-call contributor** | Triage, reproduce, gather logs and transaction hashes |
| 2 | **Area owner** | See [MAINTAINERS.md](../MAINTAINERS.md): contract → [@anumukul](https://github.com/anumukul); frontend → [@devkayazumi](https://github.com/devkayazumi) |
| 3 | **Project maintainers** | Approve rollback, hotfix, or coordinated contract action |
| 4 | **Security** | If exploit or vulnerability is suspected, follow [SECURITY.md](../SECURITY.md) (private report, do not disclose publicly until coordinated) |

## Ownership and contact path

| Area | Primary owner | Escalation |
| :--- | :--- | :--- |
| Soroban contract (`contracts/escrow`) | [@anumukul](https://github.com/anumukul) | GitHub issue + maintainer ping |
| Frontend (`frontend/`) | [@devkayazumi](https://github.com/devkayazumi) | GitHub issue + maintainer ping |
| Security / suspected exploit | Security contact in [SECURITY.md](../SECURITY.md) | Email only; no public issue with exploit details |
| User-facing comms | Active maintainer on call | [maintenance-window-announcement-template.md](./maintenance-window-announcement-template.md) |

## Mitigation checklist

1. **Detect** — error monitoring, user reports, failed CI/deploy
2. **Mitigate** — rollback per [release-checklist.md](./release-checklist.md#rollback-checklist-failed-release)
3. **Communicate** — status updates in release channel; user-facing post if externally visible
4. **Resolve** — deploy fix or document known limitation
5. **Follow up** — postmortem issue with timeline, root cause, and preventive actions

## Related docs

- [incident-runbook-template.md](./incident-runbook-template.md) — recording an incident end-to-end and postmortem
- [OPS_RUNBOOK.md](./OPS_RUNBOOK.md) — monitoring and per-scenario incident procedures
- [maintenance-window-announcement-template.md](./maintenance-window-announcement-template.md) — planned-downtime announcements
- [TRIAGE.md](./TRIAGE.md) — issue labels and triage SLA
- [release-checklist.md](./release-checklist.md) — release and rollback
- [troubleshooting.md](./troubleshooting.md) — local development issues
- [testnet-deployment-guide.md](./testnet-deployment-guide.md) — contract deploy and verify
- [ARCHITECTURE.md](./ARCHITECTURE.md) — system overview
