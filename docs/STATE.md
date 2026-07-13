# Project State

## Current Status

- Date: 2026-07-13
- Repository folder: `<CODEX_WORKS>\Attys_DC_BOT`
- Target remote: `https://github.com/Attys-syttA/Attys_DC_BOT`
- Phase: Windows prerelease baseline complete; external-platform acceptance remains active, and a separate bounded audit-orchestration design track is now documented without implementation.
- Git state: local `main` tracks `origin/main`; the worktree is clean and synchronized after the ForgeLab documentation publication and Dependabot maintenance.
- Dependency maintenance: Dependabot PR #7 (`globals` 17.6.0 → 17.7.0) and PR #8 (`@types/node` 26.0.0 → 26.0.1) were reviewed and squash-merged on 2026-07-13.
- Dependency validation: the two updates applied together without conflict; `npm ci` and `npm run check` passed in an isolated worktree (38 test files, 248 tests), and the post-merge CI, SQLite Check, Secret Scan, and macOS Swift Compile workflows all passed.
- Audit note: `npm audit` remained unchanged at 3 moderate and 1 high finding; these PRs introduced no additional finding and did not claim to remediate the existing ones.
- Version decision for this maintenance: development-dependency-only updates with no runtime behavior or release-package change, so no application version bump.
- Active plans:
  - `docs/codex-tasks/plans/pending/active/external-platform-acceptance.md`
  - `docs/codex-tasks/plans/pending/active/bounded-audit-orchestration-and-nas-handoff.md`

## Current Goal

Keep the Windows-first baseline stable while:

- Linux tray icon runtime, macOS menu bar runtime, and iPad/mobile file handoff remain external-platform acceptance work until real target-platform evidence exists;
- the next local-first development direction is prepared as a bounded, check-first audit orchestrator with explicit repair approval, isolated worktrees, strict retry/stagnation stops, and a later separately approved NAS handoff.

## Current Audit-Orchestration Plan Status

- Az önálló, nagy összefoglaló értékelés elkészült: `docs/FORGELAB_FREE_MODE_ATFOGO_ELEMZO_ERTEKELES_2026-07-13.md`. A dokumentum a három megosztható kontrollriportot és a Conductor-futások bizonyítékait egyesíti; a legelső auditriportot a felhasználói kérésnek megfelelően nem kezeli forrásként.
- Az összesített eredmény kiegyensúlyozott: az egyszerű, egyfájlos Conductor-kontroll sikeres volt, de a többfájlos Brain-futásoknál a tényleges fájlok, az exit code-ok és a Preview hibái nem akadályozták meg a hamis `Complete` állapotot. A jelentés végén külön szerepel, hogy a projekt-ZIP-ek és a GUI-/konzolképek szükség esetén átadhatók.
- A 2026-07-13-i kontrollált ForgeLab Free-mode futás és független ZIP-ellenőrzés részletes jelentése: `docs/FORGELAB_FREE_MODE_AUDIT_2026-07-13.md`.
- A Brain + Audit futás többfázisú orchestrációt és két audititerációt mutatott, de hibás projektet minősített `Complete` állapotúnak. Az exportban nem volt futó belépési pont, és mindhárom kötelező `typecheck`/`test`/`build` script hiányzott.
- A kontrollteszt ezért sikertelen. Az eredmény közvetlenül alátámasztja, hogy az Attys `completed` állapota csak fix named-checkek igazolt exit code-jából származhat, nem modell-önértékelésből.
- A tesztet üres workspace-ben, a ForgeLab által támogatott plain JavaScript/JSX stackkel is megismételtük. A második futás `Complete` állapotot adott, de a UI és az export mindössze három konfigurációs/dokumentációs fájlt tartalmazott; hiányzott az alkalmazáskód, az `index.html`, a lockfile és minden teszt.
- A második export validálása: `npm ci`, `npm test` és `npm run build` egyaránt exit code 1 eredménnyel állt le. Ez kizárja, hogy az első kudarc pusztán a TypeScript-korlátozás vagy a korábbi workspace-előzmény következménye volt.
- A támogatott JavaScript/JSX kontroll teljes, külön megosztható hibajelentése: `docs/FORGELAB_JAVASCRIPT_JSX_KONTROLL_HIBAJELENTES_2026-07-13.md`; tartalmazza a teljes promptot, a futási folyamatot, a ZIP- és parancsbizonyítékokat, valamint az auditnyom elvesztésének megfigyelését, saját repositoryra vagy helyi gépre utaló adat nélkül.
- Egy harmadik, minimális kontroll pontosan egy önálló `index.html` fájlt kért csomagok és buildeszköz nélkül. A ForgeLab `Complete` állapotot és hat sikeres fájllétrehozási feladatot jelzett, de a workspace-ben csak `README.md` volt; a Preview két `ENOENT` terminálhiba ellenére sem érvénytelenítette a sikert.
- A harmadik kontroll külön, megosztható hibajelentése: `docs/FORGELAB_COUNTER_CHECK_HIBAJELENTES_2026-07-13.md`; a dokumentum nem tartalmaz saját repositoryra vagy helyi gépre utaló adatot.
- 2026-07-13 source review covered the official ForgeLab marketing page, public GitHub documentation, and a read-only inspection of the authenticated beta workspace UI; no proprietary code was available or treated as implementation evidence.
- The authenticated UI confirmed separate Single Chat/Brain modes, Brain/Audit controls, workspace-context and read/edit/create-delete capability boundaries, role-specific model configuration, existing-project PATCH workflow, and distinct workspace/operator panes. These remain UI-contract observations, not backend enforcement evidence.
- Reusable patterns were limited to phased orchestration, pre-execution plan review, explicit capability separation, bounded audit/retry, stagnation detection, checkpoint/rollback principles, and operator progress/stop UX.
- The plan explicitly rejects OpenRouter/BYOK integration, arbitrary commands, automatic dependency installation/deployment, default-on repair, parallel writes to one worktree, and copying proprietary patch logic.
- First proposed checkpoint: domain and read/edit/create-delete capability contract plus read-only named-check `/audit start|status|stop`, with no repair, worktree automation, retry loop, multi-agent execution, or NAS write.
- `Attys_DC_BOT_NAS` remains a separate repository and was not modified. Its existing local `AGENTS.md` change remains untouched.
- Version decision for this docs-only planning checkpoint: no version bump.
- Version decision for the comprehensive report: docs-only change, no version bump.
- Validation: `npm run plans:check`, `git diff --check` and `ggshield secret scan path --recursive --yes --use-gitignore .` passed on 2026-07-13.

## Current Cross-Platform Parity Status

- Implemented and pushed through `8cccd82`: Linux/macOS launchers, Linux Python tray/control panel, macOS Swift menu bar source, opt-in normal text+attachment message flow, canonical usage cache helpers, public-safe cross-platform docs/assets, cross-platform `safe-update:status/apply`, and `docs/SOURCE_PARITY_MATRIX.md`.
- Local validation passed: `npm run check`, `git diff --check`, shell syntax checks for `install.sh`, `linux-start.sh`, `mac-start.sh`, Python compile for Linux tray/panel, `npm run safe-update:status`, `npm run secret:scan`, and Windows launcher smoke.
- Windows launcher smoke result: bot status/start/status/stop/status completed and final state was `Stopped`. Non-blocking note: tray rebuild reported `CS0016` because `tray/CodexBotTray.exe` was locked by another process, but the bot lifecycle smoke completed.
- Windows/P1 release-readiness plan is done: `docs/codex-tasks/plans/done/windows-release-readiness-after-source-parity.md`.
- 2026-06-22 evidence: local validation passed (`typecheck`, `test`, `build`, `check`, `git diff --check`, `ggshield`), Windows launcher lifecycle smoke passed, operator tools preflight completed OK, `doctor:local` passed, and final launcher state was `Stopped`.
- First prerelease is published as `v0.1.00001-pre`; package version is `0.1.1-prerelease.1`.
- Windows tray rebuild note: widening the control panel required stopping the existing `CodexBotTray.exe` that locked the binary; after that, launcher smoke rebuilt the tray without `CS0016` and ended with the bot `Stopped`.
- Windows UI acceptance note: on 2026-06-22 the operator tested the tray/control panel buttons, confirmed the window closes to the system tray, and confirmed it can be reopened from the tray.
- Discord live smoke note: on 2026-06-22 the operator tested the plan's listed live commands/flows (`/doctor`, `/health`, `/dashboard`, `/register`, `/ask`, `Send to Codex`, approval accept/deny, Codex question answer, `/events`, `/logs`, `/last`, `/sessions`, `/usage`, `/bot status`) and reported no errors.
- Active external-platform work: Linux tray icon runtime needs a real Linux desktop session with tray support; macOS menu bar runtime needs a real or remote Mac; iPad/mobile Discord file handoff needs a real operator-client smoke.
- Practical next step: run the external-platform acceptance slices when the needed target platform is available.

## Audit Summary

- `Codex_Discord_BOT` local: useful TypeScript/Discord/SQLite code exists, but the working tree is dirty and strongly remote-execution oriented.
- `Codex_Discord_BOT` GitHub: public `main` exists and is remote-execution oriented.
- Secondary local reference: clean and synced to its GitHub remote; useful operator-flow ideas were reviewed but not copied wholesale.
- `chadingTV/codex-discord`: useful local-first reference for same-machine Codex CLI/app-server operation, channel-to-project mapping, SQLite state, path validation, rate limiting, attachment blocking, and local Codex session visibility.
- `Attys_DC_BOT` local: docs-only skeleton plus local `.env`; no `.git` directory at audit time.
- `Attys-syttA/Attys_DC_BOT` GitHub: public repo exists with `main`, but only minimal content was present during audit.

## Completed In This Bootstrap

- Added a local-first TypeScript/Discord/Codex baseline under `src/`.
- Added Windows-focused `README.md` and `SETUP.md`.
- Replaced repo-local `AGENTS.md` with local-first rules.
- Replaced `.env.example` with local-first keys only.
- Replaced `.gitignore` with local env/runtime/build/cache protection.
- Set package metadata to `attys-dc-bot`.
- Added `typecheck`, `check`, and `secret:scan` npm scripts.
- Changed the SQLite default path to `.discord-bot-state/bridge.sqlite` through `DISCORD_DATABASE_PATH`.
- Added chadingTV-style local-first slash controls: `/ask`, `/doctor`, `/git-status`, and env-gated `/run-tests`.
- Added `/dashboard` as a safe Discord control-center view for the registered local project.
- Added `DISCORD_APPLICATION_ID` and `DISCORD_ENABLE_RUN_TESTS` to config and `.env.example`.
- Hardened attachment filename handling before files are saved under project-local `.codex-uploads/`.
- Added CI/lint/security automation: GitHub Actions CI, SQLite check, GitGuardian/ggshield secret scan, Dependabot, SECURITY.md, and ESLint.
- Added focused command tests for `/ask`, `/dashboard`, `/doctor`, `/git-status`, and `/run-tests`.
- Refreshed npm dependencies within current major lines for Dependabot follow-up: `tsx`, `zod`, `dotenv`, and `@types/node`.
- Added `/session current/new/stop` and `/queue remove <number>` operator controls with focused tests.
- Gated `/auto-approve` and session-wide automatic approval behind explicit `DISCORD_ENABLE_AUTO_APPROVE=true`.
- Gated local Codex session deletion behind explicit `DISCORD_ENABLE_SESSION_DELETE=true`.
- Promoted `/usage` to the canonical local-first command set with focused command tests and cache fallback coverage.
- Hardened session selection so failed Codex thread reads return a Discord error instead of throwing through the handler.
- Fixed attachment filename sanitization to strip Windows and POSIX path traversal separators consistently in CI.
- Added `npm run doctor:local` for secret-safe local preflight before live Discord smoke testing.
- Made Discord message intents conditional so slash-command-only mode can run without the privileged Message Content intent.
- Restored visible `/ask` prompt context in the acknowledgement message so later Codex answers have an obvious source question.
- Added Hungarian `/help` and `/sugo` commands with short command list and detailed per-command help through the `parancs` option.
- Extended `/doctor` with message prompt mode diagnostics for slash-only versus Message Content intent operation.
- Added optional startup notifications through `DISCORD_NOTIFICATION_CHANNEL_ID`, without printing secrets or raw Discord IDs.
- Added `/doctor` diagnostics for duplicate Discord channel mappings that point at the same local project path.
- Extended `/unregister` with an optional `channel` argument so legacy forum/thread mappings can be removed from the current operator channel.
- Added read-only `/mappings` overview for project-channel mappings, with duplicate project path groups called out before cleanup.
- Extended `/mappings` with cleanup buttons for duplicate mappings; each button stops that channel session, removes the mapping, and refreshes the overview.
- Added Windows launcher/status stabilization and a local tray/control panel with start/stop/restart, settings editor, log/folder open, and Codex usage cache display.
- Extended the Windows tray/control panel with package version, local/upstream commit display, clean/dirty/ahead/behind git status, read-only update check through `git fetch`, and Windows login startup toggle.
- Added guarded `Safe Update` to the Windows tray: clean checkout only, `git pull --ff-only`, dependency install only when package files changed, build/check, and bot restart without stash/reset.
- Added public repo polish: issue templates, PR checklist, release checklist, and public support guide with secret-hygiene reminders.
- Hardened the Windows installer restart path, step labels, Attys desktop shortcut branding, and shortcut icon fallback so it no longer points at a missing tracked icon.
- Expanded startup Discord notifications with launch reason, bot user, prompt mode, command registration state, and loaded slash command count.
- Added best-effort lifecycle notifications before Windows tray/launcher stop or restart actions.
- Added VS Code-free operator tools preflight through `scripts/operator-startup.ps1`, `win-start.bat`, and the tray `Tools` button for own MCP, Docker Desktop, and Obsidian MCP preparation.
- Added `/tools run|status` so the operator tools preflight can be triggered or inspected from Discord without exposing raw local paths.
- Added an ignored `.discord-bot-state` lock for operator tools preflight so repeated tray/startup/Discord requests do not run the same local preparation in parallel.
- Fixed custom typed Codex question answers so they route back to the active question id.
- Allowed pending custom Codex answers through the message handler even when normal message prompts are disabled.
- Extended `/dashboard` with pending operator action visibility for approvals, questions, custom answers, and queue confirmations.
- Added best-effort central attention notifications for approval and Codex question waits when `DISCORD_NOTIFICATION_CHANNEL_ID` points to a separate sendable channel.
- Added best-effort central task outcome notifications for completed and failed Codex turns without exposing error details.
- Added `/health` as a public-safe bot runtime health report for process uptime, error log, operator tools, usage cache, and bot repo git state.
- Added ignored `operator-events.log` and `/events` for a public-safe startup/lifecycle/attention/task outcome timeline.
- Extended `/events` with `kind` filtering and optional `summary` output for short public-safe operator timeline triage.
- Added `/logs` for scrubbed Discord-side tails of allowlisted local bot logs while operating away from the Windows desktop.
- Added `/bot status|restart`, with restart gated behind `DISCORD_ENABLE_BOT_LIFECYCLE=true`.
- Grouped `/help` and `/sugo` list output into operator-friendly command categories.
- Extended `/ask` with one optional `file` attachment using the shared attachment sanitize/download helper.
- Aligned `/ask` with message prompt queue-confirm behavior when a Codex turn is already active.
- Extended `/ask` to accept `file`, `file2`, and `file3` attachment slots.
- Added `/last` fallback to local Codex rollout JSONL logs when live app-server thread reading is unavailable.
- Added `/sessions query/source/limit` filtering for large local Codex session lists.
- Added bot package version visibility to `/health`.
- Reused `/last` rollout fallback in `/sessions` selected-session inspection.
- Added known slash command surface count to `/health`.
- Added `/logs contains` filtering on scrubbed public-safe log lines.
- Added `/events status` filtering on public-safe operator event status text.
- Added shared public-safety sanitizing for Codex approval cards and failed-turn Discord messages.
- Hardened main Discord operator commands to show public-safe project path labels instead of full local paths.
- Hardened `/register` metadata/autocomplete, `/mappings`, and `/clear-sessions` path displays with the same public-safe labels.
- Hardened path validation and Codex start/resume/start-turn errors before Discord output.
- Hardened Codex user-input cards, queue previews, queued-next notices, and `/ask` prompt previews before Discord output.
- Added public-safe operator lifecycle events for session new/stop/delete, queue add/clear/remove, mapping removal, and Discord-triggered bot restart actions.
- Added dashboard/status/health rollups for recent operator events, runtime active state, queue size, and pending operator action visibility.
- Added `/doctor` slash command registration diagnostics that compare live guild commands with the expected local command surface without exposing Discord IDs.

## Open Work

1. Linux tray icon runtime smoke on a real Linux desktop session with tray support.
2. macOS menu bar runtime smoke on a real or remote Mac.
3. iPad/mobile Discord file handoff smoke with a live mobile Discord client.
4. Keep normal message prompts and normal text+attachment prompts documented as explicit opt-in only; do not change their defaults.
5. Consider a later explicit destructive recovery/update mode only if `git stash` or `git reset --hard` should be allowed with strong confirmation.
