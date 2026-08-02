# NAS staging

This repository keeps a NAS copy-ready staging output outside Git:

```text
nas-staging\Discord_Codex_BOT\
```

The contents of that folder are laid out exactly as the inside of the Synology `Discord_Codex_BOT` shared folder should look.

Prepare the staging folder:

```powershell
npm run nas:prepare
npm run nas:check
```

Copy rule:

- copy the contents of `nas-staging\Discord_Codex_BOT\` into the NAS `Discord_Codex_BOT` shared folder;
- do not copy the whole local repository;
- do not copy `.env`, Codex auth state, Git credentials, logs, SQLite runtime state, `node_modules`, `dist`, cache folders, or local session data.

The tracked template source is:

```text
deploy\nas\Discord_Codex_BOT\
```

Current slice status:

- the staging folder is a NAS control-plane deploy skeleton;
- the staged Dockerfile starts `npm run nas:control-plane`, a long-running public-safe status loop;
- `npm run nas:status` can print a public-safe dry-run control-plane status from a local worker store;
- `ATTYS_NAS_WORKERS_JSON` describes future PC worker targets with `id`, `label`, `baseUrl`, required `sharedSecretEnv`, and `workspaceRootLabel`;
- `npm run nas:handoff:status` can print a public-safe dry-run status for the file-backed handoff mailbox;
- the staged `data\handoff\` mailbox contains `inbox`, `outbox`, `archive`, and `tmp`;
- NAS-side Codex execution is explicitly disabled;
- Windows remains the future Codex worker host;
- no NAS-side endpoint or prompt/runtime bridge is implemented yet; the PC worker endpoint is default-off and read-only.

Dry-run local status:

```powershell
npm run nas:worker:heartbeat
npm run nas:status
```

By default, both commands use `data\workers.json` from the current working directory. On NAS, set `ATTYS_NAS_WORKER_STORE_PATH=./data/workers.json` in `.env.nas`. The status command never prints the raw store path.

The worker heartbeat command writes only public-safe worker fields:

- `workerId`
- `label`
- `workspaceRootLabel`
- `capabilities`
- `lastSeenAt`
- `status`

The staged Dockerfile uses `npm run nas:control-plane` as its default command. This is deliberate: the current NAS slice should stay alive as a control-plane/status baseline without starting the main Discord bot or Codex on the NAS.

The staging script also writes `app\NAS_BUILD_INFO.json`. The Docker image copies this into `/app/NAS_BUILD_INFO.json`, and both `npm run nas:status` and the long-running `nas-control-plane-status` log include a public-safe `buildInfo` block with the short source commit, package version, staging generation time, and whether source was included. This is the preferred way to verify which staged source the rebuilt NAS container is running.

The long-running control-plane loop also writes its latest status snapshot to `logs/nas-control-plane-status.json` by default (`ATTYS_NAS_STATUS_SNAPSHOT_PATH`). The file is written through a temp-file and rename sequence. On the Windows side it should appear under the mapped NAS share's `logs` folder after the rebuilt container has produced at least one status tick. This gives the PC-side tools a stable latest-status file without scraping Synology's container log UI.

When the Windows bot can derive the NAS share root from `ATTYS_NAS_HANDOFF_ROOT`, `/nas status` also reads this latest snapshot and shows a short public-safe NAS control-plane line with build commit, package version, handoff status, and checked timestamp. It does not print the snapshot path, worker URL, process ID, or raw JSON to Discord.

After a NAS container rebuild, verify the deployed share and the running control-plane snapshot together:

```powershell
npm run nas:deploy:verify -- --target-root K:\
```

This prints a short checklist by default. Add `--json` if the older machine-readable JSON output is needed:

```powershell
npm run nas:deploy:verify -- --target-root K:\ --json
```

The verifier checks the NAS staging manifest, `app\NAS_BUILD_INFO.json`, `docker-compose.yml`, and `logs\nas-control-plane-status.json` together. The CLI briefly rereads the snapshot when it sees a build mismatch, because SMB can expose a just-replaced status file inconsistently for a short moment. It fails if the compose image tag or generated labels do not match the staged build identity, the running container snapshot still does not match the staged source commit/package version, the snapshot is stale or clock-skewed too far into the future, NAS-side Codex execution is not disabled, the handoff store is not ready, configured worker health is not OK, or public worker metadata exposes URL fields. `/nas status` also includes a compact `NAS deploy verification` line from the same verification logic when the NAS share is reachable. `/nas deploy-status` shows the same verification as a fuller Discord checklist, still without exposing raw paths, worker URLs, process IDs, or raw JSON.

One-command NAS deploy orchestration:

```powershell
npm run nas:deploy
npm run nas:deploy -- -Apply
```

Without `-Apply`, this is a dry-run: it prepares staging, checks the staging manifest, and reports the NAS share sync plan. With `-Apply`, it first verifies the restricted SSH container lifecycle path when a rebuild would be used, then syncs the share, rebuilds the NAS control-plane container through the restricted SSH helper, polls for the status snapshot to match the staged source, and runs `nas:deploy:verify`. The command preserves the same protected NAS paths as `nas:sync-share`.

With a clean checkout, `-Apply` first checks whether the live NAS verifier already matches the current Git commit and `package.json` version. If it already matches, the command skips both NAS share sync and container rebuild, then runs the verifier only. This avoids rewriting generated staging metadata when nothing changed.

The staged `docker-compose.yml` includes a generated image tag plus generated source commit and package version labels. The image tag is derived from the staged source commit and deliberately changes on each staged source build so Synology's existing restricted `docker compose up -d --build` wrapper sees a new image reference and recreates the control-plane container without requiring a broader NAS sudo command.

If sync was needed, the command checks again before rebuilding. If the synced NAS deploy is already current, only the rebuild is skipped. Use `-ForceRebuild` to rebuild even when the verifier is already green:

```powershell
npm run nas:deploy -- -Apply -ForceRebuild
```

The preflight is intentionally before the NAS share write. If the SSH key, NAS-side narrow sudo wrapper, or container status command is unavailable, `nas:deploy -- -Apply` stops before changing managed files on the share. Use `-SkipRebuild` only when the operator intentionally wants a share sync without container lifecycle access.

After rebuild, the helper first checks the NAS container status through the restricted SSH status wrapper. If the container already reports the current commit-specific image tag, the helper skips the long same-process SMB snapshot polling and goes directly to a shorter final verifier retry path. The full deploy verifier still decides success; the image tag is only an early signal that the rebuild reached the NAS runtime.

If the current image tag is not visible yet, the default snapshot polling timeout is 300 seconds. This gives the NAS control-plane loop and SMB share visibility enough time to publish the new `logs\nas-control-plane-status.json` snapshot before the final verifier runs. If the timeout expires, the helper waits one final short grace interval and checks once more before printing the final verifier details. The final verifier step retries before failing, because the live NAS has shown a short delay between a successful container recreate and consistent SMB-side snapshot verification. If those retries still fail, the helper waits one last 30-second SMB cool-down and runs a fresh PowerShell verifier process before returning failure. Override with `-WaitAfterRebuildSec <seconds>` only after an explicit operator decision.

Restricted SSH container lifecycle:

```powershell
npm run nas:container:status
npm run nas:container:rebuild
```

These commands use `scripts\nas-container-lifecycle.ps1`, local OpenSSH key auth, and NAS-side restricted sudo wrapper scripts. Put workstation-specific connection values in ignored `.env.nas-ssh.local`, based on `.env.nas-ssh.example`, or pass explicit script parameters. Do not store NAS passwords, private keys, real hostnames, or tokens in tracked source.

The `status` command keeps its short Compose status output visible by default. Successful `rebuild` runs hide the verbose Docker build output and print a compact summary instead. If the full remote Docker or Compose output is needed for diagnosis, call the helper script directly with `-VerboseOutput`:

```powershell
pwsh -NoProfile -File scripts\nas-container-lifecycle.ps1 -Action rebuild -VerboseOutput
```

Discord also has a read-only `/nas container-status` view under `DISCORD_ENABLE_NAS_STATUS=true`. It uses the same restricted status wrapper but hides raw Docker/SSH output and reports only public-safe reachability, whether the expected control-plane service is up, duration, and output-line count. `/nas doctor` includes the same container reachability signal in its broader read-only diagnostic summary.

The current NAS-side restricted wrapper contract is:

```text
/usr/local/sbin/attys-dc-bot-status.sh
/usr/local/sbin/attys-dc-bot-rebuild.sh
```

NAS-side setup summary:

- create or reuse a dedicated NAS user for Codex deployment automation;
- allow SSH/SFTP for that user and install only the workstation public key in the user's `authorized_keys`;
- do not store the NAS account password in this repository or in `.env.nas-ssh.local`;
- create the two root-owned wrapper scripts above, each limited to `/volume1/Discord_Codex_BOT` and Docker Compose status/rebuild for this project;
- grant passwordless sudo only for those exact wrapper paths through a dedicated `/etc/sudoers.d/...` entry;
- test from Windows with `npm run nas:container:status` before allowing `npm run nas:deploy -- -Apply` to rebuild the container.

The wrapper scripts should keep the NAS-side command surface narrow:

```sh
cd /volume1/Discord_Codex_BOT
docker compose ps
docker compose up -d --build
```

The helper does not grant arbitrary NAS shell access from Discord and does not change the bot's default-off NAS feature flags. It is an operator/deploy helper for this repository's validated NAS control-plane container only.

NAS compose startup:

```powershell
docker compose up -d
```

The service has no extra Compose profile requirement. This keeps Synology Container Manager startup simple while the container still runs only the safe control-plane/status loop.

Archive reuse note:

- `E:\NAS_Archivumok\Discord_Codex_BOT.zip` is useful as a reference for the older NAS bridge design;
- the archive's `.env.nas` can be reused later on the NAS as an operator-owned local secret file, but it must not be committed, printed, or copied into tracked source;
- the runtime accepts the old archive names `DISCORD_TOKEN`, `DISCORD_ALLOWED_USER_IDS`, and `DISCORD_ALLOWED_ROLE_IDS` as fallbacks when the current `DISCORD_BOT_TOKEN`, `ALLOWED_USER_IDS`, and `ALLOWED_ROLE_IDS` names are not set;
- the archive's ARM64 Docker image is not the target artifact for the current AMD64/Ryzen NAS.

Dry-run handoff mailbox status:

```powershell
npm run nas:handoff:status
```

By default this uses `data\handoff` from the current working directory. On NAS, set `ATTYS_NAS_HANDOFF_ROOT=./data/handoff` in `.env.nas`.

The handoff mailbox is only a public-safe file contract in this slice. It does not start a network endpoint, run Codex, install dependencies, write Git state, or perform repair.

PC worker handoff processor:

```powershell
npm run worker:handoff:once
```

This processes queued `audit.request` JSON files from the configured `ATTYS_NAS_HANDOFF_ROOT` inbox once, runs only the fixed audit check named in the public request fields, writes a public-safe `audit.result` JSON file to `outbox`, and archives the processed request. It does not accept arbitrary shell commands, does not repair code, does not install dependencies, and does not write Git state.

Persistent handoff worker:

```powershell
npm run worker:handoff:status
npm run worker:handoff:restart
npm run worker:handoff:stop
```

The loop requires `ATTYS_NAS_HANDOFF_ROOT` in `.env.worker.local` and fails fast if the mapped NAS path is not reachable. This is intentional: if Windows has not reconnected the NAS share after boot, the worker should stop with a clear local error instead of silently processing a local fallback folder.

Worker health probe:

```powershell
npm run nas:workers:health
npm run nas:workers:health -- --json
```

This probes configured worker `baseUrl` values with `GET /health`. Each worker target must define `sharedSecretEnv`; the value is only an environment-variable name, and the actual secret stays in ignored local/NAS env files. The client uses the historical archive-compatible `x-telecodex-shared-secret` header when that env value exists in the local environment. The default output reports only public-safe worker IDs, HTTP status, and compact status summaries; use `--json` for structured output. Public worker metadata does not print configured worker URLs.

For NAS control-plane configuration, worker `baseUrl` must point to a real Windows PC worker host reachable from the NAS. Loopback values such as `localhost`, `127.*`, `0.0.0.0`, and `::1` are rejected by default because inside the NAS container they would refer to the NAS/container itself. The only exception is the local `worker:smoke` script, which sets `ATTYS_NAS_ALLOW_LOOPBACK_WORKERS_FOR_SMOKE=true` temporarily for its own loopback test.

PC worker health server:

```powershell
$env:ATTYS_WORKER_HTTP_ENABLED="true"
npm run worker:http
```

The worker server is disabled by default. When enabled, it binds to `ATTYS_WORKER_HTTP_HOST` and `ATTYS_WORKER_HTTP_PORT`, serves only `GET /health`, and requires the archive-compatible `x-telecodex-shared-secret` header when the configured `ATTYS_WORKER_SHARED_SECRET_ENV` variable has a value. It does not expose prompt, filesystem, Git, repair, session, or Codex execution endpoints in this slice.

Operator-friendly PC worker start:

```powershell
npm run worker:http:start -- -EnvFile .env.worker.local
```

This helper loads an ignored local env file when present, enables only the default-off worker HTTP server, binds to `0.0.0.0:8787`, and sets the workspace root to the parent `<CODEX_WORKS>` folder. The NAS `ATTYS_NAS_WORKERS_JSON` `baseUrl` must point to the Windows PC LAN address, for example `http://<WINDOWS_LAN_IP>:8787`. If Windows Firewall blocks that port, allow inbound TCP `8787` only on the trusted local network.

The existing `win-start.bat` and desktop shortcut remain the live Discord bot launcher. They do not start the PC worker automatically in this slice, because the worker opens a LAN-reachable HTTP port and should stay an explicit operator action.

Worker lifecycle helpers:

```powershell
npm run worker:http:status
npm run worker:http:restart
npm run worker:http:stop
```

These helpers only target the repo-local worker HTTP process tree and do not stop or restart the live Discord bot.

Combined PC-side NAS bridge lifecycle:

```powershell
npm run nas:bridge:status
npm run nas:bridge:start
npm run nas:bridge:restart
npm run nas:bridge:stop
```

This wraps the worker HTTP lifecycle and the persistent handoff worker lifecycle into one operator command. It still targets only the PC-side NAS bridge worker processes, not the live Discord bot. The status output is public-safe and summarizes readiness without printing worker secrets, NAS paths, or process IDs.

Discord-side bridge lifecycle control:

```text
DISCORD_ENABLE_NAS_BRIDGE_LIFECYCLE=false
```

When this is explicitly enabled on the Windows Discord bot, `/nas bridge action:<status|start|stop|restart>` calls the same `nas:bridge:*` helper scripts and returns only a public-safe lifecycle summary. It does not touch the NAS container, does not run arbitrary commands, does not run Codex prompts, and does not stop or restart the live Discord bot.

Repeatable live bridge smoke:

```powershell
npm run nas:bridge:smoke
```

This requires `.env.worker.local` with a reachable `ATTYS_NAS_HANDOFF_ROOT` and an already ready bridge. It writes one synthetic fixed-check request to the NAS handoff inbox, waits for the persistent handoff worker to create the matching outbox result, and prints only the public request id, check, result, and summary. It does not expose the NAS path or any worker secret.

Discord-side bridge smoke:

```text
DISCORD_ENABLE_NAS_BRIDGE_SMOKE=false
```

When this is explicitly enabled on the Windows Discord bot, `/nas smoke` calls only the repo-local `nas:bridge:smoke` helper. It writes one synthetic fixed-check request through the configured handoff mailbox, waits for the matching outbox result, and returns only a public-safe request id, check, result, and summary. It does not run arbitrary commands, does not repair code, does not install dependencies, does not write Git state, and does not run a Codex prompt.

Automatic Discord result notifications:

```text
DISCORD_ENABLE_NAS_RESULT_NOTIFICATIONS=false
DISCORD_NAS_RESULT_POLL_INTERVAL_MS=60000
DISCORD_NAS_REQUEST_STALE_AFTER_MS=900000
```

This is disabled by default. When enabled on the Windows Discord bot, the bot periodically checks the configured NAS handoff outbox, reconciles only locally tracked `queued` requests, and sends a short public-safe result message back to the original Discord channel. Already completed/failed requests are skipped, so the notifier does not repeatedly announce the same outbox result.

`DISCORD_NAS_REQUEST_STALE_AFTER_MS` controls when a locally tracked `queued` request is marked `failed` if no matching NAS outbox result appears. `/nas status`, `/nas results`, and the automatic result notifier all use the same timeout rule. The failure summary is public-safe and does not include raw logs or paths.

Each `/nas request` also creates a linked local audit job in `waiting_nas_result` status. This lets `/audit status` show the NAS-dispatched check while the NAS handoff is still pending. Manual `/nas results` reconciliation and the automatic result notifier both close the linked audit job as `completed` for passed results or `waiting_manual_review` for failed/stale results. The linked audit step stores only public-safe summary text; it does not store raw NAS payloads, paths, logs, tokens, worker URLs, or process IDs.

Before queueing a NAS request, the bot checks whether the same registered project path already has an active audit job in the same Discord guild, including jobs started from a different channel. If one exists, the request is rejected with a public-safe already-active message. This prevents two channels from writing competing audit/NAS state for the same project.

The `/nas status` Discord response also shows whether this notifier is enabled, the configured stale timeout, and the current channel's tracked NAS request counts by status (`queued`, `completed`, `failed`). These are local SQLite counters only; they do not expose request payloads, channel IDs, NAS paths, or raw result logs.

Read-only Discord request ledger:

```text
/nas requests status:<all|queued|completed|failed> limit:<1-10>
/nas request-status request:<id-prefix>
/nas mailbox box:<inbox|outbox|archive> limit:<1-10>
/nas mailbox-status
/nas doctor
```

This uses the same `DISCORD_ENABLE_NAS_STATUS=true` gate as the other NAS status views. It lists locally tracked NAS handoff requests from SQLite with short request IDs, fixed check names, status, age/update minutes, public-safe summaries, and a public-safe mailbox state when the Windows bot can reach the handoff mailbox. It does not write to the NAS share, read raw request payloads, expose paths or tokens, or execute Codex.

Use `/nas request-status` when one request from the ledger needs a closer look. The request value can be a safe ID prefix. Too-short prefixes are rejected, and ambiguous prefixes list matching public-safe IDs instead of guessing. When the Windows bot can reach the handoff mailbox, the report also shows only a public-safe `mailbox=<inbox|outbox|archive|missing|unavailable|invalid>` state. It never prints the NAS path, file name, raw JSON payload, token, or worker URL.

Use `/nas mailbox` when the operator needs a short read-only look at one handoff box. It shows only message id prefix, type, status, check, request prefix, age, and sanitized summary. Invalid JSON files are counted, but raw parse errors, file names, paths, tokens, worker URLs, and raw payloads are never printed.

Use `/nas mailbox-status` when the operator needs a compact consistency check instead of a message list. It compares public-safe mailbox counts with local SQLite request tracking, showing pending tracked outbox results, orphan outbox results, and queued current-channel requests that are missing from the mailbox. It never prints file names, paths, raw payloads, tokens, worker URLs, process IDs, or raw parse errors.

Use `/nas doctor` for the broad read-only operator check. It combines bridge readiness, worker status, handoff status, deploy verification, NAS share sync dry-run freshness, mailbox consistency, result notifier status, and stale timeout into one public-safe report. It never passes `-Apply`, never writes to the NAS share, and does not expose raw command output, paths, file names, payloads, tokens, worker URLs, process IDs, or parse errors.

The Windows bot also records public-safe NAS request lifecycle events into `/events`: `nas-request-queued`, `nas-result-completed`, `nas-result-failed`, and `nas-request-timeout`. These are status tokens only; old NAS outbox files do not re-record already closed local requests.

Read-only worker repo status:

```powershell
npm run nas:workers:repo-status -- --project Attys_DC_BOT
npm run nas:workers:repo-status -- --project Attys_DC_BOT --json
```

This asks each configured worker for `GET /repo-status?project=...`. The PC worker resolves the project under `ATTYS_WORKER_WORKSPACE_ROOT`, rejects path escapes, and returns only a public-safe project label, branch, clean/dirty state, and compact summary. It does not run tests, install dependencies, modify Git state, or send Codex prompts.

Read-only named checks through the worker:

```powershell
npm run nas:workers:check -- --project Attys_DC_BOT --check plans
npm run nas:workers:check -- --project Attys_DC_BOT --check plans --json
```

This calls `POST /checks/<name>?project=...` on the configured PC workers. Supported check names are the fixed audit catalog only: `plans`, `lint`, `typecheck`, `tests`, `build`, and `full`. The worker reuses the local read-only audit runner; it does not accept arbitrary shell commands, does not repair, does not install dependencies, does not write Git state, and does not send Codex prompts.

Local end-to-end smoke:

```powershell
npm run worker:smoke
```

This starts the default-off PC worker server on loopback, probes it through the NAS worker client, runs the `plans` named check by default, and then stops the temporary worker process. It is intended as the last local check before copying a prepared package to the NAS.

When source packaging is needed later, use:

```powershell
pwsh -NoProfile -File scripts\prepare-nas-staging.ps1 -IncludeSource
```

That mode refuses to copy source from a dirty checkout by default. Use `-AllowDirtySource` only after reviewing exactly which local changes should be included in the temporary staging output.

Before copying to the NAS, run:

```powershell
npm run nas:check
```

To refresh the build identity file together with app source, regenerate staging from a clean checkout:

```powershell
npm run nas:prepare -- -IncludeSource
```

The check verifies the manifest hashes and fails if forbidden local/runtime files appear in the staging output.

Direct NAS share sync from the Windows machine:

```powershell
npm run nas:prepare -- -IncludeSource
npm run nas:sync-share -- -TargetRoot K:\
npm run nas:sync-share -- -TargetRoot K:\ -Apply
```

The sync command is dry-run by default. It writes to the NAS only with `-Apply`.
The default terminal output is a short human-readable summary. Use `-Json` for scripts, tests, and Discord command integrations that need the structured result:

```powershell
npm run nas:sync-share -- -TargetRoot K:\ -Json
```

If the staging source copy is `stale`, `-Apply` refuses to run unless `-AllowStaleSource` is also passed after an explicit review. The normal fix is to regenerate staging with reviewed source first.

Discord-side dry-run sync status:

```text
DISCORD_ENABLE_NAS_SYNC_STATUS=false
```

When this is explicitly enabled on the Windows Discord bot, `/nas sync-status` calls only the repo-local dry-run form of `nas:sync-share` with `-Json`. It never passes `-Apply`, so it does not copy, replace, or delete files on the NAS. The Discord response only shows public-safe counts for pending managed files, unchanged managed files, protected skipped files, whether delete-before-copy would be used by a later manual/apply sync, and the staging source freshness.

The `staging-source` field means:

- `fresh`: the source-bearing staging copy is at least as new as the current managed source files;
- `stale`: the current managed source files are newer than `nas-staging`, so rerun `npm run nas:prepare -- -IncludeSource` after reviewing whether the current dirty checkout is intentionally deployable;
- `not-included`: the staging package was generated without app source;
- `unknown`: the helper could not compare the source and staging timestamps safely.

Safety rules:

- it copies only files listed in the generated `NAS_STAGING_MANIFEST.json`, plus the manifest itself;
- when replacing a target file it deletes that single file first, then copies the new file, unless `-NoRemoveBeforeCopy` is used;
- it does not prune the target folder;
- it refuses `-Apply` when `staging-source=stale`, unless `-AllowStaleSource` is explicitly used after review;
- it refuses to manage protected target paths such as `.env.nas`, `data\*.json`, `data\handoff\*`, `logs\*`, and `#recycle\*`;
- it does not print or read real `.env.nas` values.
