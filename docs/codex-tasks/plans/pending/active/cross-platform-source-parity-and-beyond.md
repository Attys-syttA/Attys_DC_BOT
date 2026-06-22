# Windows release-readiness after source parity

Status: active

## Elkeszult reszek

- Source baseline reviewed: `chadingTV/codex-discord` `main` at `dc1afb8e81077fc3e0cbac02c13c69a27d573b8b` remains the fixed comparison point.
- Source gap audit completed in `docs/SOURCE_GAP_AUDIT.md`: no P1 bot-core implementation gap remains against the source repo.
- Source parity matrix completed in `docs/SOURCE_PARITY_MATRIX.md`: upstream command areas, Codex app-server/session handling, SQLite mapping, attachment safety, queue, approval, usage, and platform launcher capabilities are either implemented, implemented differently for Attys safety, or explicitly deferred.
- Windows baseline implemented: `install.bat`, `win-start.bat`, Windows tray/control panel, settings editor, local logs, usage display, update readiness, `Safe Update`, login startup toggle, and operator tools preflight are present.
- Discord operator surface implemented beyond source: `/ask`, `Send to Codex`, `/dashboard`, `/doctor`, `/health`, `/events`, `/logs`, `/mappings`, `/tools`, `/bot`, `/sessions`, `/last`, `/usage`, approvals, user-input questions, queue visibility, and public-safe diagnostics.
- Safety defaults are set and must remain: `DISCORD_ENABLE_MESSAGE_PROMPTS=false`, `DISCORD_ENABLE_ATTACHMENT_MESSAGES=false`, `DISCORD_ENABLE_AUTO_APPROVE=false`, `DISCORD_ENABLE_SESSION_DELETE=false`, and `DISCORD_ENABLE_BOT_LIFECYCLE=false`.
- Cross-platform implementation is locally complete for source parity: Linux/macOS launchers, Linux Python tray/control panel source, macOS Swift menu bar source, canonical usage cache handling, cross-platform safe update CLI, and public-safe platform docs/assets are present.
- Debian WSL2 acceptance is proven for headless Linux build/test/check, Codex CLI login status, live bot smoke, `/ask` Codex response, and WSLg Tk control panel render/status/usage/Stop/Restart.
- macOS compile-only evidence is covered by the `macOS Swift Compile` GitHub Actions workflow.
- Windows onboarding polish is present in README/SETUP, including the Windows-first path, acceptance checklist link, tray button reference, and first-run troubleshooting route.
- 2026-06-22 local validation passed after this plan cleanup: `npm run typecheck`, `npm test` (`38` files, `248` tests), `npm run build`, `npm run check`, `git diff --check`, and `ggshield secret scan path --recursive --yes --use-gitignore .`.
- 2026-06-22 Windows launcher lifecycle smoke passed: `win-start.bat --stop`, `--status`, start, `--status`, `--stop`, final `--status`, and `npm run doctor:local`; final launcher state was `Stopped`.
- 2026-06-22 operator tools preflight ran through the Windows launcher and completed OK for own MCP, Docker Desktop, and Obsidian MCP without starting VS Code or the Telegram/NAS worker.
- 2026-06-22 `npm run safe-update:status` returned `status=dirty` and `canSafeUpdate=false`, which is expected while these release-readiness documentation edits are uncommitted.
- First prerelease candidate version is prepared as npm-compatible `0.1.1-prerelease.1`; recommended GitHub release tag/title is `v0.1.00001-pre` to keep the analyzer-style running-build numbering feel without breaking npm semver.
- Windows tray/control panel default width was widened for the lifecycle action row that includes `Releases/Kiadások`.
- Windows tray rebuild was rechecked after stopping the old locked tray process: the launcher no longer reported `CS0016`, and the bot lifecycle smoke still ended in `Stopped`.
- 2026-06-22 Windows tray/control panel interactive acceptance was operator-tested with no errors reported: the lifecycle/status panel opened, the listed buttons were tried, closing the window minimized it to the system tray, and it could be reopened from the tray.
- 2026-06-22 Discord live smoke was operator-tested from the plan command list with no errors reported: `/doctor`, `/health`, `/dashboard`, `/register`, `/ask`, `Send to Codex`, approval accept/deny, Codex question answer, `/events`, `/logs`, `/last`, `/sessions`, `/usage`, and `/bot status`.

## Nyitott reszek

- **P1 first prerelease publication:** after commit/push and green GitHub Actions, create the first GitHub prerelease from the validated commit with tag/title `v0.1.00001-pre`; do not publish from a dirty worktree.
- **P2 docs closeout:** keep the upstream-like normal message workflow documented as explicit opt-in only; do not make it the default.
- **P2 release gate:** rerun the final validation after the remaining live/manual acceptance evidence is recorded.
- **P3 platform future-work:** Linux tray icon runtime smoke still requires a real Linux desktop session with tray support; WSL2/WSLg control panel evidence is not enough for tray icon acceptance.
- **P3 platform future-work:** macOS menu bar runtime smoke still requires a real or remote Mac; GitHub Actions compile-only evidence is not runtime acceptance.
- **P3 mobile future-work:** iPad/mobile Discord file handoff still requires an operator-client live test: upload file, choose `Send to Codex`, fill modal prompt, confirm Codex receives the saved-file prompt suffix, and verify `/last`.
- **P3 optional polish:** consider a future consistency pass for `DISCORD_EPHEMERAL_RESPONSES`, but keep it separate from this release-readiness plan.

## Szigoru vegrehajtasi szabaly

- Before every implementation or validation slice, run `git status --short --branch`.
- Do not make the `chadingTV/codex-discord` normal-message-first UX the default.
- Keep normal message prompts and normal text+attachment prompts behind explicit env opt-in and Discord Message Content Intent guidance.
- Do not add a new slash command, env key, DB schema, or TypeScript public API for this closeout unless a failed acceptance check proves it is necessary.
- Do not commit `.env`, runtime SQLite state, logs, Codex auth state, raw Discord IDs, tokens, private hostnames/IPs, or private local paths.
- Do not use `git reset --hard`.
- Do not use automatic `git stash`.
- Do not commit or push unless explicitly requested.
- Do not claim Linux tray, macOS menu bar runtime, or iPad/mobile acceptance is complete without real target-platform evidence.
- If tray rebuild reports `CS0016` because `tray/CodexBotTray.exe` is locked, record it as a separate Windows tray rebuild polish item; it does not block bot lifecycle release if start/status/stop succeeds.

## Kovetkezo vegrehajtasi szeletek

1. **Windows acceptance rerun**
   - Status: shell lifecycle slice completed on 2026-06-22.
   - Completed commands:
     - `cmd /c win-start.bat --stop`
     - `cmd /c win-start.bat --status`
     - `cmd /c win-start.bat`
     - `cmd /c win-start.bat --status`
     - `cmd /c win-start.bat --stop`
     - `cmd /c win-start.bat --status`
     - `npm run doctor:local`
   - Interactive UI acceptance: operator-tested on 2026-06-22 with no errors reported.

2. **Windows operator panel check**
   - Status: operator-tested on 2026-06-22 with no errors reported.
   - Completed scope:
     - local tray/control panel opened and reported status
     - panel buttons were tried
     - closing the control panel minimized it to the system tray
     - the control panel reopened from the system tray
   - Acceptance result: pass by operator report; keep this as user-provided Windows UI evidence, not shell-replayed evidence.

3. **Live Discord smoke**
   - Status: operator-tested on 2026-06-22 with no errors reported.
   - Completed commands/flows:
     - `/doctor`
     - `/health`
     - `/dashboard`
     - `/register`
     - `/ask`
     - `Send to Codex`
     - approval accept/deny
     - Codex question answer
     - `/events`
     - `/logs`
     - `/last`
     - `/sessions`
     - `/usage`
     - `/bot status`
   - Acceptance result: pass by operator report; keep this as user-provided live evidence, not shell-replayed evidence.

4. **Final validation and release gate**
   - Status: local validation passed on 2026-06-22 for the current documentation/plan cleanup.
   - Run:
     - `npm run typecheck`
     - `npm test`
     - `npm run build`
     - `npm run check`
     - `git diff --check`
     - `ggshield secret scan path --recursive --yes --use-gitignore .`
   - Verify `git rev-list --left-right --count HEAD...origin/main` is `0 0` before publication, or document the exact ahead/behind state if commit/push is still pending.
   - Acceptance: Windows baseline can be described as release-ready only after this gate and live smoke are green.

5. **First prerelease**
   - Preconditions:
     - Worktree clean after commit.
     - `main` pushed.
     - `HEAD...origin/main` is `0 0`.
     - GitHub Actions are green.
   - Version contract:
     - `package.json` / `package-lock.json`: `0.1.1-prerelease.1`
     - GitHub tag/title: `v0.1.00001-pre`
   - Release type: GitHub prerelease, not stable latest.
   - Release notes must say Windows baseline is the supported path; Linux tray icon, macOS menu bar runtime, and iPad/mobile handoff remain external acceptance.

## Definition of Done

- Windows acceptance checklist is recorded with exact date and result.
- Discord live smoke is recorded with exact command coverage.
- Validation commands are green, including secret scan.
- First prerelease is created only after commit/push and green GitHub Actions, or remains explicitly pending.
- The active plan is either moved to `done` after the Windows release gate, or remains active with only real external-platform future-work listed.
- Linux tray icon, macOS menu bar runtime, and iPad/mobile smoke are not marked complete until real target-platform evidence exists.
