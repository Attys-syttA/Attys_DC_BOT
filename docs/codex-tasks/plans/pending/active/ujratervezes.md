# Ujratervezes

Status: active public-safe redesign plan

## Cel

Az `Attys_DC_BOT` egy local-first Discord-Codex bot legyen, amely ugyanazon a Windows gepen fut, ahol a Codex CLI, a `codex login` allapot es a helyi projektek is elerhetok.

A cel nem uj termek nullarol. A korabbi Discord bot kod hasznos TypeScript, Discord, SQLite es operator-flow reszeit konzervativan meg kell tartani, de a remote execution / multi-machine iranyt ki kell venni.

## Elsodleges Referencia

A `chadingTV/codex-discord` local-first vonala ervenyesuljon:

- self-hosted Discord bot;
- a bot ugyanazon a gepen fusson, mint a Codex CLI;
- normal hasznalatban a helyi `codex login` session legyen az alap;
- ne kelljen `OPENAI_API_KEY` a normal mukodeshez;
- egy Discord channel egy helyi projektmappahoz rendelheto;
- helyi Codex app-server / CLI kapcsolatot hasznaljon;
- helyi Codex thread/session allapotot tudjon listazni, ha a helyi Codex tamogatja;
- SQLite tarolja a channel-project/session mappinget;
- legyen allowed-user es optional allowed-role ellenorzes;
- legyen rate limit;
- legyen path validation;
- attachment kezeles csak biztonsagosan tortenhet;
- futtathato vagy veszelyes attachment tipusok tiltandok.

Fontos elteres: a multi-machine uzemmod itt nem cel. A referencia repobol csak a same-machine, local-first elveket es mintakat szabad atvenni.

## Tiltott Iranyok

Nem lehet celarchitektura:

```text
Discord
  -> remote bridge
  -> custom HTTP execution worker
  -> masik gep
  -> halozati megosztas vagy hordozhato adathordozo
  -> tobbgepes allapotmegosztas
```

Nem maradhat szukseges futasi elem:

- remote execution bridge;
- custom HTTP execution agent;
- multi-machine state sharing;
- network-share based workflow;
- portable-drive workflow;
- worker shared secret;
- worker inventory;
- Docker/remote build elvaras a normal botfutashoz;
- gepnev, privat IP, publikus szemelyes IP, email cim, token vagy valos Discord ID trackelt fajlban.

## Celarchitektura

```text
Discord
  -> discord.js bot
  -> local Codex session manager / app-server client
  -> local Codex CLI login state
  -> local project folders under BASE_PROJECT_DIR
  -> local SQLite mapping state
```

## Public Repo Biztonsag

Trackelt fajlban nem lehet:

- Discord bot token;
- OpenAI API key;
- Codex auth state;
- GitHub token;
- email cim;
- valos Discord guild/user/role ID;
- privat hostnev vagy IP;
- Windows user-specific path;
- `.env`;
- runtime SQLite state;
- rollout log;
- upload/cache/runtime mappa;
- webhook URL;
- jelszo, cookie vagy session file.

Minden futashoz szukseges helyi ertek `.env`-be keruljon. A `.env.example` csak ures vagy szintetikus, nem szemelyes placeholdert tartalmazhat.

## Konfiguracio

A public-safe `.env.example` local-first kulcsai:

```text
DISCORD_BOT_TOKEN=
DISCORD_APPLICATION_ID=
DISCORD_GUILD_ID=
DISCORD_NOTIFICATION_CHANNEL_ID=
ALLOWED_USER_IDS=
ALLOWED_ROLE_IDS=
BASE_PROJECT_DIR=C:\workspace
DISCORD_DATABASE_PATH=.discord-bot-state\bridge.sqlite
DISCORD_SESSION_STORE_PATH=.discord-bot-state\sessions.json
RATE_LIMIT_PER_MINUTE=10
DISCORD_QUEUE_MAX_ITEMS=10
DISCORD_ENABLE_MESSAGE_PROMPTS=true
DISCORD_EPHEMERAL_RESPONSES=true
SHOW_COST=false
DISCORD_REGISTER_COMMANDS=false
DISCORD_ENABLE_RUN_TESTS=false
DISCORD_ENABLE_AUTO_APPROVE=false
DISCORD_ENABLE_SESSION_DELETE=false
```

Nem kell es nem lehet normal mukodeshez kotelezo:

- `OPENAI_API_KEY`;
- remote worker URL;
- worker shared secret;
- remote machine ID;
- privat IP vagy hostnev.

## Parancsmodell

Canonical vagy celhoz kozeli parancsok:

- `/register`
- `/unregister`
- `/status`
- `/dashboard`
- `/doctor`
- `/sessions`
- `/session current`
- `/session new`
- `/session stop`
- `/last`
- `/stop`
- `/queue list`
- `/queue clear`
- `/queue remove`
- `/git-status`
- `/help`
- `/sugo`
- `/run-tests`
- `/ask`
- `/usage`

Meglevo optional parancsok, amelyeket kulon el kell donteni:

- `/clear-sessions`

A `/run-tests` csak explicit env engedellyel mukodjon, mert lokalis scriptet indit.
A `/auto-approve` maradhat operatori convenience parancs, de csak explicit
`DISCORD_ENABLE_AUTO_APPROVE=true` mellett kapcsolhato be, mert parancs- es
fajlmodositas-jovahagyast kerul meg.
A `/clear-sessions` es az egyedi session delete csak explicit
`DISCORD_ENABLE_SESSION_DELETE=true` mellett torolhet lokalis Codex sessiont.

## Kodmentesi Szabaly

Korabbi forrasokbol csak szelektiven vehetok at:

- TypeScript / Node.js 20+ projektalap;
- `discord.js` v14 integracio;
- slash command definiciok;
- SQLite state store;
- channel binding;
- session registry;
- queue kezeles;
- approval allapotmodell;
- normal Discord uzenetbol prompt inditas;
- allowed user / role ellenorzes;
- rate limit;
- path normalizalas es validacio;
- attachment safety;
- Vitest tesztek;
- build/typecheck/test scriptek;
- secret scan script, ha nem remote-execution fuggo.

Nem vehetok at olyan reszek, amelyek remote bridge, worker, multi-machine handoff, privat gepnev/IP vagy nem public-safe workflow iranyba visznek.

## Validacio

Minden erdemi implementacios kor utan:

```powershell
git status --short --branch
git diff --check
npm run lint
npm run typecheck
npm test
npm run build
npm run check
ggshield secret scan path --recursive --yes --use-gitignore .
```

Ha `ggshield` nem erheto el, manualis secret-pattern scan kell legalabb ezekre:

- token/API key mintak;
- password/secret/webhook mintak;
- privat vagy szemelyes IP/host/path mintak;
- valos Discord ID mintak;
- remote execution / worker config maradvanyok.

## Munkastilus

- Elobb audit, utana modositas.
- Kis, review-olhato valtozasok.
- Nincs automatikus commit.
- Nincs automatikus push.
- A public repo biztonsaga fontosabb, mint a gyors feature atvetel.
