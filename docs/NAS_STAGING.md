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
- `ATTYS_NAS_WORKERS_JSON` describes future PC worker targets with `id`, `label`, `baseUrl`, `sharedSecretEnv`, and `workspaceRootLabel`;
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

Worker health probe:

```powershell
npm run nas:workers:health
```

This probes configured worker `baseUrl` values with `GET /health`. It uses the historical archive-compatible `x-telecodex-shared-secret` header when the configured `sharedSecretEnv` exists in the local environment. The output reports only public-safe worker IDs, HTTP status, and compact status summaries.

PC worker health server:

```powershell
$env:ATTYS_WORKER_HTTP_ENABLED="true"
npm run worker:http
```

The worker server is disabled by default. When enabled, it binds to `ATTYS_WORKER_HTTP_HOST` and `ATTYS_WORKER_HTTP_PORT`, serves only `GET /health`, and requires the archive-compatible `x-telecodex-shared-secret` header when the configured `ATTYS_WORKER_SHARED_SECRET_ENV` variable has a value. It does not expose prompt, filesystem, Git, repair, session, or Codex execution endpoints in this slice.

Read-only worker repo status:

```powershell
npm run nas:workers:repo-status -- --project Attys_DC_BOT
```

This asks each configured worker for `GET /repo-status?project=...`. The PC worker resolves the project under `ATTYS_WORKER_WORKSPACE_ROOT`, rejects path escapes, and returns only a public-safe project label, branch, clean/dirty state, and compact summary. It does not run tests, install dependencies, modify Git state, or send Codex prompts.

Read-only named checks through the worker:

```powershell
npm run nas:workers:check -- --project Attys_DC_BOT --check plans
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

The check verifies the manifest hashes and fails if forbidden local/runtime files appear in the staging output.
