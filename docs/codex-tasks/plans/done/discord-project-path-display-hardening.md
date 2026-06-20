Status: done / Discord project path display hardening

# Discord project path display hardening

## Goal

- Keep the local channel-to-project behavior unchanged.
- Avoid printing full Windows/local paths in normal Discord operator views.
- Preserve enough context by showing a public-safe `<local-path>/project-name` label.

## Implemented

- Reused the shared public-safety helper for project path labels.
- Hardened these Discord command outputs:
  - `/dashboard`;
  - `/register`;
  - `/session current`;
  - `/sessions`;
  - `/status`;
  - `/stop`;
  - `/unregister`.

## Validation

- Existing command tests continue to cover behavior.
- Full repo validation and secret scan were run before commit.

## Notes

- Stored SQLite mappings and Codex working directories are not changed.
- This only changes Discord-visible display text.
