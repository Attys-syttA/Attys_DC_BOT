# Windows Acceptance Checklist

This checklist is the current Windows-first acceptance path for `Attys_DC_BOT`.
It intentionally focuses on the local Windows host and Discord operator flow.
Linux and macOS are documented separately and are not blockers for the Windows
baseline.

## Scope

Windows acceptance covers:

- `install.bat`
- `win-start.bat`
- `tray/CodexBotTray.cs`
- local Codex CLI/app-server access
- Discord slash/context-command operator flow
- public-safe diagnostics and logs

## Local Validation

Run from the repository root:

```powershell
git status --short --branch
git rev-list --left-right --count origin/main...main
npm run check
git diff --check
npm run secret:scan
```

Expected:

- branch is `main`
- local and `origin/main` are synced before release tagging
- `npm run check` passes lint, typecheck, tests, and build
- `git diff --check` is clean
- secret scan reports no secrets
- `.env`, logs, local database files, generated executables, and Codex auth state
  are not staged

## Launcher Smoke

```powershell
cmd /c win-start.bat --stop
cmd /c win-start.bat --status
cmd /c win-start.bat
cmd /c win-start.bat --status
```

Expected:

- `--stop` completes without error
- stopped state reports `Stopped.`
- start reports `Bot started in background.`
- running state reports `Running.`
- `bot.log` contains normal startup lines
- `bot.err.log` is empty or contains only known non-blocking diagnostics

## Discord Smoke

In the registered operator channel:

```text
/doctor
/health
/dashboard
/ask prompt: Irj egy egymondatos tesztvalaszt, hogy a Windows bot eleri-e a Codexet.
```

Expected:

- startup notification says `message prompt mode: slash commands only`
- startup notification says `attachment message mode: explicit handoff only`
- `/doctor` reports configured application ID, guild ID, notification channel,
  allowed principals, base project dir, and `25/25` command registration
- `/doctor` reports message prompts disabled and attachment messages disabled
- `/health` reports bot process, package version, Node runtime, command surface,
  operator tools, usage cache, branch, and origin/main parity
- `/dashboard` uses English/Hungarian operator labels according to `.tray-lang`
- `/ask` returns a Codex response and a completed task card

## Tray Smoke

Open the Windows tray/control panel and confirm:

- `EN/HU` language switch is visible
- status, usage, and git state render
- `Settings` opens the local settings editor
- `Refresh Usage` works or gives a clear local-only error
- `View Log` opens the local log
- `Open Folder` opens the repository folder
- `Stop Bot`, `Start Bot`, and `Restart Bot` route through `win-start.bat`
- `Tools` runs or reports the operator preflight status
- Windows login startup toggle creates/removes only a local Startup shortcut

## Safety Expectations

- Default control mode is slash/context-command only:
  `DISCORD_ENABLE_MESSAGE_PROMPTS=false`.
- Normal message prompts remain available only as explicit opt-in.
- Normal text+attachment messages remain available only as explicit opt-in
  through `DISCORD_ENABLE_ATTACHMENT_MESSAGES=true`.
- Promptless attachment-only messages must not start blind Codex work.
- `Send to Codex` context-command file handoff works without enabling normal
  message prompts.
- `Safe Update` remains clean-only, behind-only, and `git pull --ff-only`.
- No `git stash`, `git reset --hard`, history rewrite, or destructive cleanup is
  part of the normal Windows path.

## 2026-06-21 Evidence Snapshot

Observed on the Windows host:

- launcher stop/status/start/status completed and ended in `Running.`
- Discord startup notification reported operator tools `ready`
- Discord startup notification reported slash-command-only mode
- `/doctor` reported `25/25` application command registration
- `/health` reported bot process, Node runtime, command surface, usage cache,
  `origin/main` parity, and local worktree changes present during development
- `/dashboard` rendered Hungarian operator labels
- `/ask` returned a successful Codex response through the Windows bot
- targeted app-server smoke returned `app-server smoke ok`
- `bot.err.log` was empty after the Windows `.cmd` process wrapper fix
