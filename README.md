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

For the Windows first-pass installer and desktop shortcut:

```powershell
cmd /c install.bat
```

Recommended Codex login check on Windows:

```powershell
codex.cmd login status
```

If `codex.cmd` is not available, test the command that works on this machine before starting the bot.

## Run

Windows launcher and tray control panel:

```powershell
cmd /c win-start.bat
cmd /c win-start.bat --status
cmd /c win-start.bat --stop
cmd /c win-start.bat --fg
```

Default launch builds the project when needed, starts the tray app when the local C# compiler is available, and writes bot output to `bot.log` plus `bot.err.log`.

```powershell
npm run build
npm start
```

For development:

```powershell
npm run dev
```

Local preflight without starting the Discord bot:

```powershell
npm run doctor:local
```

## Windows Control Panel

The Windows tray app opens an operator control panel for the same local bot instance.

![Public-safe Windows control panel illustration](docs/windows-control-panel-public-safe.svg)

It provides:

- visual bot status
- `Start`, `Stop`, and `Restart`
- local `.env` settings editor based on `.env.example`
- `bot.log` opener
- repository folder opener
- Codex usage cache view with a refresh button
- package version, local commit, upstream commit, and clean/dirty/ahead/behind git status
- read-only `Check Updates` action using `git fetch`
- guarded `Safe Update` action for clean repositories
- operator tools preflight for the sibling `codex-ai-tools-mcp-link` launcher when available
- Windows login startup toggle through the current user's Startup folder

The usage panel reads `~/.codex/rate-limits-cache.json` and can refresh it through the local Codex app-server. If Codex usage is unavailable, the panel shows a local error state without printing tokens, Discord IDs, or private configuration values.

The lifecycle panel separates safe update from destructive recovery. `Check Updates` is read-only apart from `git fetch`. `Safe Update` is enabled only for a clean checkout that is behind origin and runs `git pull --ff-only`, optional `npm install` when dependency files changed, `npm run build`, `npm run check`, and bot restart. It never runs `git stash`, `git reset --hard`, or history rewriting.

When the sibling `codex-ai-tools-mcp-link` repository is present next to this repo, the Windows launcher and tray can run a VS Code-free operator tools preflight. It starts/checks the shared local MCP launcher path with VS Code and Telegram/NAS worker skipped, so the bot can use the same local tool surface more reliably while running by itself. The preflight is guarded by a local lock so duplicate button presses or Discord requests do not start parallel runs. The result is written to the startup Discord message as `operator tools: ready`, `failed`, `skipped`, or `running`.

## Commands

- `/register <path>`: link the current channel to a local project folder
- `/unregister [channel]`: remove the current channel mapping, or a selected legacy channel mapping
- `/status`: show registered project status
- `/dashboard`: show the channel's local Codex control center, including pending operator action state
- `/doctor`: check local Codex, config, and channel readiness without printing secrets
- `/session current`: show the selected local Codex thread for this channel
- `/session new`: make the next prompt start a fresh local Codex thread
- `/session stop`: stop the active Codex turn in this channel
- `/sessions`: show, filter, and resume known local Codex sessions for the registered project
- `/clear-sessions`: delete local Codex session files for the registered project when `DISCORD_ENABLE_SESSION_DELETE=true`
- `/last`: show the last known assistant response, with local rollout-log fallback when live thread read is unavailable
- `/mappings`: list project-channel mappings, flag duplicate project paths, and offer cleanup buttons
- `/stop`: interrupt the current Codex turn
- `/queue list`: show queued prompts
- `/queue clear`: clear queued prompts
- `/queue remove <number>`: remove one queued prompt by its list number
- `/git-status`: run `git status --short --branch` in the registered local project
- `/bot`: show launcher status or restart the local bot when `DISCORD_ENABLE_BOT_LIFECYCLE=true`
- `/events`: show recent public-safe operator events from the local event log, with optional type filtering and summary
- `/help`: show categorized Hungarian help for known bot commands
- `/sugo`: Hungarian alias for `/help`
- `/health`: show public-safe bot runtime health
- `/logs`: show a public-safe tail from local bot logs, with optional scrubbed text filtering
- `/run-tests`: run `npm test` in the registered local project when `DISCORD_ENABLE_RUN_TESTS=true`
- `/tools`: run or inspect the VS Code-free local operator tools preflight
- `/usage`: show local Codex account usage when the app-server exposes rate limits
- `/ask <prompt> [file] [file2] [file3]`: send an explicit prompt and optional file/image attachments to the registered local Codex session
- `/auto-approve`: toggle approval bypass for the current channel when `DISCORD_ENABLE_AUTO_APPROVE=true`

## Configuration

Important `.env` keys:

- `DISCORD_BOT_TOKEN`
- `DISCORD_APPLICATION_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_NOTIFICATION_CHANNEL_ID`
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
- `DISCORD_ENABLE_RUN_TESTS`
- `DISCORD_ENABLE_AUTO_APPROVE`
- `DISCORD_ENABLE_SESSION_DELETE`
- `DISCORD_ENABLE_BOT_LIFECYCLE`

No remote execution keys are required. Do not add custom execution-agent secrets, private hostnames, private IPs, or machine-specific private examples to tracked files.

The tray settings editor writes only the local ignored `.env` file. Keep real values local; tracked docs and examples must use placeholders only.

## Security Model

- `.env` is ignored and must stay local
- access is limited to `ALLOWED_USER_IDS`
- project registration is restricted to `BASE_PROJECT_DIR`
- executable attachment types are blocked
- slash `/ask` attachments are saved under project-local `.codex-uploads/` and local paths are not echoed back to Discord
- runtime SQLite and upload state are ignored
- no custom HTTP execution server is opened by this project
- no network-share or portable-drive workflow is part of the target architecture
- command and file-change auto-approval is disabled unless `DISCORD_ENABLE_AUTO_APPROVE=true`
- local Codex session deletion is disabled unless `DISCORD_ENABLE_SESSION_DELETE=true`
- Discord-side bot restart is disabled unless `DISCORD_ENABLE_BOT_LIFECYCLE=true`
- message-based prompts require Discord's privileged Message Content intent; slash commands work with `DISCORD_ENABLE_MESSAGE_PROMPTS=false`
- tray update checks are read-only apart from `git fetch`; safe update is clean-checkout only and does not stash or reset local work
- `/doctor` reports whether message prompt mode is enabled or slash-command-only mode is active
- `/doctor` warns when one local project still has multiple Discord channel mappings, such as old forum/thread leftovers
- `/dashboard` shows whether Codex is waiting for approval, a question answer, custom input, or queue confirmation
- `/mappings` provides an overview and cleanup buttons before falling back to `/unregister [channel]` for manual legacy mapping removal
- startup notifications go only to `DISCORD_NOTIFICATION_CHANNEL_ID` when it is configured, and the message does not include secrets or raw IDs
- approval/question attention notifications go to `DISCORD_NOTIFICATION_CHANNEL_ID` only when it is a separate sendable channel
- task completed/failed notifications also go to `DISCORD_NOTIFICATION_CHANNEL_ID` only when it is a separate sendable channel
- operator events are also written to ignored `operator-events.log` and can be inspected with `/events`; use `kind` and `summary` when you need a shorter filtered view
- `/logs` reads only allowlisted local bot log files and scrubs path, ID, IP, and secret-looking fragments before replying in Discord

## Validation

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run check
npm run doctor:local
ggshield secret scan path --recursive --yes --use-gitignore .
```

Launcher smoke test on Windows:

```powershell
cmd /c win-start.bat --stop
cmd /c win-start.bat --status
cmd /c win-start.bat
cmd /c win-start.bat --status
cmd /c win-start.bat --stop
```

## Repository Protection

- GitHub Actions CI runs lint, typecheck, tests, and build on Node.js 20 and 22.
- SQLite Check verifies the native `better-sqlite3` dependency in CI.
- Secret Scan runs `ggshield` when `GITGUARDIAN_API_KEY` is configured as a repository secret.
- Dependabot checks npm and GitHub Actions dependencies weekly.

## Public Support And Releases

- Public support guide: [docs/PUBLIC_SUPPORT.md](docs/PUBLIC_SUPPORT.md)
- Release checklist: [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)
- Issue templates ask reporters to remove tokens, real Discord IDs, private paths, and local runtime files before posting.
