Status: done / approval public-safety hardening

# Approval public-safety hardening

## Goal

- Keep the useful chadingTV-style Codex approval UX.
- Avoid leaking private paths, raw IDs, IPs, or secret-looking values into Discord approval cards.
- Apply the same safety rule to failed-turn error text before it is edited into the project channel.

## Implemented

- Added shared `sanitizePublicText` and `sanitizePublicFileLabel` helpers.
- Reused the shared sanitizer in `/logs` to keep log scrubbing consistent.
- Scrubbed approval card fields:
  - file labels;
  - command previews;
  - command descriptions;
  - diff previews;
  - write content previews;
  - generic tool JSON previews.
- Scrubbed failed Codex turn error text before posting it to Discord.

## Validation

- Output formatter tests cover path and secret masking.
- Session manager tests cover failed-turn error masking.
- Full repo validation and secret scan were run before commit.

## Notes

- The sanitizer keeps short operator context while removing local private details.
- This does not change Codex execution input or local logs; it only changes Discord-visible display text.
