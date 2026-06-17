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
