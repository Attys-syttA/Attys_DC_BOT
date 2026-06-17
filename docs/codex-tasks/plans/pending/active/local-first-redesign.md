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

## Open

- Configure a real Discord application and local `.env`.
- Run a private Discord smoke test with a test guild.
- Decide which operator UX improvements should be added next.
- Commit and push only after the user explicitly approves publication.

## Constraints

- Keep execution on the same Windows machine as Codex CLI.
- Do not add custom remote execution agents or cross-machine state sharing.
- Do not commit secrets, private paths, runtime state, or real Discord IDs.
