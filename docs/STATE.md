# Project State

## Current Status

- Date: 2026-06-17
- Repository folder: `<CODEX_WORKS>\Attys_DC_BOT`
- Target remote: `https://github.com/Attys-syttA/Attys_DC_BOT`
- Phase: local-first redesign bootstrap
- Git state: local folder was not a git repository at redesign start

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

## Open Work

1. Remove remaining non-Windows launcher references if they are not needed.
2. Initialize or reconcile local git state against `Attys-syttA/Attys_DC_BOT` only after review.
3. Run the full validation and secret scan before any commit.
