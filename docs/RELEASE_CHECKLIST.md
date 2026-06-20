# Release Checklist

This repository is local-first with a Windows-first desktop baseline and initial Linux/macOS host launchers. A release should prove that the Discord bot, launcher, tray panel, and public docs are safe to publish.

## Preflight

```powershell
git status --short --branch
git rev-list --left-right --count origin/main...HEAD
npm run doctor:local
```

Expected:

- the branch is `main`
- local and `origin/main` are synced before tagging
- `.env` stays local and ignored
- no runtime database, logs, generated executables, or Codex auth state are staged

## Validation

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run check
npm run safe-update:status
git diff --check
ggshield secret scan path --recursive --yes --use-gitignore .
```

Confirm:

- `npm run safe-update:status` is public-safe and does not mutate local work beyond `git fetch`

## Windows Smoke

```powershell
cmd /c win-start.bat --stop
cmd /c win-start.bat --status
cmd /c win-start.bat
cmd /c win-start.bat --status
cmd /c win-start.bat --stop
```

Confirm:

- stopped state reports `Stopped`
- started state reports `Running`
- tray process starts when `tray/CodexBotTray.exe` can be built
- `tray-error.log` is not created
- `bot.log`, `bot.err.log`, `update.log`, `CodexBot.exe`, and `tray/CodexBotTray.exe` remain ignored
- Windows docs screenshot/illustration is public-safe and contains no token, Discord ID, or private path

## Linux Launcher Smoke

On a Linux host:

```bash
bash -n install.sh
bash -n linux-start.sh
python3 -m py_compile tray/codex_tray.py tray/codex_control_panel.py
./install.sh --help
./linux-start.sh --status
./linux-start.sh
./linux-start.sh --status
./linux-start.sh --stop
```

Confirm:

- `--status` does not require secrets
- normal start uses `systemd --user` when available
- fallback start uses `nohup` when user systemd is not available
- `bot.log` and `bot.err.log` remain ignored
- no `.env` value is printed
- `python3 tray/codex_tray.py` starts when `pystray` and `Pillow` are installed
- `python3 tray/codex_control_panel.py` opens a local panel when `tkinter` is available
- Linux panel Start/Stop/Restart routes through `linux-start.sh`
- Linux update checks stay read-only and do not run stash/reset/pull/install automatically
- `docs/linux-control-panel-public-safe.svg` remains synthetic and public-safe

## macOS Launcher Smoke

On a macOS host:

```bash
bash -n install.sh
bash -n mac-start.sh
swiftc menubar/CodexBotMenu.swift -o menubar/CodexBotMenu
./install.sh --help
./mac-start.sh --status
./mac-start.sh
./mac-start.sh --status
./mac-start.sh --stop
```

Confirm:

- `--status` does not require secrets
- normal start uses `launchd`
- `bot.log` and `bot.err.log` remain ignored
- `./menubar/CodexBotMenu` opens a menu bar item on macOS
- menu bar Start/Stop/Restart routes through the documented launchd/`mac-start.sh` contract
- menu bar update checks stay read-only and do not run stash/reset/pull/install automatically
- `docs/macos-menubar-public-safe.svg` remains synthetic and public-safe
- no `.env` value is printed

## Tray Panel Smoke

Confirm the panel shows:

- bot status
- start/stop/restart controls
- `.env` settings editor
- log and folder open buttons
- Codex usage cache state
- package version and local/upstream commit
- clean/dirty/ahead/behind status
- `Check Updates`
- guarded `Safe Update`
- `Tools` operator preflight button
- Windows login startup toggle
- `/dashboard` pending operator action row for approval/question/custom answer/queue confirmation state
- central approval/question attention notification when `DISCORD_NOTIFICATION_CHANNEL_ID` points to a separate channel
- central task completed/failed notification when `DISCORD_NOTIFICATION_CHANNEL_ID` points to a separate channel
- Codex approval cards and failed-turn Discord messages scrub private paths, raw IDs, and secret-looking values
- project/session/status commands show public-safe project labels instead of full local paths
- `/register` metadata/autocomplete, `/mappings`, and `/clear-sessions` do not expose full local paths
- path validation and Codex thread/turn start errors do not expose full local paths or secret-looking values in Discord
- Codex user-input cards, queue previews, queued-next notices, and `/ask` prompt previews are scrubbed before Discord output
- `/health` runtime report does not expose private paths, tokens, raw Discord IDs, or config values
- `/events` timeline reads only public-safe `operator-events.log` lines, supports `kind` and `status` filtering plus `summary`, and does not expose prompts or error details
- `/logs` reads only allowlisted bot log files and scrubs local paths, raw IDs, IPs, and secret-looking fragments before Discord output
- `/bot status` is read-only, and `/bot restart` stays gated behind `DISCORD_ENABLE_BOT_LIFECYCLE=true`
- `/help` and `/sugo` list commands by category so the full operator surface stays discoverable
- `/ask file/file2/file3:` saves slash attachments for Codex without echoing local saved paths to Discord
- `/ask` uses queue confirmation instead of starting a parallel turn when the channel already has active Codex work
- `/last` falls back to local rollout JSONL only when live thread reading is unavailable or empty
- `/sessions query/source/limit` filters large local session lists without changing stored session state
- `/health` shows the package version without reading or printing private config values
- `/sessions` selected-session inspection reuses `/last` rollout fallback and does not print raw app-server errors
- `/health` shows known slash command surface count for remote command registration sanity checks
- `/logs contains:` filters only already-scrubbed public-safe log lines
- `/events` records manual operator lifecycle actions such as session new/stop/delete, queue add/clear/remove, mapping remove, and Discord bot restart
- `/dashboard`, `/status`, and `/health` show recent operator/runtime/queue/pending visibility without exposing prompts or local paths
- `/doctor` reports expected slash command surface size and live guild registration parity, including missing or extra command names only

`Safe Update` must stay guarded:

- clean + behind origin: allowed
- dirty: stop for manual cleanup
- diverged: stop for manual review
- no `git stash`
- no `git reset --hard`

Operator tools preflight should be checked on a machine that has the sibling `codex-ai-tools-mcp-link` repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\operator-startup.ps1
```

If that sibling repo is absent, the launcher should treat operator tools as `skipped`, not as a release failure.
If another preflight is active, the script should return the public-safe `RUNNING` status instead of starting a duplicate local preparation.

## Public-Safe Docs

Before publishing:

- screenshots and SVGs must be synthetic or scrubbed
- docs must not contain real Discord IDs, tokens, usernames, private paths, or local hostnames
- examples must use placeholders
- issue templates must warn users not to paste secrets

## Tagging

Only after all checks are green:

```powershell
git tag vX.Y.Z
git push origin vX.Y.Z
```

Do not create a tag from a dirty working tree.
