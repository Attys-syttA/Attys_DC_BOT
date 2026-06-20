Status: done / Codex user-input routing and dashboard visibility

## Cel

- A Codex app-server `requestUserInput` flow Discordon megbizhatoan kezelje a sajat szoveges valaszt is.
- Az operator lassa a `/dashboard` nezetben, ha a bot approvalra, Codex kerdesre, custom answerre vagy queue confirmationre var.

## Elkeszult reszek

- `SessionManager.enableCustomInput` mar az aktualis pending Codex question id-t hasznalja.
- A custom typed answer nem fix `answer` kulcs ala kerul, hanem az aktiv `question.id` ala.
- Slash-only modban a pending custom answer atmegy a message handleren, de a normal message prompt tovabbra is tiltva marad.
- Bekerult a `getOperatorRuntimeSnapshot(channelId)` read-only runtime allapot.
- A `/dashboard` `Controls` blokkja mutatja a pending operator action allapotot:
  - `none`
  - `approval`
  - `question`
  - `custom answer`
  - `queue confirmation`
- A Discord interaction handler teszteli az `ask-other` gombot.
- A session manager teszteli, hogy a custom typed answer a helyes Codex question id-vel oldodik fel.

## Validacio

- Targeted tests:
  - `npm test -- --run src/codex/session-manager.test.ts src/bot/commands/dashboard.test.ts`
  - `npm test -- --run src/bot/handlers/message.test.ts`
  - `npm test -- --run src/bot/handlers/interaction.test.ts`
- Teljes validacio:
  - `npm run check`
  - `git diff --check`
  - `ggshield secret scan path --recursive --yes --use-gitignore .`

## Nyitott reszek

- Ha a gyakorlatban tobbparancsos vagy tobbkerdeses Codex input flow mas payload formatumot hasznal, kulon compatibility teszt kell ra.
- A mostani dashboard read-only; kulon parancs csak akkor kell, ha a pending operator action onallo kezelofeluletet igenyel.
