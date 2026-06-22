# Setup

This setup is for one local host machine: Discord bot, Codex CLI, Git, and repositories all live on the same Windows, Linux, or macOS host.

## Windows-First Route

For the current supported desktop baseline, use the Windows path first:

```powershell
git clone https://github.com/Attys-syttA/Attys_DC_BOT.git
cd Attys_DC_BOT
cmd /c install.bat
```

Then complete the local `.env`, start the bot, and verify Discord:

```powershell
notepad .env
codex.cmd login status
cmd /c win-start.bat
cmd /c win-start.bat --status
```

In Discord, use:

```text
/doctor
/register
/dashboard
/ask prompt: Irj egy rovid tesztvalaszt.
```

The full repeatable Windows acceptance checklist lives in
`docs/WINDOWS_ACCEPTANCE.md`.

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

### Upstream-Like Normal Message Mode

The upstream `chadingTV/codex-discord` workflow treats normal Discord messages in registered channels as Codex prompts. Attys DC BOT keeps that behavior as an explicit opt-in, not the default.

To enable it:

1. Set `DISCORD_ENABLE_MESSAGE_PROMPTS=true` in the local ignored `.env`.
2. Enable Discord's privileged Message Content Intent in the Discord Developer Portal for this bot.
3. Restart the bot and run `/doctor` to confirm the prompt mode warning/status.
4. Use the mode only in channels intentionally registered to local projects, because normal messages in those channels can become Codex prompts.

For source-style normal text plus attachment prompts, set `DISCORD_ENABLE_ATTACHMENT_MESSAGES=true` as well. Attachment-only normal messages still do not start blind Codex work; use `Send to Codex` or `/ask` when the file needs a written instruction.

Recommended default: leave both flags `false` and use `/ask` or `Send to Codex`. Slash commands and the message context command avoid the Message Content Intent requirement and reduce accidental prompt capture.

## 3. Create Local Config

```powershell
npm install
Copy-Item .env.example .env
```

Linux/macOS:

```bash
./install.sh
cp .env.example .env
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

## 4. Start With A Platform Launcher

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

Recommended Linux start:

```bash
./linux-start.sh
./linux-start.sh --status
```

For Debian WSL2 validation on a Windows host, first follow `docs/LINUX_WSL_DEBIAN.md`. That setup disables accidental Windows `node`/`npm` PATH inheritance and keeps native Linux dependencies under the WSL filesystem.

Run the headless Linux acceptance script from the Linux repo copy:

```bash
bash scripts/linux-wsl-acceptance.sh
```

For a live WSL bot run, create `.env` from `.env.wsl.example`, then complete `codex login` inside Debian.

Useful Linux launcher commands:

```bash
./linux-start.sh --status
./linux-start.sh --stop
./linux-start.sh --fg
```

- normal start uses `systemd --user` when available and falls back to `nohup`.
- `--status` reports whether the bot is running.
- `--stop` stops this bot instance and clears `.bot.lock`.
- `--fg` starts in foreground for diagnosis.
- normal start writes `bot.log` and `bot.err.log`.

Recommended macOS start:

```bash
./mac-start.sh
./mac-start.sh --status
```

Useful macOS launcher commands:

```bash
./mac-start.sh --status
./mac-start.sh --stop
./mac-start.sh --fg
```

- normal start uses `launchd`.
- `--status` reports whether the bot is running.
- `--stop` stops this bot instance and clears `.bot.lock`.
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

Button quick reference:

| Button | Purpose |
|---|---|
| `Start` / `Stop` | Starts or stops only this repository's bot process. |
| `Restart` | Restarts the local bot through the same guarded launcher path. |
| `Settings` | Opens the local ignored `.env` editor. |
| `Open Log` | Opens `bot.log` for local diagnosis. |
| `Open Folder` | Opens the repository folder. |
| `Refresh Usage` | Refreshes the local Codex usage cache through the local Codex app-server. |
| `Check Updates` | Runs a read-only update check. |
| `Safe Update` | Runs only when the checkout is clean, behind origin, and not diverged. |
| `Setup` | Opens this guide. |
| `Tools` | Runs or reports the VS Code-free operator tools preflight. |
| `Launch on login` | Creates or removes the current user's Windows Startup shortcut. |

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

The cross-platform CLI uses the same policy:

```bash
npm run safe-update:status
npm run safe-update:apply
```

Use `safe-update:status` first on Linux/macOS. `safe-update:apply` does not hide local changes; dirty, ahead, or diverged repositories stop for manual review.

If local changes are present, the panel stops and asks for manual cleanup. This keeps your uncommitted work visible instead of hiding it in a stash or deleting it.

The Windows login startup toggle creates or removes `Attys DC BOT.lnk` in the current user's Startup folder. The shortcut points to `win-start.bat` and is never tracked by Git.

### Linux Tray And Control Panel

Linux desktop users can run the Attys-branded Python tray/control panel. Install the GUI dependencies explicitly:

```bash
python3 -m pip install --user pystray Pillow
```

Start the tray:

```bash
python3 tray/codex_tray.py
```

Or open the standalone control panel:

```bash
python3 tray/codex_control_panel.py
```

The Linux panel uses `linux-start.sh` for Start, Stop, Restart, and Status, so it works with `systemd --user` when available and with the launcher's `nohup` fallback when systemd is unavailable. It can open the local `.env`/`.env.example`, `bot.log`, and repository folder, and it can display the Codex usage cache from `~/.codex/rate-limits-cache.json`.

Linux update checks are read-only. The panel may compare local `HEAD` with `origin/main`, but it does not run `git stash`, `git reset --hard`, automatic pull, automatic dependency install, or restart-for-update actions.

Acceptance note: Debian WSL2/WSLg control panel smoke is proven for render/status/usage/Stop/Restart, but the tray icon still needs a real Linux desktop session with system tray support before it can be called production-ready.

![Linux control panel illustration](docs/linux-control-panel-public-safe.svg)

### macOS Menu Bar App

On a Mac with Xcode Command Line Tools installed, build and run the menu bar app:

```bash
swiftc menubar/CodexBotMenu.swift -o menubar/CodexBotMenu
./menubar/CodexBotMenu
```

The macOS menu bar app uses the same local `.env`, `bot.log`, `bot.err.log`, `~/.codex/rate-limits-cache.json`, and `mac-start.sh`/launchd lifecycle contract as the shell launcher. It can show status, Start, Stop, Restart, open logs/folder/settings, display Codex usage, and open GitHub/Setup links.

macOS update checks are read-only. The menu bar app does not run automatic git, npm, or restart update actions.

Acceptance note: the Swift source has compile-only CI evidence, but menu bar runtime smoke still needs a real or remote Mac before it can be called production-ready.

![macOS menu bar illustration](docs/macos-menubar-public-safe.svg)

If macOS blocks the downloaded/built binary, clear quarantine only after reviewing the local file:

```bash
xattr -d com.apple.quarantine menubar/CodexBotMenu
```

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

The same notification channel also receives short attention messages when Codex is waiting for a tool approval or a question answer in another project channel. It also receives short task-completed or task-failed updates when a Codex turn ends.

## 7. Manual Node Start

```powershell
npm run build
npm run doctor:local
npm start
```

Linux/macOS foreground diagnostics:

```bash
npm run build
./linux-start.sh --fg
# or on macOS:
./mac-start.sh --fg
```

Development mode:

```powershell
npm run dev
```

## 8. First Discord Flow

1. In a Discord channel, run `/register`.
2. Select or type a folder under `BASE_PROJECT_DIR`.
3. Use slash commands by default; `/ask` can include up to three optional files or images. Normal messages become prompts only if `DISCORD_ENABLE_MESSAGE_PROMPTS=true`.
4. Use `/dashboard`, `/sessions`, `/last`, `/queue list`, and `/stop` to inspect or control the local Codex work.
5. Use `/dashboard` to see whether Codex is waiting for approval, a question answer, custom input, or queue confirmation.
6. Use `/doctor` if the bot starts but Codex or channel routing does not behave as expected.

Optional local commands:

- `/ask` gives the default slash-command prompt path and can include `file`, `file2`, and `file3` attachments.
- For iPad/phone file handoff, the most reliable path is: upload the file as a normal Discord message, then choose `Apps` / `Alkalmazasok` -> `Send to Codex` on that message.
- Optional source-repo parity: set `DISCORD_ENABLE_ATTACHMENT_MESSAGES=true` to let normal text+attachment messages become Codex prompts in registered channels. Attachment-only messages still ask for an instruction instead of starting blind work.
- Normal message prompt and attachment-message modes require Discord's privileged Message Content intent.
- `/last` can fall back to the local Codex rollout log if live app-server thread reading is unavailable.
- `/sessions query/source/limit` helps narrow large local Codex session lists.
- `/git-status` reports the registered local project's git state.
- `/bot status` checks the Windows launcher status from Discord.
- `/bot restart` restarts the local bot only when `DISCORD_ENABLE_BOT_LIFECYCLE=true`.
- `/session current/new/stop` gives direct per-channel session controls.
- `/queue remove` removes one queued prompt without using buttons.
- `/tools run` runs the VS Code-free operator tools preflight from Discord.
- `/tools status` shows the last public-safe operator tools status lines.
- `/events` shows recent public-safe startup, lifecycle, attention, and task outcome events; use `kind`, `status`, and `summary` for filtered views.
- `/logs` shows a scrubbed tail from `bot.log`, `bot.err.log`, `operator-startup.log`, `operator-events.log`, or `update.log`; use `contains` to filter the scrubbed lines.
- `/dashboard` shows pending operator action state for approvals, Codex questions, custom answers, and queue confirmations.
- `/health` shows the bot runtime health: process uptime, error log, operator tools, usage cache, and bot repo sync state.
- `/run-tests` is disabled unless `DISCORD_ENABLE_RUN_TESTS=true` is set in `.env`.

## 9. Troubleshooting

First-run Windows checks:

```powershell
codex.cmd login status
cmd /c win-start.bat --status
npm run doctor:local
Get-Content bot.err.log -Tail 80
```

- If `codex.cmd login status` is not healthy, fix Codex login before debugging Discord.
- If `win-start.bat --status` says `Stopped`, start with `cmd /c win-start.bat` and then re-check.
- If `/doctor` fails command registration, set `DISCORD_REGISTER_COMMANDS=true` once and restart the bot.
- If `/dashboard` says the channel is not registered, run `/register` in that Discord channel.
- If the tray looks stale after an update, close and reopen the tray; the bot process can keep running.
- If `--status` says `Stopped`, run `Get-Content bot.log -Tail 80` and `Get-Content bot.err.log -Tail 80`.
- If you are away from the desktop, run `/bot status`; if lifecycle control is enabled, `/bot restart` can restart the local bot.
- If `.bot.lock` is stale, run `cmd /c win-start.bat --stop`, then `cmd /c win-start.bat --status`.
- If the tray does not appear, check whether `tray/CodexBotTray.exe` exists and whether Windows/.NET C# compiler tooling is installed.
- If the desktop shortcut icon is generic, start the bot once so the launcher can build `tray/CodexBotTray.exe`, then recreate the shortcut by running `cmd /c install.bat`.
- If usage is unavailable, check `codex.cmd login status` and try the panel's `Refresh Usage` button again.
- If update status is unavailable, check whether `git` is on PATH and whether the repo has an `origin/main` upstream.
- If `operator tools: failed` appears in Discord, check `Get-Content operator-startup.log -Tail 80`.
- If `/tools run` says `Operator tools already running`, wait for the active preflight to finish and then use `/tools status`.
- If approval or question cards appear in a project channel but no central attention message arrives, check `DISCORD_NOTIFICATION_CHANNEL_ID`; duplicate notifications are skipped when it points to the same channel.
- If task completion appears in a project channel but no central completion message arrives, check that the notification channel is separate and sendable.
- If the bot seems alive but behavior is odd, run `/health` first, then `/doctor` if config or Codex login readiness needs checking.
- If you missed a notification while away, run `/events`, `/events kind: task`, `/events status: failed`, `/events status: restart`, or `/events summary: true` to see the recent public-safe operator timeline.
- If you need a read-only log peek while away, run `/logs source: error`, `/logs source: bot`, or `/logs source: operator-tools contains: failed`; the response is scrubbed before Discord output.
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

Launcher syntax checks where Bash is available:

```bash
bash -n install.sh
bash -n linux-start.sh
bash -n mac-start.sh
```

For public-safe reports and releases, also see:

- [docs/PUBLIC_SUPPORT.md](docs/PUBLIC_SUPPORT.md)
- [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)
