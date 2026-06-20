# Release Checklist

This repository is Windows-first and local-first. A release should prove that the Discord bot, launcher, tray panel, and public docs are safe to publish.

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
git diff --check
ggshield secret scan path --recursive --yes --use-gitignore .
```

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
