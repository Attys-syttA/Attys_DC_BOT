Status: done / logs filtering

# Logs filtering

## Goal

- Tavoli operatori hibakeresesnel ne kelljen mindig a teljes log tailt olvasni.
- A `/logs` maradjon read-only es public-safe.
- A szures ne tudjon nyers privat adatot visszajuttatni Discordra.

## Implemented

- A `/logs` uj opcionális `contains` parametert kapott.
- A szures a mar scrubbolt, public-safe sorokon fut.
- A valasz header jelzi, ha filter aktiv.

## Safety

- Tovabbra is csak allowlisted repo-lokalis logforrasokat olvas.
- A path/raw ID/IP/secret-szeru ertek scrubolas a filter elott tortenik.
- Hianyzo vagy ures talalat kezelt operatori uzenetet ad.

## Validation

- Celzott teszt:
  - `npm test -- --run src/bot/commands/logs.test.ts`
- Teljes validacio a commit elott:
  - `npm run check`
  - `git diff --check`
  - `ggshield secret scan path --recursive --yes --use-gitignore .`

