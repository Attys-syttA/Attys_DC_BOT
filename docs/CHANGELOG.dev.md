# Development Changelog

## 2026-06-17

- Cel: Az `Attys_DC_BOT` mappat local-first Discord-Codex bot iranyba elinditani.
- Kiindulas: A lokalis `Attys_DC_BOT` nem volt git repo, csak dokumentacios skeleton es helyi `.env` volt benne. A cel remote: `Attys-syttA/Attys_DC_BOT`.
- Audit: A regi Discord-Codex referenciak hasznos TypeScript/Discord/SQLite elemeket tartalmaznak, de remote-execution iranyuak. A `chadingTV/codex-discord` local-first mintaja jobban illeszkedik az uj celhoz.
- Valtozas: Bekerult egy local Codex app-serveres TypeScript alap, Windows-focused README/SETUP, local-first `AGENTS.md`, local-first `.env.example`, szigorubb `.gitignore`, es frissitett package metadata/script keszlet.
- Eredmeny: A projekt iranya most local-first: Discord -> helyi bot -> helyi Codex CLI/app-server -> helyi projektek -> SQLite mapping.
- Nyitott follow-up: teljes validacio, command-set veglegesites, tesztek kiegeszitese, git inicializalas/remote osszefesules review utan. `git push` nem tortent.
- ChadingTV alignment: bekerult a `/ask`, `/doctor`, `/git-status`, es env-gated `/run-tests`; a Discord application ID kulon env kulcs lett; az attachment filename kezeles sanitize-olva lett `.codex-uploads/` mentes elott.
- Discord control center: bekerult a `/dashboard`, amely a regisztralt channel helyi Codex allapotat, queue meretet es biztonsagos vezerlogombjait mutatja.
- Repo hygiene: bekerult a GitHub Actions CI, SQLite check, GitGuardian/ggshield secret scan, Dependabot, SECURITY.md, ESLint lint script es `.cache_ggshield/` ignore.
- Command tests: bekerult celzott Vitest lefedes a `/ask`, `/dashboard`, `/doctor`, es `/run-tests` parancsokra, kulon figyelve arra, hogy a diagnosztika ne irjon ki config ertekeket.
- Command tests folytatas: bekerult a `/git-status` tesztlefedese regisztralatlan channelre, normal git statusra es timeout jelzesre.
- Interaction tests: bekerult a Discord button/select handler celzott lefedese authorization, stop, queue confirm, approval, uj session es ask-select flow-ra.
- Dependency refresh: frissult a `tsx`, `zod`, `dotenv`, es `@types/node` a jelenlegi major agon belul; `npm run check`, `ggshield`, es audit zold.
- Operator controls: bekerult a `/session current/new/stop` es a `/queue remove <number>`, celzott Vitest lefedessel.
- Auto-approve safety: a `/auto-approve on` es a session-wide automatikus jovahagyas explicit `DISCORD_ENABLE_AUTO_APPROVE=true` env flag moge kerult; kikapcsolni tovabbra is lehet flag nelkul.
- Session delete safety: a `/clear-sessions` es az egyedi session delete gomb explicit `DISCORD_ENABLE_SESSION_DELETE=true` env flag moge kerult.
- Usage command: a `/usage` canonical local-first parancs lett, live Codex rate-limit olvasassal es cache fallback tesztlefedessel.
- Session select hardening: ha a kivalasztott Codex thread olvasasa hibazik, a Discord handler kezelt hiba-uzenetet ad vissza.
- CI fix: az attachment filename sanitize OS-fuggetlen lett, mert Linux CI alatt a backslash nem `path.basename` separator.
- Local preflight: bekerult az `npm run doctor:local`, amely Discord bot inditas es titokkiiras nelkul ellenorzi a configot, SQLite initet, Codex CLI-t es `codex login status`-t.
- Discord intents: a bot csak akkor ker `GuildMessages` es `MessageContent` intentet, ha `DISCORD_ENABLE_MESSAGE_PROMPTS=true`; slash command uzemhez eleg a `Guilds` intent.
- Prompt visibility: a `/ask` visszaigazolo uzenet most a konkret prompt szoveget is megmutatja roviditett, Discord-safe code blockban.
- Help command: bekerult a magyar `/help` es `/sugo`, rovid parancslistaval es `parancs` opcional keresztuli reszletes leirassal.
- Doctor diagnostics: a `/doctor` most jelzi, hogy message prompt mod aktiv-e, es figyelmeztet a Discord Message Content intent szuksegessegre.
- Startup notification: opcionális `DISCORD_NOTIFICATION_CHANNEL_ID` kulcs kerult be, amellyel a bot public-safe indulasi statuszt kuldhet egy operatori Discord csatornaba.
- Mapping diagnostics: a `/doctor` most jelzi, ha ugyanahhoz a local project path-hoz tobb Discord channel mapping tartozik, peldaul regi forum/thread maradvany miatt.
- Legacy mapping cleanup: a `/unregister` opcionális `channel` argumentumot kapott, igy az aktualis operatori csatornabol is torolheto regi forum/thread mapping.
- Mapping overview: bekerult a read-only `/mappings`, amely listazza a project-channel mappingeket, elore sorolja a duplikalt local project path-okat, es a `/unregister channel:` takaritasi iranyt jelzi.
