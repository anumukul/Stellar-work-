# Issue Triage Guide

This guide outlines the process for triaging and labeling incoming issues in the StellarWork project.

## Overview
Maintainers should review new issues regularly to ensure they are actionable, correctly categorized, and prioritized according to the project's roadmap.

## Triage Steps
1. **Initial Review**: 
   - Check if the issue is a duplicate of an existing one.
   - Verify that it follows the appropriate issue template and contains enough information to be actionable.
   - If information is missing (e.g., reproduction steps, logs), add the `needs info` label and ask the reporter for details.
2. **Categorization**:
   - Apply appropriate labels based on the [Label Meanings](#label-meanings) table.
   - Categorize by domain (e.g., `contract`, `frontend`).
3. **Prioritization**:
   - Assign priority labels based on the impact and urgency:
     - `priority: high`: Critical bugs or core feature blockers.
     - `priority: medium`: Standard bugs or planned enhancements.
     - `priority: low`: Minor UI tweaks or nice-to-have features.
4. **Action**:
   - Assign to a maintainer or mark as `good first issue` if suitable for external contributors.
   - Close as `invalid` or `duplicate` if necessary, providing a clear explanation.

## Label Meanings

| Label | Description | Use Case |
| :--- | :--- | :--- |
| `bug` | Confirmed bug or regression. | Something that was working but is now broken. |
| `enhancement` | New feature or improvement. | Adding new functionality or optimizing existing ones. |
| `documentation` | Docs-only changes. | Fixing typos, adding guides, updating README. |
| `contract` | Soroban contract changes. | Logic updates in `contracts/`. |
| `frontend` | UI/UX changes. | Next.js, React, or CSS updates in `frontend/`. |
| `maintenance` | Chore or refactoring. | Dependency updates, code cleanup, CI changes. |
| `good first issue` | Beginner-friendly tasks. | Small, well-defined tasks for new contributors. |
| `needs info` | Missing details. | Waiting for reporter to provide logs or reproduction steps. |
| `invalid` | Out of scope or not a bug. | Feature requests that don't fit the project or non-reproducible bugs. |
| `duplicate` | Already reported. | Link to the original issue and close. |
| `priority: high` | High impact/urgency. | Needs immediate attention. |
| `priority: medium` | Normal impact. | Will be handled in the next sprint/milestone. |
| `priority: low` | Low impact. | Backlog item, will be handled when possible. |

## SLA Expectations

We aim to respond to new issues and pull requests within the following timeframes:

- **Bugs (Critical/Blocker)**: Initial response within 24 hours.
- **Bugs (Normal)**: Initial response within 3 business days.
- **Enhancements/Discussions**: Initial response within 1 week.
- **Pull Request Reviews**: Initial review within 3-5 business days.

*Note: These are targets, not guarantees. Response times may vary during holidays or busy periods.*
