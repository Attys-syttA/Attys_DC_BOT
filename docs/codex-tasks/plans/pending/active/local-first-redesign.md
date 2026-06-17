# Local-First Redesign Plan

Status: active / partly implemented

## Current Context

`Attys_DC_BOT` is now the target repository for a Windows local-first Discord-Codex bot.

The project is based on a direct local control model:

```text
Discord
  -> discord.js bot
  -> local Codex app-server / CLI
  -> local repository folder under BASE_PROJECT_DIR
  -> local SQLite state
```

## Completed

- Git repository initialized locally on branch `main`.
- Remote set to `https://github.com/Attys-syttA/Attys_DC_BOT.git`.
- TypeScript, `discord.js`, SQLite, and Vitest baseline added.
- Local-first config keys documented in `.env.example`.
- Runtime files, secrets, SQLite databases, logs, and build output are ignored.
- README, setup guide, local `AGENTS.md`, state, and changelog were rewritten for the local-first direction.
- Validation scripts are present: `typecheck`, `test`, `build`, `check`, and `secret:scan`.
- Added chadingTV-style local-first controls: `/ask`, `/doctor`, `/git-status`, and env-gated `/run-tests`.
- Added `/dashboard` as a Discord-native local Codex control center for the current channel.
- Added `DISCORD_APPLICATION_ID` and `DISCORD_ENABLE_RUN_TESTS` config keys.
- Hardened attachment storage by sanitizing Discord filenames before writing into `.codex-uploads/`.
- Added repo hygiene workflows: CI, SQLite native dependency check, GitGuardian/ggshield secret scan, Dependabot, SECURITY.md, and ESLint.
- Added focused command tests for `/ask`, `/dashboard`, `/doctor`, `/git-status`, and `/run-tests`.
- Added focused Discord interaction tests for authorization, stop, queue confirm, approval, new-session, and ask-select flows.
- Refreshed npm dependencies within current major versions after Dependabot opened `tsx` and `zod` branches.
- Added `/session current/new/stop` and `/queue remove <number>` operator controls with focused tests.
- Gated `/auto-approve` and session-wide automatic approval behind explicit `DISCORD_ENABLE_AUTO_APPROVE=true`.
- Gated local Codex session deletion behind explicit `DISCORD_ENABLE_SESSION_DELETE=true`.
- Promoted `/usage` into the canonical local-first command set with live-fetch/cache/failure tests.
- Hardened session selection against failed Codex thread reads.
- Added Hungarian `/help` and `/sugo` command help.
- Extended `/doctor` with message prompt mode diagnostics.
- Added optional public-safe startup notifications through `DISCORD_NOTIFICATION_CHANNEL_ID`.
- Added `/doctor` diagnostics for duplicate Discord channel mappings on the same local project path.
- Extended `/unregister` so an admin can remove selected legacy channel mappings without leaving the current operator channel.
- Added read-only `/mappings` overview for all project-channel mappings and duplicate project path groups.

## Open

- Configure a real Discord application and local `.env`.
- Run a private Discord smoke test with a test guild.
- Decide which operator UX improvements should be added next.
- Commit and push only after the user explicitly approves publication.

## Constraints

- Keep execution on the same Windows machine as Codex CLI.
- Do not add custom remote execution agents or cross-machine state sharing.
- Do not commit secrets, private paths, runtime state, or real Discord IDs.
