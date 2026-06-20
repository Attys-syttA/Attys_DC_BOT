# Operator visibility rollup

Status: done

## Goal

Make the remote Discord control surface easier to use away from the Windows desktop by rolling the most important operator state into existing commands.

## Implemented

- `/dashboard` shows the three latest public-safe operator events, newest first.
- `/health` shows the latest public-safe operator event in the runtime report.
- `/status` shows per-channel runtime activity, queue size, and pending operator action state.
- `operator-events` gained a display helper that strips timestamps only after validating the log line format.

## Safety Rules

- Recent events are read from the existing public-safe `operator-events.log` reader.
- Invalid or private-looking event lines display as `unknown` instead of being echoed.
- Full local project paths remain hidden behind public-safe labels.
- No prompt text, raw config values, token-like strings, or raw local paths are added to these rollups.

## Validation

- Focused tests cover `/dashboard`, `/status`, `/health`, and operator event display formatting.
- Full repository validation is required before commit:
  - `npm run check`
  - `git diff --check`
  - `ggshield secret scan path --recursive --yes --use-gitignore .`
