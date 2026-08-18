# NAS Handoff Security Boundary Review

Date: 2026-08-18

Scope: local `Attys_DC_BOT` audit/NAS handoff boundary only. This document does not approve source writes in `Attys_DC_BOT_NAS`, remote execution architecture changes, container rebuilds, deploys, or NAS-side Codex execution.

## Reviewed Local Boundary

- Discord commands remain gated by the existing allowed user/role checks and default-off feature flags.
- `/nas handoff-gate` is read-only and uses only source-controlled static readiness criteria.
- Local audit checks use the fixed named-check catalog. They do not accept arbitrary shell text from Discord.
- NAS handoff requests use the existing public-safe envelope flow and fixed check names.
- Worker HTTP probes require configured shared-secret environment variables before network calls are attempted.
- Public operator output must not include local paths, NAS paths, worker URLs, process IDs, raw JSON payloads, raw command logs, tokens, or credentials.
- Source write operations remain limited to the guarded local `/audit repair-apply` and `/audit repair-revert` handoff paths; neither path commits, pushes, deploys, merges branches, or cleans up automatically.

## Shared vs NAS-Specific Split

Keep in `Attys_DC_BOT`:

- Discord command UX and local SQLite operator ledger.
- Fixed named-check catalog and read-only audit runner.
- Public-safe NAS status, mailbox, request, deploy-status, and handoff-gate reports.
- Windows worker health/repo/check server and local bridge lifecycle helpers.
- Source-publication and local security/scope gate reporting.

Move to a dedicated NAS architecture plan before editing `Attys_DC_BOT_NAS`:

- NAS-side source layout and repository-local `AGENTS.md`/`STATE.md`.
- NAS container runtime responsibilities beyond the current control-plane status loop.
- Any remote execution boundary change, even if still fixed-check-only.
- Deployment, rebuild, migration, or persistent NAS data handling changes.
- Any cross-machine auth or secret rotation procedure.

## Fail-Closed Decisions

- The NAS handoff remains blocked until the NAS repository plan exists and the operator explicitly approves the remote boundary change.
- Missing NAS repo state, unclear remote ownership, unavailable credentials, dirty worktrees, or ambiguous source/runtime parity must stop the handoff instead of guessing.
- Any new NAS source write, deploy, or remote execution capability needs its own validation and closeout; this review is not reusable as blanket approval.
