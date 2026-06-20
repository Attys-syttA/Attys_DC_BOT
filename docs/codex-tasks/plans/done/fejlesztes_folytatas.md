Allapot: done / Windows-first minimum parity implemented

Kapcsolodo jelenlegi helyzet:
- Ez a dokumentum a `chadingTV/codex-discord` atnezese utani Windows-first folytatasi csomag lezart terve.
- A cel nem teljes cross-platform parity volt, hanem a helyi Windows operatori minimum: launcher, tray/control panel, usage panel es public setup/docs.

Elkeszult reszek:
- A `win-start.bat --status` process-detektalasa felismeri a `dist/index.js` es `dist\index.js` formakat is.
- A launcher a bothoz tartozo processzeket repo path + `dist/index.js` alapjan kezeli, es stale `.bot.lock` esetben takarit.
- A background inditas `bot.log` es `bot.err.log` fajlba ir.
- A `tray/CodexBotTray.cs` Windows tray/control panel visszakerult auto-update nelkul.
- A panel tud `Start`, `Stop`, `Restart`, vizualis statuszt, `.env` settings editort, log megnyitast, folder megnyitast es usage refresh/view funkciot.
- A usage panel a `~/.codex/rate-limits-cache.json` cache-t olvassa es Codex app-serveren keresztul frissiti, ha elerheto.
- A public setup docs frissultek Windows launcher/tray/control panel hasznalattal.
- Public-safe illusztracio kerult a docs ala valodi tokenek, ID-k es lokalis pathok nelkul.

Nyitott reszek:
- Teljes Linux/macOS launcher parity nincs ebben a csomagban.
- Auto-update desktop lifecycle nincs ebben a csomagban, mert kulon veszelyes git/lifecycle dontes.
- Ha a Windows gepen hianyzik a C# compiler/.NET build tooling, a tray exe ujraepitese lokalis dependency telepiteseig nem fut le.

# Windows-first minimum parity closeout

## Scope

Ez a csomag a Windows/local-first operatori minimumot zarja:

- launcher/status stabilizalas
- Windows tray/control panel
- Codex usage cache desktop megjelenites
- public setup/docs closeout

## Acceptance

- `cmd /c win-start.bat --status` allapotot helyesen ad allo es futo botnal.
- `cmd /c win-start.bat --stop` csak az ehhez a repohoz tartozo bot processzt allitja le.
- A tray/control panel nem tartalmaz auto-update flow-t.
- A `.env` tovabbra is ignored lokalis fajl.
- A public docs nem tartalmaznak valodi tokeneket, Discord ID-kat vagy privat pathokat.
