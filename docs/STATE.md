# Project State

## Current Status

- Date: 2026-06-20
- Repository folder: `<CODEX_WORKS>\Attys_DC_BOT`
- Target remote: `https://github.com/Attys-syttA/Attys_DC_BOT`
- Phase: logs filtering in progress
- Git state: local `main` tracks `origin/main`; `/logs contains` filtering prepared for validation

## Current Goal

Build a clean Windows local-first Discord bot that controls local Codex CLI sessions on the same machine, without remote execution architecture.

## Audit Summary

- `Codex_Discord_BOT` local: useful TypeScript/Discord/SQLite code exists, but the working tree is dirty and strongly remote-execution oriented.
- `Codex_Discord_BOT` GitHub: public `main` exists and is remote-execution oriented.
- Secondary local reference: clean and synced to its GitHub remote; useful operator-flow ideas were reviewed but not copied wholesale.
- `chadingTV/codex-discord`: useful local-first reference for same-machine Codex CLI/app-server operation, channel-to-project mapping, SQLite state, path validation, rate limiting, attachment blocking, and local Codex session visibility.
- `Attys_DC_BOT` local: docs-only skeleton plus local `.env`; no `.git` directory at audit time.
- `Attys-syttA/Attys_DC_BOT` GitHub: public repo exists with `main`, but only minimal content was present during audit.

## Completed In This Bootstrap

- Added a local-first TypeScript/Discord/Codex baseline under `src/`.
- Added Windows-focused `README.md` and `SETUP.md`.
- Replaced repo-local `AGENTS.md` with local-first rules.
- Replaced `.env.example` with local-first keys only.
- Replaced `.gitignore` with local env/runtime/build/cache protection.
- Set package metadata to `attys-dc-bot`.
- Added `typecheck`, `check`, and `secret:scan` npm scripts.
- Changed the SQLite default path to `.discord-bot-state/bridge.sqlite` through `DISCORD_DATABASE_PATH`.
- Added chadingTV-style local-first slash controls: `/ask`, `/doctor`, `/git-status`, and env-gated `/run-tests`.
- Added `/dashboard` as a safe Discord control-center view for the registered local project.
- Added `DISCORD_APPLICATION_ID` and `DISCORD_ENABLE_RUN_TESTS` to config and `.env.example`.
- Hardened attachment filename handling before files are saved under project-local `.codex-uploads/`.
- Added CI/lint/security automation: GitHub Actions CI, SQLite check, GitGuardian/ggshield secret scan, Dependabot, SECURITY.md, and ESLint.
- Added focused command tests for `/ask`, `/dashboard`, `/doctor`, `/git-status`, and `/run-tests`.
- Refreshed npm dependencies within current major lines for Dependabot follow-up: `tsx`, `zod`, `dotenv`, and `@types/node`.
- Added `/session current/new/stop` and `/queue remove <number>` operator controls with focused tests.
- Gated `/auto-approve` and session-wide automatic approval behind explicit `DISCORD_ENABLE_AUTO_APPROVE=true`.
- Gated local Codex session deletion behind explicit `DISCORD_ENABLE_SESSION_DELETE=true`.
- Promoted `/usage` to the canonical local-first command set with focused command tests and cache fallback coverage.
- Hardened session selection so failed Codex thread reads return a Discord error instead of throwing through the handler.
- Fixed attachment filename sanitization to strip Windows and POSIX path traversal separators consistently in CI.
- Added `npm run doctor:local` for secret-safe local preflight before live Discord smoke testing.
- Made Discord message intents conditional so slash-command-only mode can run without the privileged Message Content intent.
- Restored visible `/ask` prompt context in the acknowledgement message so later Codex answers have an obvious source question.
- Added Hungarian `/help` and `/sugo` commands with short command list and detailed per-command help through the `parancs` option.
- Extended `/doctor` with message prompt mode diagnostics for slash-only versus Message Content intent operation.
- Added optional startup notifications through `DISCORD_NOTIFICATION_CHANNEL_ID`, without printing secrets or raw Discord IDs.
- Added `/doctor` diagnostics for duplicate Discord channel mappings that point at the same local project path.
- Extended `/unregister` with an optional `channel` argument so legacy forum/thread mappings can be removed from the current operator channel.
- Added read-only `/mappings` overview for project-channel mappings, with duplicate project path groups called out before cleanup.
- Extended `/mappings` with cleanup buttons for duplicate mappings; each button stops that channel session, removes the mapping, and refreshes the overview.
- Added Windows launcher/status stabilization and a local tray/control panel with start/stop/restart, settings editor, log/folder open, and Codex usage cache display.
- Extended the Windows tray/control panel with package version, local/upstream commit display, clean/dirty/ahead/behind git status, read-only update check through `git fetch`, and Windows login startup toggle.
- Added guarded `Safe Update` to the Windows tray: clean checkout only, `git pull --ff-only`, dependency install only when package files changed, build/check, and bot restart without stash/reset.
- Added public repo polish: issue templates, PR checklist, release checklist, and public support guide with secret-hygiene reminders.
- Hardened the Windows installer restart path, step labels, Attys desktop shortcut branding, and shortcut icon fallback so it no longer points at a missing tracked icon.
- Expanded startup Discord notifications with launch reason, bot user, prompt mode, command registration state, and loaded slash command count.
- Added best-effort lifecycle notifications before Windows tray/launcher stop or restart actions.
- Added VS Code-free operator tools preflight through `scripts/operator-startup.ps1`, `win-start.bat`, and the tray `Tools` button for own MCP, Docker Desktop, and Obsidian MCP preparation.
- Added `/tools run|status` so the operator tools preflight can be triggered or inspected from Discord without exposing raw local paths.
- Added an ignored `.discord-bot-state` lock for operator tools preflight so repeated tray/startup/Discord requests do not run the same local preparation in parallel.
- Fixed custom typed Codex question answers so they route back to the active question id.
- Allowed pending custom Codex answers through the message handler even when normal message prompts are disabled.
- Extended `/dashboard` with pending operator action visibility for approvals, questions, custom answers, and queue confirmations.
- Added best-effort central attention notifications for approval and Codex question waits when `DISCORD_NOTIFICATION_CHANNEL_ID` points to a separate sendable channel.
- Added best-effort central task outcome notifications for completed and failed Codex turns without exposing error details.
- Added `/health` as a public-safe bot runtime health report for process uptime, error log, operator tools, usage cache, and bot repo git state.
- Added ignored `operator-events.log` and `/events` for a public-safe startup/lifecycle/attention/task outcome timeline.
- Extended `/events` with `kind` filtering and optional `summary` output for short public-safe operator timeline triage.
- Added `/logs` for scrubbed Discord-side tails of allowlisted local bot logs while operating away from the Windows desktop.
- Added `/bot status|restart`, with restart gated behind `DISCORD_ENABLE_BOT_LIFECYCLE=true`.
- Grouped `/help` and `/sugo` list output into operator-friendly command categories.
- Extended `/ask` with one optional `file` attachment using the shared attachment sanitize/download helper.
- Aligned `/ask` with message prompt queue-confirm behavior when a Codex turn is already active.
- Extended `/ask` to accept `file`, `file2`, and `file3` attachment slots.
- Added `/last` fallback to local Codex rollout JSONL logs when live app-server thread reading is unavailable.
- Added `/sessions query/source/limit` filtering for large local Codex session lists.
- Added bot package version visibility to `/health`.
- Reused `/last` rollout fallback in `/sessions` selected-session inspection.
- Added known slash command surface count to `/health`.
- Added `/logs contains` filtering on scrubbed public-safe log lines.

## Open Work

1. Consider a later explicit destructive recovery/update mode only if `git stash` or `git reset --hard` should be allowed with strong confirmation.
2. Consider Linux/macOS launcher parity only if the project stops being Windows-first.
3. Add scrubbed or synthetic screenshots only when they reveal more than the current SVG.
4. Keep using `/mappings` and `/doctor` for future legacy mapping drift checks.
