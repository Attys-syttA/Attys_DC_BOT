Status: done / last response rollout fallback

# Last response rollout fallback

## Goal

- A `/last` legyen hasznalhato akkor is, ha a live Codex app-server thread olvasas eppen nem elerheto.
- A referencia vonalat kovetve hasznaljuk a helyi Codex rollout JSONL logokat is read-only fallbackkent.
- Ne kelljen VS Code vagy desktop panel ahhoz, hogy az utolso ismert assistant valasz visszanezheto legyen.

## Implemented

- A `/last` eloszor tovabbra is `codexAppServer.readThread` alapjan olvas.
- Ha a live olvasas hibazik vagy nem talal assistant valaszt, a helyi stored thread `rollout_path` JSONL fajljabol probal fallbacket.
- Bekerult celzott `/last` teszt live sikerre, live hiba utani fallbackre es ures allapotra.

## Safety

- A fallback read-only.
- Hiba eseten nem ir ki nyers app-server hibat Discordra.
- A log path nem jelenik meg Discord valaszban.

## Validation

- Celzott teszt:
  - `npm test -- --run src/bot/commands/last.test.ts src/bot/commands/sessions.test.ts`
- Teljes validacio a commit elott:
  - `npm run check`
  - `git diff --check`
  - `ggshield secret scan path --recursive --yes --use-gitignore .`

