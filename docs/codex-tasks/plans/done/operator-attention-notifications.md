Status: done / operator attention notifications

## Cel

- Ha Codex emberi beavatkozast ker, az operator ne csak az aktiv project csatornaban lassa a kartyat.
- A kozponti notification channel kapjon rovid, public-safe jelzest approval es Codex question varakozasnal.

## Elkeszult reszek

- Bekerult a `buildOperatorAttentionNotification` es `sendOperatorAttentionNotification` helper.
- Approval varakozasnal a bot best-effort jelzest kuld a `DISCORD_NOTIFICATION_CHANNEL_ID` csatornaba.
- Codex question varakozasnal ugyanilyen best-effort jelzes megy.
- Ha a notification channel ugyanaz, mint az aktiv project channel, a bot nem kuld duplikalt figyelmeztetest.
- A notification szoveg whitelistelt action nevet hasznal:
  - `tool approval`
  - `Codex question`
- A helper nem ir ki tokent, lokalis pathot vagy config erteket.

## Validacio

- Targeted tests:
  - `npm test -- --run src/bot/notifications.test.ts src/codex/session-manager.test.ts`
- Teljes validacio:
  - `npm run check`
  - `git diff --check`
  - `ggshield secret scan path --recursive --yes --use-gitignore .`

## Nyitott reszek

- Ha kesobb tobb gep vagy tobb bot fut ugyanazon Discord szerveren, a notification szovegbe erdemes public-safe gepnevet vagy bot instance labelt tenni.
