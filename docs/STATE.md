# Project State

## Current Status

- Date: 2026-08-01
- Repository folder: `<CODEX_WORKS>\Attys_DC_BOT`
- Target remote: `https://github.com/Attys-syttA/Attys_DC_BOT`
- Phase: Windows prerelease baseline complete; external-platform acceptance remains active, NAS-0 connection/staging baseline is in place, and the bounded audit-orchestration track has a default-off read-only `/audit` command foundation.
- Git state: local `main` tracks `origin/main`; the worktree has a local Codex command resolver fix for launcher-started Windows environments.
- 2026-07-22 launcher/bot recovery: the GUI-launched doctor failed on `codex.cmd --version` and `codex.cmd login status` because the launcher environment did not see the VS Code bundled Codex CLI on PATH. The bot command resolver now honors `CODEX_BIN`, scans PATH entries explicitly, and falls back to the VS Code OpenAI extension `codex.exe` path on Windows.
- 2026-07-22 validation: focused `command-resolver.test.ts` 1 file / 2 PASS; full `npm run check` passed (`plans:check`, `lint`, `typecheck`, 39 test files / 250 PASS, `build`); `doctor:local` passed both normally and with the VS Code Codex PATH entry removed; `git diff --check` passed. The bot was restarted through `win-start.bat`; final status `Running`, new `CodexBot.exe` process, and `bot.err.log` empty. Version unchanged (`0.1.1-prerelease.1`) because no release package was cut.
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
- the next development direction starts with the NAS control-plane / Windows worker connection baseline, then returns to the bounded, check-first audit orchestrator with explicit repair approval, isolated worktrees, and strict retry/stagnation stops.

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
- 2026-08-01 priority change: the first checkpoint is now `Szelet NAS-0`, a health/heartbeat-only NAS control-plane / Windows worker contract. The earlier audit Szelet 0-1 remains planned after this connection baseline and is not considered implemented.
- 2026-08-01 NAS-0 implementation start: added `src/nas/worker-registry.ts` and `src/nas/worker-registry.test.ts` for the first public-safe worker message/status contract (`worker.register`, `worker.heartbeat`, `worker.health`, `worker.status`). This is an internal state/timeout model only; it does not add a network endpoint, NAS runtime, Codex prompt, named check, repair, worktree, retry, or VS Code shim.
- 2026-08-01 NAS-0 config parser: added `src/nas/control-plane-config.ts` and `src/nas/control-plane-config.test.ts`. It normalizes the public-safe control-plane name, accepts only empty or HTTP(S) public base URLs, bounds heartbeat timeout, and fail-closed rejects NAS-side Codex execution.
- 2026-08-01 NAS dry-run status: added `src/nas/worker-store.ts`, `src/nas/worker-store.test.ts`, and `src/cli/nas-status.ts`. `npm run nas:status` prints public-safe JSON for the NAS config and local worker store without exposing the raw store path. The NAS Dockerfile default command is `npm run nas:status`, so the template does not start the main Discord bot on NAS.
- 2026-08-01 Windows worker heartbeat writer: added `src/cli/nas-worker-heartbeat.ts` and `npm run nas:worker:heartbeat`. It writes/upserts the local worker's public-safe heartbeat into the configured `data/workers.json` store and refuses to overwrite invalid store JSON.
- 2026-08-01 NAS staging start: added tracked template folder `deploy/nas/Discord_Codex_BOT/`, ignored copy-ready output `nas-staging/Discord_Codex_BOT/`, `scripts/prepare-nas-staging.ps1`, `npm run nas:prepare`, and `docs/NAS_STAGING.md`. The staging output mirrors the inside of the NAS `Discord_Codex_BOT` share; source copying is opt-in and refuses dirty checkouts unless explicitly overridden after review.
- 2026-08-01 NAS handoff mailbox start: added `src/nas/handoff-store.ts`, `src/nas/handoff-store.test.ts`, `src/cli/nas-handoff-status.ts`, and `npm run nas:handoff:status`. The file-backed `data/handoff` contract creates `inbox`, `outbox`, `archive`, and `tmp`, writes public-safe envelopes through temp files, refuses duplicate message IDs/path escapes, and does not execute Codex or expose secrets.
- 2026-08-01 NAS archive reuse start: extracted the old `E:\NAS_Archivumok\Discord_Codex_BOT.zip` only into ignored `_reference_nas_archive/Discord_Codex_BOT/` for inspection. The archive contains a real `.env.nas`, so it is treated as sensitive local reference only; its ARM64 image is not the current AMD64/Ryzen NAS deploy artifact.
- 2026-08-01 NAS worker-target config: adapted the archive's worker-target idea into `ATTYS_NAS_WORKERS_JSON` on the current control-plane config. It supports public `id`, `label`, `baseUrl`, `sharedSecretEnv`, and `workspaceRootLabel`; `npm run nas:status` reports only public-safe worker metadata and never prints the shared secret value.
- 2026-08-01 NAS worker health probe: added `src/nas/worker-http-client.ts`, `src/nas/worker-http-client.test.ts`, `src/cli/nas-workers-health.ts`, and `npm run nas:workers:health`. It probes configured PC workers with `GET /health`, uses the historical archive-compatible `x-telecodex-shared-secret` header when `sharedSecretEnv` resolves locally, and returns public-safe health summaries without throwing secrets or raw paths into output.
- 2026-08-01 NAS Docker stabilization: the staged NAS Dockerfile now installs `python3`, `make`, and `g++`, preserving the useful old archive lesson that `better-sqlite3` may need native build tooling. The ARM64 prebuilt image remains historical only and was not reused.
- 2026-08-01 NAS env reuse compatibility: `loadConfig()` now accepts old archive env names `DISCORD_TOKEN`, `DISCORD_ALLOWED_USER_IDS`, and `DISCORD_ALLOWED_ROLE_IDS` as fallbacks when the current names are absent, so a later NAS-local `.env.nas` reuse does not require retyping those secrets.
- 2026-08-01 PC worker HTTP health server: added `src/worker/worker-http-config.ts`, `src/worker/worker-http-server.ts`, `src/cli/worker-http.ts`, and `npm run worker:http`. The server is default-off through `ATTYS_WORKER_HTTP_ENABLED=false`, binds to loopback by default, serves only `GET /health`, and requires the archive-compatible `x-telecodex-shared-secret` header when the configured local secret env var is set.
- 2026-08-01 PC worker read-only repo status: added `src/worker/repo-status.ts` and `npm run nas:workers:repo-status` through the NAS worker client. The worker serves `GET /repo-status?project=...` under `ATTYS_WORKER_WORKSPACE_ROOT`, rejects path escapes, returns public-safe branch/clean summary, and does not run tests, install dependencies, write Git state, or execute Codex prompts.
- 2026-08-01 PC worker fixed named-check endpoint: added `POST /checks/<name>?project=...` on the default-off worker server plus `npm run nas:workers:check`. It accepts only the fixed audit catalog (`plans`, `lint`, `typecheck`, `tests`, `build`, `full`), reuses the read-only audit runner, and does not accept arbitrary shell commands, repair, dependency install, Git writes, or Codex prompts.
- 2026-08-01 PC worker loopback smoke: added `scripts/worker-http-smoke.ps1` and `npm run worker:smoke`. The smoke starts the default-off worker server on loopback, probes `health`, `repo-status`, and a fixed named check through the NAS worker client, then stops the temporary worker job.
- 2026-08-01 NAS control-plane loop: added `src/nas/control-plane-runtime.ts`, `src/cli/nas-control-plane.ts`, and `npm run nas:control-plane`. The staged Dockerfile now starts this long-running public-safe status loop instead of the one-shot `nas:status`, so the NAS container can stay alive without running Discord, Codex prompts, repair, or Git writes.
- 2026-08-01 NAS compose startup simplification: removed the staging compose `manual` profile requirement. The NAS service can now start with standard `docker compose up -d` / Synology Container Manager defaults while still running only the public-safe control-plane loop.
- 2026-08-01 NAS runtime smoke: the operator confirmed the Synology container is running and the log shows `nas-control-plane-started`, `nas-control-plane-status`, and `codexExecutionEnabled:false`.
- 2026-08-01 PC worker start helper: added `scripts/start-worker-http.ps1` and `npm run worker:http:start` so the default-off Windows worker HTTP server can be started from an ignored local env file without restarting or modifying the live Discord bot. The existing `win-start.bat` and desktop shortcut remain bot-only launchers in this slice.
- 2026-08-01 NAS worker repo-status/check visibility: the NAS control-plane status snapshot now includes public-safe `workerRepoStatus` for the configured `ATTYS_NAS_STATUS_PROJECT`. `ATTYS_NAS_STATUS_CHECK` remains default-off, but can be set to a fixed named check such as `plans` for lightweight NAS-to-PC check smoke. Added worker lifecycle helpers `worker:http:status`, `worker:http:restart`, and `worker:http:stop`; they target only the repo-local worker process tree, not the live Discord bot.
- 2026-08-01 handoff worker once: added `src/nas/handoff-worker.ts`, `src/cli/worker-handoff-once.ts`, and `npm run worker:handoff:once`. It processes queued public-safe `audit.request` inbox messages once, runs only fixed catalog checks, writes public-safe `audit.result` files to outbox, and archives processed requests. It does not accept arbitrary shell, repair code, install dependencies, write Git state, or run Codex prompts.
- 2026-08-01 live NAS handoff smoke: Windows mapped the Synology `Discord_Codex_BOT` share as `K:\`. The PC worker `.env.worker.local` now points `ATTYS_NAS_HANDOFF_ROOT` to `K:\data\handoff`. A live NAS-share smoke wrote an `audit.request` for `plans` into inbox, `npm run worker:handoff:once` processed it, outbox received `result-nas-live-plans-20260801-184257.json`, and archive received the original request JSON. The live Discord bot was not restarted.
- 2026-08-01 handoff worker loop: added `src/cli/worker-handoff-loop.ts`, `scripts/start-worker-handoff.ps1`, `scripts/worker-handoff-lifecycle.ps1`, and `worker:handoff:status/restart/stop`. The persistent loop requires explicit `ATTYS_NAS_HANDOFF_ROOT` and fails fast if the mapped NAS share is unavailable, so it does not silently fall back to a local mailbox after Windows boot.
- 2026-08-01 audit Szelet 0 start: added `src/audit/types.ts` and `src/audit/check-catalog.ts` with focused tests. The contract now has explicit audit modes, status transitions, separate read/edit/create-delete capabilities, fixed named-check definitions, and `full` expands to visible `plans -> lint -> typecheck -> tests -> build` steps instead of opaque `npm run check`.
- 2026-08-01 audit read-only runner start: added `src/audit/check-runner.ts`, `src/cli/audit-check.ts`, and `npm run audit:check`. The CLI runs only catalog checks, returns public-safe JSON, treats missing package scripts as `unsupported`, and performs no repair, install, Git write, commit, push, or Codex prompt. A real `npm run audit:check -- plans` smoke passed.
- 2026-08-01 audit SQLite store start: added additive `audit_jobs` and `audit_steps` tables plus job/step helpers in `src/db/database.ts`. The store records public-safe project labels and public-safe step output only, supports progress updates and stop requests, and leaves the existing project/session flow unchanged.
- 2026-08-01 read-only `/audit` command start: added a default-off Discord `/audit start|status|stop` command behind `DISCORD_ENABLE_AUDIT=true`. It requires a registered channel, runs only fixed catalog checks, stores job/step results in the audit SQLite tables, and never repairs code, installs dependencies, writes Git state, sends Codex prompts, or opens a NAS endpoint.
- 2026-08-01 audit observability/recovery: `/dashboard` and `/status` now show a short public-safe audit summary. `initDatabase()` normalizes process-like interrupted audit states to `failed` on startup while preserving manual-review jobs. The audit runner now checks the stored stop request before starting each pipeline step, so `/audit stop` can prevent the next `full` check step from starting.
- 2026-08-01 help autocomplete change: `/help parancs` and `/sugo parancs` now use autocomplete instead of fixed choices because the command surface exceeded Discord's 25-choice limit. Manual command-name entry remains supported.
- Current package version: `0.1.1-prerelease.2`.
- 2026-08-01 Windows process helper fix: `windowsCmdInvocation()` was corrected after the audit CLI exposed a real `npm.cmd` argument quoting failure. Focused process tests cover the `.cmd` invocation contract.
- NAS target decision: the Synology `Discord_Codex_BOT` shared folder was emptied by the operator and is the new NAS deploy target. The old `Discord_Codex_BOT.zip` is sensitive historical reference only, and its old ARM64 Docker image is not current deploy source.
- NAS archive reuse decision: the old `.env.nas` may be reused later on the NAS as an operator-owned local secret file, but it must not be committed, printed, or copied into tracked source. Its worker/bridge source can be mined as reference after review.
- NAS handoff staging: `nas-staging/Discord_Codex_BOT/data/handoff/` is now generated with `inbox`, `outbox`, `archive`, and `tmp` so the shared folder has a stable mailbox layout before transport/auth is implemented.
- `Attys_DC_BOT_NAS` remains a separate repository and was not modified. Its existing local `AGENTS.md` change remains untouched.
- Version decision for this audit command/observability checkpoint: prerelease package version remains `0.1.1-prerelease.2`; the default-off public `/audit` surface is already represented by this bump.
- Version decision for NAS handoff mailbox: no additional version bump beyond `0.1.1-prerelease.2`; this is still dry-run/staging infrastructure and does not change the live default bot behavior.
- Version decision for NAS worker health probe: no additional version bump beyond `0.1.1-prerelease.2`; this is an inactive NAS CLI/probe contract and does not change the live default bot behavior.
- Version decision for PC worker HTTP health server: no additional version bump beyond `0.1.1-prerelease.2`; it is default-off and does not change the live bot unless explicitly started separately.
- Version decision for PC worker repo status: no additional version bump beyond `0.1.1-prerelease.2`; it is read-only and only available through the separately started default-off worker server.
- Version decision for PC worker named-check endpoint: no additional version bump beyond `0.1.1-prerelease.2`; it is read-only, fixed-catalog only, and available only through the separately started default-off worker server.
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
