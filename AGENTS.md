# Repository Guidelines

## 1. Scope

This repository is `Attys_DC_BOT`, a local-first Discord bot for controlling Codex CLI on the same Windows machine.

Target GitHub repository:

- `https://github.com/Attys-syttA/Attys_DC_BOT`

## 2. Architecture

Target direction:

```text
Discord
  -> discord.js bot
  -> local Codex session manager / app-server client
  -> local Codex CLI login state
  -> local project folders under BASE_PROJECT_DIR
  -> local SQLite mapping state
```

Explicitly out of scope:

- remote execution bridge
- custom HTTP execution agent
- multi-machine state sharing
- network-share based workflow
- portable-drive workflow
- OpenAI API key requirement for normal use

## 3. Startup and Safety

Before modifying files:

- follow the parent `<CODEX_WORKS>\AGENTS.md` Windows MCP / Serena startup hygiene rules
- run `git status` if this folder is a Git repository
- inspect relevant files before editing
- keep changes small and reviewable

If this folder is not yet a git repository, report that clearly before assuming branch state.

## 4. Coding Defaults

- Node.js 20+
- TypeScript with ES modules
- `discord.js` v14
- SQLite through `better-sqlite3`
- 2-space indentation
- double quotes
- semicolons
- explicit `.js` import specifiers in TypeScript source

## 5. Sensitive Data

Never commit:

- Discord bot tokens
- OpenAI API keys
- Codex auth state
- GitHub credentials
- email addresses
- real Discord guild/user IDs
- private hostnames or IPs
- Windows user-specific paths
- `.env`
- runtime SQLite state
- rollout logs
- upload/cache/runtime folders

Use synthetic placeholders in docs, examples, and tests.

## 6. Required Ignore Policy

The repository must ignore local env, runtime state, SQLite files, logs, build output, dependency folders, and upload/cache folders.

## 7. Validation

For implementation changes, run:

```powershell
npm run typecheck
npm test
npm run build
npm run check
```

Before meaningful commit or publication, run:

```powershell
ggshield secret scan path --recursive --yes --use-gitignore .
```

If `ggshield` is unavailable, document that and do a manual secret-pattern scan.

## 8. Git

- Do not commit automatically.
- Do not push automatically.
- Do not rewrite the remote history without explicit approval.
- The target remote is `Attys-syttA/Attys_DC_BOT`.
