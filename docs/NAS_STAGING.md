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
- NAS-side Codex execution is explicitly disabled;
- Windows remains the future Codex worker host;
- no NAS endpoint or runtime bridge is implemented yet.

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
