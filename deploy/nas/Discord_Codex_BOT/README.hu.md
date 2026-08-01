# Discord_Codex_BOT NAS staging

Ez a mappa a Synology NAS-on levo `Discord_Codex_BOT` megosztott mappa belso elrendezesenek sablonja.

Masolasi szabaly:

- a `nas-staging\Discord_Codex_BOT` mappa tartalmat kell majd a NAS `Discord_Codex_BOT` megosztott mappajanak gyokerebe masolni;
- ne masold a teljes helyi repot a NAS-ra;
- ne masolj `.env`, Codex auth state, Git credential, `node_modules`, `dist`, log, SQLite runtime state vagy helyi cache fajlt;
- valos ertekeket csak a NAS-on letrehozott, nem verziozott `.env.nas` fajlba irj.

Jelenlegi szelet:

- ez meg csak NAS control-plane staging alap;
- nincs NAS oldali Codex futtatas;
- nincs Windows workspace kozvetlen NAS filesystem hasznalat;
- nincs VS Code shim;
- nincs repair, named check vagy audit futtatas.

A NAS oldali mappa celja kesobb az lesz, hogy a 24/7 control-plane elemek egy helyen legyenek, mikozben a Windows gep marad a Codex worker.
