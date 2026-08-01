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
- `npm run nas:status` can print a public-safe dry-run control-plane status from a local worker store;
- NAS-side Codex execution is explicitly disabled;
- Windows remains the future Codex worker host;
- no NAS endpoint or runtime bridge is implemented yet.

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

The staged Dockerfile also uses `npm run nas:status` as its default command. This is deliberate: the current NAS slice is a dry-run control-plane/status baseline only.

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
