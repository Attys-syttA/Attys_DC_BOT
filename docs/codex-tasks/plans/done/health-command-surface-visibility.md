Status: done / health command surface visibility

# Health command surface visibility

## Goal

- Tavoli restart vagy command registration utan Discordbol is latszodjon, mekkora parancsfeluletet ismer a bot.
- A `/health` adjon gyors sanity checket a slash command surface-rol Discord API hivas nelkul.

## Implemented

- A `/health` riport uj sora: `slash command surface`.
- Az ertek a helyi help registry ismert parancsainak darabszama.
- A riport tovabbra sem olvas vagy ir ki privat config ertekeket.

## Validation

- Celzott teszt:
  - `npm test -- --run src/bot/commands/health.test.ts`
- Teljes validacio a commit elott:
  - `npm run check`
  - `git diff --check`
  - `ggshield secret scan path --recursive --yes --use-gitignore .`

