Status: done / operator events status filtering

# Operator events status filtering

## Goal

- Make the Discord-side operator timeline easier to triage while away from the desktop.
- Keep `/events` public-safe: no prompts, raw errors, tokens, raw IDs, or private local paths.
- Allow quick checks such as `failed` and `restart` without opening local logs.

## Implemented

- `/events` received an optional `status` string option.
- `readOperatorEvents` can filter by event kind and normalized public-safe status text.
- Status filtering is substring-based after the same safe token normalization used when writing events.
- Help, README, SETUP, release checklist, state, and changelog now document the new filter.

## Validation

- Focused tests cover command wiring and status matching.
- Full repo validation and secret scan were run before commit.

## Notes

- `operator-events.log` remains ignored runtime state.
- The filter reads only already public-safe event lines matching the strict event format.
