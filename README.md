# Attys DC BOT

Local-first Discord control surface for Codex CLI on a single Windows machine.

This project is intentionally local-first. The bot runs on the same Windows PC where Codex CLI, `codex login`, Git, and the local repositories are available.

## What It Does

- maps one Discord channel to one local project folder under `BASE_PROJECT_DIR`
- sends Discord prompts to the local Codex app-server protocol
- reads local Codex session state where supported
- stores channel/project/session mappings in local SQLite
- restricts access with an allowed-user whitelist
- rate-limits user prompts
- validates project paths so Discord cannot escape the configured workspace root
- blocks dangerous attachment types and stores allowed uploads under the project-local `.codex-uploads/`

## Requirements

- Windows
- Node.js 20+
- Codex CLI installed
- local `codex login`
- Discord bot token
- Discord server ID
- at least one allowed Discord user ID

Normal use does **not** require `OPENAI_API_KEY`; the bot uses the local Codex login session.

## Setup

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` with real local values. Never commit `.env`.

Recommended Codex login check on Windows:

```powershell
codex.cmd login status
```

If `codex.cmd` is not available, test the command that works on this machine before starting the bot.

## Run

```powershell
npm run build
npm start
```

For development:

```powershell
npm run dev
```

## Commands

- `/register <path>`: link the current channel to a local project folder
- `/unregister`: remove the channel mapping
- `/status`: show registered project status
- `/sessions`: show known local Codex sessions for the registered project
- `/last`: show the last known assistant response
- `/stop`: interrupt the current Codex turn
- `/queue list`: show queued prompts
- `/queue clear`: clear queued prompts
- `/auto-approve`: toggle approval bypass for the current channel

The current baseline also includes `/usage` from the local-first reference implementation. Treat it as optional; it may depend on what the local Codex app-server exposes.

## Configuration

Important `.env` keys:

- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`
- `ALLOWED_USER_IDS`
- `ALLOWED_ROLE_IDS`
- `BASE_PROJECT_DIR`
- `DISCORD_DATABASE_PATH`
- `DISCORD_SESSION_STORE_PATH`
- `RATE_LIMIT_PER_MINUTE`
- `DISCORD_QUEUE_MAX_ITEMS`
- `DISCORD_ENABLE_MESSAGE_PROMPTS`
- `DISCORD_EPHEMERAL_RESPONSES`
- `SHOW_COST`
- `DISCORD_REGISTER_COMMANDS`

No remote execution keys are required. Do not add custom execution-agent secrets, private hostnames, private IPs, or machine-specific private examples to tracked files.

## Security Model

- `.env` is ignored and must stay local
- access is limited to `ALLOWED_USER_IDS`
- project registration is restricted to `BASE_PROJECT_DIR`
- executable attachment types are blocked
- runtime SQLite and upload state are ignored
- no custom HTTP execution server is opened by this project
- no network-share or portable-drive workflow is part of the target architecture

## Validation

```powershell
npm run typecheck
npm test
npm run build
npm run check
ggshield secret scan path --recursive --yes --use-gitignore .
```
