# Setup

This setup is for one Windows machine: Discord bot, Codex CLI, Git, and repositories all live on the same PC.

## 1. Install Prerequisites

- Node.js 20+
- Codex CLI
- Git

Log in to Codex locally:

```powershell
codex.cmd login
codex.cmd login status
```

## 2. Configure Discord

Create a Discord application and bot in the Discord Developer Portal.

Required values for `.env`:

- bot token
- application ID and server ID needed by Discord command registration
- your allowed Discord user ID

Enable Message Content Intent only if normal Discord messages should be accepted as prompts. Slash commands remain the safer default control surface.

## 3. Create Local Config

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` locally. Use a narrow workspace root such as `C:\workspace`. Do not use your whole home directory as the base.

The Windows installer can do the first-pass dependency setup and desktop shortcut creation:

```powershell
cmd /c install.bat
```

The installer checks Node.js 20+, Codex CLI availability, npm dependencies, project build, and then creates an `Attys DC BOT` desktop shortcut to `win-start.bat`. If Node.js must be installed or upgraded, it restarts itself from the repository folder. The shortcut icon uses the tray executable when available, then the local bot executable, then a Windows system icon fallback.

Do not commit:

- `.env`
- Discord token
- Codex auth state
- GitHub token
- real Discord IDs in docs/tests/examples
- local runtime SQLite files

## 4. Start With Windows Launcher

Recommended Windows start:

```powershell
cmd /c win-start.bat
```

Useful launcher commands:

```powershell
cmd /c win-start.bat --status
cmd /c win-start.bat --stop
cmd /c win-start.bat --fg
```

- `--status` reports the real local bot process for this repository.
- `--stop` stops only this repository's bot process and clears stale `.bot.lock`.
- `--fg` starts in foreground for diagnosis.
- normal start writes `bot.log` and `bot.err.log`.

If a C# compiler from Windows/.NET build tooling is available, the launcher also builds and opens the tray control panel. If the compiler is missing, the bot can still start from the launcher, but the tray app will not be rebuilt until the tooling exists.

## 5. Tray Control Panel

The tray/control panel is a local Windows operator surface.

It can:

- show whether the bot is running
- start, stop, or restart the bot
- edit the local ignored `.env`
- open `bot.log`
- open the repository folder
- show Codex usage from `~/.codex/rate-limits-cache.json`
- refresh usage through the local Codex app-server
- show package version, local commit, upstream commit, and git sync state
- check for updates with a read-only `git fetch`
- run a guarded `Safe Update` when the checkout is clean and behind origin
- run the local operator tools preflight from the `Tools` button
- enable or disable Windows login startup

Public-safe preview:

![Windows control panel illustration](docs/windows-control-panel-public-safe.svg)

The settings editor is for local values only. Do not paste real tokens, real Discord IDs, or private local paths into tracked docs, issues, commits, or screenshots.

The update status area is intentionally conservative:

- `Check Updates` may run `git fetch --prune origin`.
- `Safe Update` is enabled only when the checkout is clean, behind origin, and not diverged.
- `Safe Update` runs `git pull --ff-only`.
- It runs `npm install` only when `package.json` or `package-lock.json` changed.
- It then runs `npm run build` and `npm run check`.
- If the bot was already running, it restarts it after successful checks.
- It does not run `git reset --hard`.
- It does not run `git stash`.

If local changes are present, the panel stops and asks for manual cleanup. This keeps your uncommitted work visible instead of hiding it in a stash or deleting it.

The Windows login startup toggle creates or removes `Attys DC BOT.lnk` in the current user's Startup folder. The shortcut points to `win-start.bat` and is never tracked by Git.

## 6. Operator Tools Preflight

When the sibling `<CODEX_WORKS>\codex-ai-tools-mcp-link` repository exists, `win-start.bat` and the tray `Tools` button can run:

```powershell
scripts\operator-startup.ps1
```

This uses the shared workspace launcher without opening VS Code:

- own local MCP is started and checked
- Docker Desktop is started when available
- Obsidian is started and its MCP endpoint is checked
- Telegram/NAS worker and VS Code are skipped

The result is written to `operator-startup.log` locally and appears in the startup Discord notification as `operator tools: ready`, `operator tools: failed`, `operator tools: skipped`, or `operator tools: running`.

The script uses an ignored local lock under `.discord-bot-state`, so a tray click, startup run, and `/tools run` cannot create duplicate preflight runs. If a second request arrives while the first one is active, Discord reports `Operator tools already running` and shows only the latest public-safe status lines.

## 7. Manual Node Start

```powershell
npm run build
npm run doctor:local
npm start
```

Development mode:

```powershell
npm run dev
```

## 8. First Discord Flow

1. In a Discord channel, run `/register`.
2. Select or type a folder under `BASE_PROJECT_DIR`.
3. Send a normal message or use the available slash commands.
4. Use `/dashboard`, `/sessions`, `/last`, `/queue list`, and `/stop` to inspect or control the local Codex work.
5. Use `/dashboard` to see whether Codex is waiting for approval, a question answer, custom input, or queue confirmation.
6. Use `/doctor` if the bot starts but Codex or channel routing does not behave as expected.

Optional local commands:

- `/ask` gives a slash-command prompt path in addition to normal messages.
- `/git-status` reports the registered local project's git state.
- `/session current/new/stop` gives direct per-channel session controls.
- `/queue remove` removes one queued prompt without using buttons.
- `/tools run` runs the VS Code-free operator tools preflight from Discord.
- `/tools status` shows the last public-safe operator tools status lines.
- `/dashboard` shows pending operator action state for approvals, Codex questions, custom answers, and queue confirmations.
- `/run-tests` is disabled unless `DISCORD_ENABLE_RUN_TESTS=true` is set in `.env`.

## 9. Troubleshooting

- If `--status` says `Stopped`, run `Get-Content bot.log -Tail 80` and `Get-Content bot.err.log -Tail 80`.
- If `.bot.lock` is stale, run `cmd /c win-start.bat --stop`, then `cmd /c win-start.bat --status`.
- If the tray does not appear, check whether `tray/CodexBotTray.exe` exists and whether Windows/.NET C# compiler tooling is installed.
- If the desktop shortcut icon is generic, start the bot once so the launcher can build `tray/CodexBotTray.exe`, then recreate the shortcut by running `cmd /c install.bat`.
- If usage is unavailable, check `codex.cmd login status` and try the panel's `Refresh Usage` button again.
- If update status is unavailable, check whether `git` is on PATH and whether the repo has an `origin/main` upstream.
- If `operator tools: failed` appears in Discord, check `Get-Content operator-startup.log -Tail 80`.
- If `/tools run` says `Operator tools already running`, wait for the active preflight to finish and then use `/tools status`.
- If `Safe Update` is disabled, check whether the repo is clean and behind origin.
- If `Safe Update` stops, read `update.log`; it is local and ignored by Git.
- If Windows login startup cannot be toggled, open `shell:startup` and create or remove a shortcut to `win-start.bat` manually.
- If Discord commands are missing, set `DISCORD_REGISTER_COMMANDS=true` once, start the bot, then turn it back off if you do not want command registration on every boot.

## 10. Validate Before Commit

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run check
ggshield secret scan path --recursive --yes --use-gitignore .
```

No `git push` should happen until the local-first cleanup and secret scan are reviewed.

For public-safe reports and releases, also see:

- [docs/PUBLIC_SUPPORT.md](docs/PUBLIC_SUPPORT.md)
- [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)
