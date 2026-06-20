Status: done / Windows installer hardening implemented

## Cel

- A referencia repo Windows telepitesi vonalat kovetve a mi Windows-first installerunk legyen stabilabb es public-safe.
- Ne hivatkozzon olyan public assetre, amely nincs trackelve.
- Node telepites vagy upgrade utan a script a repo gyokerbol induljon ujra.

## Elkeszult reszek

- `install.bat` a script elejen beallitja a `SCRIPT_DIR` valtozot, mielott barmelyik restart-ag hasznalna.
- A lepesek szamozasa a tenyleges 6 fazishoz igazodik.
- A desktop shortcut Attys DC BOT brandinget kapott.
- A shortcut ikon fallback sorrendje:
  - `tray\CodexBotTray.exe`
  - `CodexBot.exe`
  - Windows system icon
- A Codex login next-step Windows-kompatibilis `codex.cmd login` szoveget hasznal.
- README es SETUP dokumentalja az installer hasznalatat es a shortcut ikon fallback viselkedest.

## Validacios terv

- `cmd /c win-start.bat --status`
- `npm run plans:check`
- `git diff --check`
- `npm run check`
- `ggshield secret scan path --recursive --yes --use-gitignore .`

## Nyitott reszek

- Teljes `install.bat` vegigfuttatas csak friss gepen vagy explicit installer acceptance soran indokolt, mert dependencia telepitest es shortcut letrehozast vegez.
