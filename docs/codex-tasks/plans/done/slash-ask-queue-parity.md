Status: done / slash ask queue parity

# Slash ask queue parity

## Goal

- A `/ask` slash flow ugyanugy viselkedjen aktiv Codex futas alatt, mint a normal message prompt.
- Ne indulhasson veletlenul masodik parhuzamos Codex turn ugyanabban a Discord channelben.
- A frissen hozzaadott slash attachment promptok is queue-confirm alá essenek.

## Implemented

- A `/ask` ellenorzi, hogy az adott channelben aktiv-e Codex futas.
- Aktiv futas eseten pending queue promptot allit be es Add to Queue / Cancel gombokat ad.
- Meglevo pending queue confirmation eseten nem irja felul a varakozo promptot.
- Teli queue eseten kezelt operatori uzenetet ad.

## Validation

- Celzott tesztek:
  - `npm test -- --run src/bot/commands/ask.test.ts src/bot/handlers/message.test.ts`
- Teljes validacio a commit elott:
  - `npm run check`
  - `git diff --check`
  - `ggshield secret scan path --recursive --yes --use-gitignore .`

