# Discord_Codex_BOT NAS staging

Ez a mappa a Synology NAS-on levo `Discord_Codex_BOT` megosztott mappa belso elrendezesenek sablonja.

Masolasi szabaly:

- a `nas-staging\Discord_Codex_BOT` mappa tartalmat kell majd a NAS `Discord_Codex_BOT` megosztott mappajanak gyokerebe masolni;
- ne masold a teljes helyi repot a NAS-ra;
- ne masolj `.env`, Codex auth state, Git credential, `node_modules`, `dist`, log, SQLite runtime state vagy helyi cache fajlt;
- valos ertekeket csak a NAS-on letrehozott, nem verziozott `.env.nas` fajlba irj.
- ha a regi NAS archive-bol szarmazo `.env.nas` megvan, azt csak a NAS-on, operatori helyi titokfajlkent hasznald ujra; ne masold Gitbe es ne kuldd vissza logba.
- a runtime fallbackkent erti a regi `DISCORD_TOKEN`, `DISCORD_ALLOWED_USER_IDS` es `DISCORD_ALLOWED_ROLE_IDS` neveket, ha az uj nevek nincsenek megadva.

Jelenlegi szelet:

- ez meg csak NAS control-plane staging alap;
- az `ATTYS_NAS_WORKERS_JSON` mar a kesobbi PC worker celpontokat irja le public-safe modon;
- a `data/handoff` mappa publikus, fajlalapu inbox/outbox/archive atadast keszit elo;
- nincs NAS oldali Codex futtatas;
- nincs Windows workspace kozvetlen NAS filesystem hasznalat;
- nincs VS Code shim;
- nincs repair, named check vagy audit futtatas.

A NAS oldali mappa celja kesobb az lesz, hogy a 24/7 control-plane elemek egy helyen legyenek, mikozben a Windows gep marad a Codex worker.

Archive reuse:

- az `E:\NAS_Archivumok\Discord_Codex_BOT.zip` ARM-korszakos csomag hasznalhato referenciaforraskent;
- a benne levo ARM64 Docker image nem a mostani AMD64/Ryzen NAS celartifactja;
- a benne levo worker/bridge contract mintakbol csak audit utan, kis szeletekben szabad atvenni.
