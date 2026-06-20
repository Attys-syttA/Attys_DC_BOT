Status: done / register mapping path metadata safety

# Register and mapping path metadata safety

## Goal

- Remove the remaining full local path displays from Discord command metadata and mapping/session cleanup surfaces.
- Keep actual local registration, autocomplete values, and cleanup behavior unchanged.

## Implemented

- `/register` option description no longer embeds `BASE_PROJECT_DIR`.
- `/register` autocomplete shows the base option as a public-safe label.
- `/mappings` field names use public-safe project labels.
- `/clear-sessions` result embeds use public-safe project labels.

## Validation

- Focused tests cover autocomplete, mappings, and clear-sessions display.
- Full repo validation and secret scan were run before commit.

## Notes

- Autocomplete values still pass the real local path back to the bot when needed.
- Discord-visible labels avoid full local paths.
