Status: done / slash ask attachment parity

# Slash ask attachment parity

## Goal

- A slash-only uzemmodban is lehessen fajlt vagy kepet adni a Codex prompt mellé.
- A message prompt es slash prompt ugyanazt az attachment sanitize/download logikat hasznalja.
- Discord valaszban ne jelenjen meg a lokalis mentett fajl pathja.

## Implemented

- Bekerult a kozos `src/bot/attachments.ts` helper.
- A message handler a kozos attachment helperre valtott.
- A `/ask` opcionális `file` attachment opciot kapott.
- Letoltott attachment eseten a Codex prompt kapja meg a lokalis fajlreferenciat.
- A Discord visszaigazolas csak a safe fajlnevet mutatja, nem a lokalis pathot.

## Safety

- A korabbi veszelyes kiterjesztes tiltasa es 25 MB limit megmaradt.
- A fajlnev sanitize kozosen ervenyesul message es slash flow alatt.
- A `.codex-uploads` runtime mappa tovabbra is ignored.

## Validation

- Celzott tesztek:
  - `npm test -- --run src/bot/attachments.test.ts src/bot/commands/ask.test.ts src/bot/handlers/message.test.ts`
- Teljes validacio a commit elott:
  - `npm run check`
  - `git diff --check`
  - `ggshield secret scan path --recursive --yes --use-gitignore .`

