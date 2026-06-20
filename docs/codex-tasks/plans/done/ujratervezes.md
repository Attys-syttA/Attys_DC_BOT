# Ujratervezes

Status: done / baseline accepted

## Elkeszult reszek

- Local-first Discord-Codex alaparchitektura mukodik ugyanazon a Windows gepen.
- Public-safe `.env` modell es ignore policy ervenyben van.
- CI, lint, build, test, SQLite check, GitGuardian/ggshield es Dependabot be van kotve.
- Canonical slash command keszlet mukodo alapja elkeszult.
- Magyar `/help` es `/sugo` elerheto.
- `/doctor`, `/mappings`, `/unregister channel:` es mapping cleanup gombok segitik a regi forum/thread mappingek kezeleset.
- Bot notification az aktualis repo text csatornara megy, nem kulon direkt csatornara.
- A lokalis SQLite mapping audit szerint jelenleg nincs duplikalt project path csoport, igy nincs azonnali legacy forum/thread mapping torlesi dontes.
- A Discord guildben a canonical 19 slash command regisztralva van, hianyzo vagy extra parancs nelkul.
- A 2026-06-20-as baseline validacio zold: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run check`, `git diff --check`, `ggshield secret scan path --recursive --yes --use-gitignore .`.

## Lezarasi allapot

- Legacy forum/thread mappingeknel jelenleg nincs torlendo duplikatum; ujabb dontes csak akkor kell, ha kesobb uj duplikalt mapping jelenik meg.
- Tovabbi operator UX fejlesztesek future-workkent kezelendok, ha a control center baseline-t a user elfogadja.
- A fo ujratervezesi terv `done` ala kerulhet, mert a bot mukodesi baseline-t a user 2026-06-20-an lezartnak tekintette.

## Aktualis vegrehajtasi allapot - 2026-06-20

- Runtime kapu: Serena, Filesystem, `ai_tools_local` es Obsidian valos MCP hivasokkal elerheto volt.
- Bot kapu: a `win-start.bat` inditasi uzenetet adott, de a sajat `--status` ellenorzese nem latta megbizhatoan a folyamatot. A bot vegul kozvetlen `node dist/index.js` hatterinditassal futott, bejelentkezett, es regisztralta a slash commandokat.
- Mapping audit: a lokalis SQLite allapotban 4 project mapping van, mindegyik kulon project pathra mutat; `DUPLICATE_GROUPS=0`. Az aktualis `Attys_DC_BOT` channel mapping megvan es idle session allapot tartozik hozza.
- Operator UX audit: a Discord guild command listaja pontosan ezt a 19 parancsot tartalmazza: `/ask`, `/auto-approve`, `/clear-sessions`, `/dashboard`, `/doctor`, `/git-status`, `/help`, `/last`, `/mappings`, `/queue`, `/register`, `/run-tests`, `/session`, `/sessions`, `/status`, `/stop`, `/sugo`, `/unregister`, `/usage`.
- Feature gate allapot: message prompts off, run-tests off, session delete off, auto-approve explicit env engedellyel on, command registration on.
- Validacio: a teljes helyi validacios sor es a GitGuardian secret scan sikeres volt.
- Lezaras: a user 2026-06-20-an megerositette, hogy a bot mukodesi baseline kesz.

## Reszletes folytatasi terv

Ez a harom szakasz egymasra epul. A vegrehajtas soran csak akkor kell megallni,
ha emberi operatori dontes kell, vagy ha az adott szakasz es az ahhoz tartozo
ellenorzes teljesen kesz. Ha egy szakasz emberi dontesnel all meg, a kovetkezo
szakasz csak a dontes es a szukseges Discord oldali lepesek utan indulhat.

### 0. Inditasi kapu minden folytatas elott

1. Ellenorizni kell, hogy az MCP/Serena es Filesystem toolok valaszolnak-e.
   Legalabb ezek legyenek sikeresek: Serena current config, Filesystem allowed
   directories, `ai_tools_local`, es Obsidian, ha a sessionben elerheto.
2. A repo allapotat rogzitani kell `git status --short --branch` paranccsal.
   Ha varatlan, nem ehhez a tervhez tartozo modositas van, azt nem szabad
   felulirni.
3. A botot a fajlmodositasok elott el kell inditani vagy ellenorizni kell, hogy
   fut:
   - `win-start.bat --status`
   - ha stale lock gyanus, elobb `win-start.bat --stop`, utana uj status
   - inditas: `win-start.bat`
   - ellenorzes: process lista, `.bot.lock`, es `bot.log`, ha letrejott
4. A `DISCORD_NOTIFICATION_CHANNEL_ID` a helyi `.env`-ben mar a kert operatori
   csatornara mutasson. Trackelt fajlba nem kerulhet valos token, guild ID,
   user ID vagy channel ID.
5. Ha a bot nem indul, vagy startup notification hiba latszik, a vegrehajtas
   alljon meg emberi beavatkozasra. Ilyenkor a tervfajlt meg nem kell tovabb
   modositani, mert a runtime kapu nem teljesult.

### 1. Legacy forum/thread mapping cleanup lezartasa

Cel: a regi forum/thread eredetu channel-project mappingekrol legyen tiszta
operatori dontes, es csak a tenylegesen felesleges lokalis SQLite mappingek
torlodjenek. Discord csatornat, threadet, uzenetet vagy szerver oldali
objektumot ez a szakasz nem torolhet.

1. Audit elokeszitese:
   - futtasd le Discordon a `/doctor` parancsot az aktualis repo
     munkacsatornaban;
   - futtasd le a `/mappings` parancsot;
   - jegyezd fel, hany mapping van osszesen, hany duplikalt project path
     csoport van, es melyik bejegyzes kap `current` jelolest;
   - ha szukseges, a lokalis SQLite allapotot read-only modon ellenorizd, de
     tokeneket vagy valos szemelyes adatokat ne irj ki.
2. Duplikatumok ertelmezese:
   - az aktualis munkacsatorna mappingje nem torolheto gombos cleanup soran;
   - minden olyan mapping, amely ugyanarra a project pathra mutat, de nem
     aktualis munkacsatorna, legacy jeloltkent kezelendo;
   - ha a duplikatum egy ma is hasznalt Discord csatorna vagy thread lehet,
     allj meg operatori dontesre.
3. Operatori dontesi pont:
   - meg kell kerdezni, mely regi channel/thread mappingek torolhetok;
   - dontes nelkul tilos olyan mappinget torolni, amelyrol nem egyertelmu, hogy
     legacy maradvany;
   - a dontesnek eleg konkretnek kell lennie: channel mention, `/mappings`
     sorszamos Remove gomb, vagy `/unregister channel:` cel.
4. Cleanup vegrehajtasa a dontes utan:
   - preferalt ut: `/mappings` Remove gomb a duplikalt, nem aktualis
     bejegyzesekhez;
   - alternativ ut: `/unregister channel:` a kivalasztott regi channel vagy
     thread mappingre;
   - mindket ut csak lokalis mappinget es kapcsolodo session state-et torolhet;
   - torles utan ujra kell futtatni a `/mappings` parancsot.
5. Elfogadasi feltetelek:
   - az aktualis munkacsatorna mappingje megmaradt;
   - nincs varatlan duplikalt project path csoport;
   - `/doctor` nem jelez regi forum/thread mapping gyanut az aktualis projectre;
   - ha maradt duplikatum, mindegyikhez legyen rogzitetten emberi dontes, hogy
     szandekosan marad.
6. Szakasz kimenete:
   - ha minden tiszta, a tervben a legacy mapping cleanup sor `operatori
     dontesre var` allapotbol `lezarhato` allapotra valthat;
   - ha dontes kell, a vegrehajtas itt all meg, es Discordon jelezni kell, hogy
     emberi beavatkozas szukseges.

### 2. Operator UX baseline elfogadasa

Cel: az operator a jelenlegi control center felulettel kulon fejlesztes nelkul
tudja inditani, kovetni, megallitani, sorba rakni es ellenorizni a Codex munkat.
Ez a szakasz nem uj feature lista, hanem elfogadasi es hianyfeltarasi kor.

1. Read-only parancsaudit:
   - `/dashboard`: mutassa a regisztralt projectet, session allapotot,
     runtime allapotot, queue meretet, auto-approve allapotot es Codex commandot;
   - `/sessions`: listazza a helyi Codex sessionoket, ha a helyi Codex ezt
     tamogatja;
   - `/session current`: mutassa az aktualisan kivalasztott sessiont;
   - `/last`: mutassa az utolso session vagy valasz informaciot, ha van;
   - `/git-status`: adjon gyors repo allapotot az aktualis projecthez;
   - `/help` es `/sugo`: magyar operatori segitseget adjon a parancsokhoz;
   - `/doctor`: maradjon a runtime readiness fo ellenorzese.
2. Kontroll parancsok auditja:
   - `/session new`: kovetkezo prompt uj Codex sessiont inditson;
   - `/session stop` es `/stop`: aktiv turn megallitasara legyen hasznalhato;
   - `/queue list`: mutassa a varakozo uzeneteket;
   - `/queue remove`: egyetlen varakozo elemet tavolitson el;
   - `/queue clear`: teljes varakozo sort uritson;
   - normal Discord uzenetbol prompt inditas csak akkor legyen elvart, ha
     `DISCORD_ENABLE_MESSAGE_PROMPTS=true` es a Discord Developer Portalban a
     Message Content intent is engedelyezett.
3. Feature-gated parancsok auditja:
   - `/run-tests` csak `DISCORD_ENABLE_RUN_TESTS=true` mellett indithat lokalis
     test parancsot;
   - `/auto-approve` csak `DISCORD_ENABLE_AUTO_APPROVE=true` mellett kapcsolhat
     be jovahagyas-megkerulest, kikapcsolasa viszont maradjon biztonsagos;
   - `/clear-sessions` es session delete csak
     `DISCORD_ENABLE_SESSION_DELETE=true` mellett torolhat lokalis session
     allapotot;
   - ha ezek nincsenek engedelyezve, az operatori UX akkor is legyen ertheto:
     a bot mondja meg, melyik env flag kell.
4. Hianyfeltaras:
   - ha a parancsokkal a teljes operatori alapfolyamat elvegezheto, nem kell uj
     UX fejlesztes;
   - ha az operator nem tud egyertelmuen donteni, mit csinaljon, akkor a hiany
     dokumentacios vagy help-szoveg hiba;
   - ha a folyamat csak uj gombbal, uj parancsval, uj jogosultsagi modellel vagy
     uj adatmezovel lenne elfogadhato, a vegrehajtas alljon meg emberi
     dontesre, mert ez mar uj implementacios scope.
5. Elfogadasi feltetelek:
   - az aktualis repo csatorna regisztralt es hasznalhato;
   - a dashboard egyertelmu control centerkent mukodik;
   - a session, queue, stop, git-status es help parancsok operatori szinten
     erthetoek;
   - minden veszelyesebb parancs env flag mogott marad;
   - nincs olyan kritikus UX hiany, amely a baseline lezarat akadalyozza.
6. Szakasz kimenete:
   - ha elfogadhato, a tervben a tovabbi operator UX sor `nyitott` allapotbol
     `baseline elfogadhato, future work opcionális` allapotra valthat;
   - ha uj UX igeny kell, a vegrehajtas itt all meg, es az uj igenyt kulon
     tervkent kell felvenni, nem ebbe a baseline-le zarasba belekeverni.

### 3. Fo ujratervezesi terv lezarasa

Cel: az `ujratervezes.md` csak akkor keruljon `done` ala, ha a local-first
Discord-Codex mukodesi baseline valoban elfogadott. Ez a szakasz nem kezdheto
el addig, amig az 1. es 2. szakasz nincs kesz vagy explicit user altal
elfogadva.

1. Elokeszitesi feltetelek:
   - legacy mapping cleanup vagy kesz, vagy dokumentalt operatori dontes alapjan
     szandekosan maradt nyitva;
   - operator UX baseline elfogadott, vagy a maradek igenyek future-workkent
     kulon vannak valasztva;
   - nincs folyamatban olyan bot runtime hiba, amely a baseline-t
     ervenytelenitene.
2. Dokumentacios lezaras:
   - az `Elkeszult reszek` lista keruljon osszhangba a tenylegesen elfogadott
     baseline-nal;
   - a `Nyitott reszek` csak future-work vagy explicit operatori dontesre varo
     pontot tartalmazzon;
   - ha minden baseline pont kesz, a terv fajlmozgatasra jelolheto:
     `docs/codex-tasks/plans/pending/active/ujratervezes.md` ->
     `docs/codex-tasks/plans/done/ujratervezes.md`;
   - fajlmozgatas csak explicit user acceptance utan tortenhet.
3. Validacios sor:
   - `git status --short --branch`
   - `git diff --check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `npm run check`
   - `ggshield secret scan path --recursive --yes --use-gitignore .`
4. Secret scan fallback:
   - ha `ggshield` nem erheto el, manualis scan kell legalabb ezekre:
     token/API key mintak, password/secret/webhook mintak, privat vagy szemelyes
     IP/host/path mintak, valos Discord ID mintak, remote execution vagy worker
     config maradvanyok;
   - fallback eseten a vegso osszefoglaloban egyertelmuen jelezni kell, hogy a
     GitGuardian scan nem futott.
5. Elfogadasi feltetelek:
   - minden validacio zold, vagy a nem futtathato ellenorzes oka dokumentalt;
   - nincs trackelt `.env`, runtime SQLite, log, token, valos Discord ID vagy
     privat gepadat;
   - a user kimondja, hogy a bot mukodesi baseline lezart;
   - csak ezutan kerulhet a terv `done` ala.
6. Szakasz kimenete:
   - kesz baseline es user acceptance eseten a terv mozgathato `done` ala;
   - acceptance nelkul a terv marad `pending/active` alatt, de a reszletes
     lezarasi feltetelek alapjan a kovetkezo session egyertelmuen tudja, hol
     kell folytatni.

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
- `/mappings`
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
A `/unregister` opcionális channel targetet is elfogadhat, hogy regi forum/thread
mappingek az aktualis operatori csatornabol is takarithatok legyenek.
A `/mappings` read-only attekintest adjon a channel-project mappingekrol, es
kulon jelezze a duplikalt local project path csoportokat.
Duplikalt mappingeknel a `/mappings` adhat Remove gombokat, amelyek csak a
lokalis SQLite mappinget es a kapcsolodo session allapotot torlik, Discord
csatornat vagy uzenetet nem torolnek.
A gombos cleanup ne ajanljon egykattintasos torlest az aktualis munkacsatornara;
azt `current` jelolessel mutassa, es a kezi `/unregister channel:` maradjon
az explicit operatori escape hatch.

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
