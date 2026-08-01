export interface HelpEntry {
  name: string;
  category: "codex" | "sessions" | "repo" | "ops" | "safety";
  usage: string;
  short: string;
  details: string[];
}

export const HELP_ENTRIES: HelpEntry[] = [
  {
    name: "ask",
    category: "codex",
    usage: "/ask prompt: <szoveg> file/file2/file3: <opcionalis>",
    short: "Promptot es opcionális fajlt kuld a csatornahoz rendelt helyi Codex sessionbe.",
    details: [
      "A megadott promptot a regisztralt local project Codex sessionje kapja meg.",
      "A bot visszairja a prompt szoveget, hogy kesobb latszodjon, mire erkezett a valasz.",
      "A `file`, `file2`, `file3` attachmenteket a project `.codex-uploads` mappajaba menti, de a Discord valasz nem ir ki lokalis pathot.",
      "Ha a Discord kliens nem nyit fajlvalasztot a `file` mezonel, toltsd fel a fajlt normal uzenetkent, majd az uzeneten valaszd: `Apps` -> `Send to Codex`.",
      "`DISCORD_ENABLE_ATTACHMENT_MESSAGES=true` mellett normal szoveg + attachment uzenet is lehet prompt, de csak attachment szoveg nelkul nem indul el.",
      "Ha mar fut egy feladat, a bot sorba tudja allitani a kovetkezo promptot.",
    ],
  },
  {
    name: "audit",
    category: "repo",
    usage: "/audit start check: <plans|lint|typecheck|tests|build|full> | /audit status | /audit stop",
    short: "Fix, read-only audit checkeket futtat a regisztralt projecten, ha az env engedi.",
    details: [
      "Alapbol tiltott; csak `DISCORD_ENABLE_AUDIT=true` mellett mukodik.",
      "Csak a source-controlled named-check catalogbol valaszthato check fut.",
      "A `full` kulon lathato `plans`, `lint`, `typecheck`, `tests`, `build` lepesekre bomlik.",
      "Nem futtat tetszoleges shell parancsot, nem telepit dependencyt, nem javit kodot, es nem ir Gitbe.",
      "A statusz es step eredmenyek public-safe formaban kerulnek a helyi SQLite audit store-ba.",
    ],
  },
  {
    name: "auto-approve",
    category: "safety",
    usage: "/auto-approve mode: on|off",
    short: "Be- vagy kikapcsolja az automatikus tool/file jovahagyast, ha az env engedi.",
    details: [
      "Bekapcsolva a bot session-szinten elfogadhat Codex tool es file-change jovahagyasokat.",
      "Biztonsagi okbol csak akkor kapcsolhato be, ha `DISCORD_ENABLE_AUTO_APPROVE=true`.",
      "Kikapcsolni akkor is lehet, ha a feature nincs engedelyezve.",
    ],
  },
  {
    name: "clear-sessions",
    category: "safety",
    usage: "/clear-sessions",
    short: "Torli az adott projecthez tartozo helyi Codex session fajlokat, ha az env engedi.",
    details: [
      "Destruktiv operatori parancs, ezert alapbol tiltott.",
      "Csak `DISCORD_ENABLE_SESSION_DELETE=true` mellett mukodik.",
      "A regisztralt project lokalis Codex thread/session fajljait torli.",
    ],
  },
  {
    name: "bot",
    category: "ops",
    usage: "/bot action: status|restart",
    short: "Megmutatja vagy ujrainditja a helyi bot processzt.",
    details: [
      "`status` read-only modon a Windows launcher allapotat mutatja.",
      "`restart` csak `DISCORD_ENABLE_BOT_LIFECYCLE=true` mellett mukodik.",
      "A restart valaszt kuld Discordra, majd par masodperccel kesobb inditja ujra a helyi botot.",
    ],
  },
  {
    name: "dashboard",
    category: "ops",
    usage: "/dashboard",
    short: "Megmutatja a csatorna helyi Codex control paneljet.",
    details: [
      "Latszik benne a regisztralt project path, session allapot, queue meret es Codex command.",
      "Gyors operatori attekinteshez valo, mielott promptot kuldesz vagy sessiont valasztasz.",
    ],
  },
  {
    name: "doctor",
    category: "ops",
    usage: "/doctor",
    short: "Ellenorzi a bot, a config, a Codex CLI es a channel readiness allapotat.",
    details: [
      "Titkok kiirasa nelkul ellenorzi a Discord configot, allowed principalokat es BASE_PROJECT_DIR-t.",
      "Megnezi, hogy a channel regisztralt-e, elerheto-e a Codex CLI, es mukodik-e a `codex login status`.",
      "Jelzi, ha ugyanahhoz a project path-hoz tobb Discord channel mapping tartozik, peldaul regi forum/thread maradvany miatt.",
      "Ellenorzi, hogy a Discord guildben regisztralt slash parancsok egyeznek-e a bot vart command surface-evel.",
    ],
  },
  {
    name: "events",
    category: "ops",
    usage: "/events limit: <1-25> kind: all|startup|lifecycle|attention|task status: <opcionalis> summary: true|false",
    short: "Megmutatja es szuri a legutobbi public-safe operator eventeket.",
    details: [
      "A startup, lifecycle, approval/question es task outcome esemenyek rovid helyi timeline-ja.",
      "A `kind` opcioval event tipusra, a `status` opcioval public-safe status reszszovegre szurhetsz, peldaul `failed` vagy `restart`.",
      "A `summary` rovid darabszam-osszefoglalot ad az aktualis szurt talalatokra.",
      "Az adat az ignored `operator-events.log` fajlbol jon.",
      "Nem tartalmaz promptot, error detailt, tokent, privat pathot vagy config erteket.",
    ],
  },
  {
    name: "git-status",
    category: "repo",
    usage: "/git-status",
    short: "Lefuttatja a `git status --short --branch` parancsot a regisztralt projecten.",
    details: [
      "Gyorsan megmutatja, hogy a repo melyik branch-en van es van-e modositas.",
      "Nem modosit fajlokat, csak olvaso jellegu ellenorzes.",
    ],
  },
  {
    name: "help",
    category: "ops",
    usage: "/help parancs: <nev>",
    short: "Magyar sugot mutat az ismert bot parancsokrol.",
    details: [
      "Parancs nelkul rovid listat ad az osszes ismert parancsrol.",
      "A `parancs` opcioval reszletesebb leirast ad egy konkret parancsrol.",
      "A `/sugo` ugyanennek magyar aliasa.",
    ],
  },
  {
    name: "health",
    category: "ops",
    usage: "/health",
    short: "Public-safe bot runtime health riportot mutat.",
    details: [
      "A bot process, package version, slash command surface, Node runtime, error log, operator tools, usage cache es sajat repo sync allapotat mutatja.",
      "Nem ir ki tokent, raw Discord ID-t vagy privat lokalis pathot.",
      "Gyors mobilos operator ellenorzeshez valo, amikor azt akarod latni, hogy maga a bot jol fut-e.",
    ],
  },
  {
    name: "logs",
    category: "ops",
    usage: "/logs source: bot|error|operator-tools|events|update lines: <1-30> contains: <opcionalis>",
    short: "Public-safe tailt es opcionális szurest mutat a helyi bot logokbol.",
    details: [
      "Tavoli operatori diagnosztikahoz valo, amikor nincs VS Code vagy desktop panel elotted.",
      "Csak elore engedelyezett repo-lokalis logforrasokat olvas.",
      "A `contains` opcio a mar scrubbolt sorokon szur.",
      "A valasz scrubolja a pathokat, raw ID-kat, IP-ket es secret-szeru ertekeket.",
    ],
  },
  {
    name: "last",
    category: "sessions",
    usage: "/last",
    short: "Megmutatja az aktualis session utolso ismert Codex valaszat.",
    details: [
      "A kivalasztott vagy aktualis Codex threadbol probalja kiolvasni az utolso assistant valaszt.",
      "Ha a live Codex app-server olvasas nem elerheto, helyi rollout JSONL logbol probal fallbacket adni.",
      "Hasznos, ha a channelben vissza kell hozni az elozo valaszt.",
    ],
  },
  {
    name: "mappings",
    category: "repo",
    usage: "/mappings",
    short: "Listazza a project-channel mappingeket es jelzi a duplikalt project path-okat.",
    details: [
      "Attekintest ad arrol, hogy melyik Discord channel melyik local project path-hoz tartozik.",
      "A duplikalt project path-okat elore sorolja, igy a regi forum/thread maradvanyok gyorsan latszanak.",
      "Duplikalt mappingeknel Remove gombokat ad a nem aktualis csatornakra; az aktualis munkacsatornat `current` jelolessel mutatja.",
      "Kezi takaritashoz tovabbra is elerheto a `/unregister channel:` parancs.",
    ],
  },
  {
    name: "nas",
    category: "ops",
    usage: "/nas status | /nas deploy-status | /nas request check:<plans|lint|typecheck|tests|build|full> | /nas requests status:<all|queued|completed|failed> limit:<1-10> | /nas results limit:<1-10> | /nas bridge action:<status|start|stop|restart> | /nas smoke | /nas sync-status",
    short: "Public-safe NAS bridge allapotot mutat vagy fixed audit requestet kuld, ha az env engedi.",
    details: [
      "`/nas status` alapbol tiltott; csak `DISCORD_ENABLE_NAS_STATUS=true` mellett mukodik.",
      "`/nas deploy-status` ugyanilyen read-only status flag alatt reszletesebb NAS deploy verifikacios check-listat mutat.",
      "`/nas request` alapbol tiltott; csak `DISCORD_ENABLE_NAS_HANDOFF=true` mellett mukodik.",
      "`/nas requests` a helyileg tracked NAS requesteket listazza statusz szerint, csak public-safe mezokkel.",
      "`/nas results` a NAS outbox legutobbi public-safe audit eredmenyeit listazza.",
      "`/nas bridge` alapbol tiltott; csak `DISCORD_ENABLE_NAS_BRIDGE_LIFECYCLE=true` mellett inditja vagy allitja le a helyi PC bridge folyamatokat.",
      "`/nas smoke` alapbol tiltott; csak `DISCORD_ENABLE_NAS_BRIDGE_SMOKE=true` mellett futtat egy synthetic fixed-check bridge probat.",
      "`/nas sync-status` alapbol tiltott; csak `DISCORD_ENABLE_NAS_SYNC_STATUS=true` mellett futtat NAS share dry-run osszehasonlitast.",
      "`DISCORD_ENABLE_NAS_RESULT_NOTIFICATIONS=true` mellett a bot automatikusan visszairja a sajat queued requestek eredmenyet.",
      "`DISCORD_NAS_REQUEST_STALE_AFTER_MS` allitja, mennyi ido utan zaruljon le egy valasz nelkuli queued request failed allapotba.",
      "A queue/result/timeout atmenetek public-safe status tokenkent bekerulnek az `/events` timeline-ba.",
      "Megmutatja, hogy a PC worker HTTP es a handoff poller fut-e.",
      "A NAS mailboxot csak darabszam szinten mutatja: inbox, outbox, archive.",
      "Ha elerheto, a NAS control-plane latest snapshotbol rovid build/handoff/status sort is mutat.",
      "A status mutatja a result notifier allapotat, a stale timeoutot es az aktualis channel tracked request darabszamait is.",
      "A request csak source-controlled named checket tehet a NAS inboxba, tetszoleges parancsot nem.",
      "A smoke csak a repo-lokalis `nas:bridge:smoke` helpert hivja, es egy synthetic `plans` request eredmenyet foglalja ossze.",
      "A sync-status csak a repo-lokalis `nas:sync-share` dry-run modjat hivja, ezert nem masol es nem torol fajlt.",
      "A sync-status `staging-source` sora jelzi, ha a NAS staging forraskopia frissebbitesre szorul.",
      "Nem ir ki IP-t, meghajto betut, lokalis pathot, tokent vagy process ID-t Discordra.",
    ],
  },
  {
    name: "queue",
    category: "sessions",
    usage: "/queue list|clear|remove number",
    short: "A varakozo promptok listazasa, torlese vagy egy elem eltavolitasa.",
    details: [
      "`/queue list` megmutatja a varakozo promptokat.",
      "`/queue clear` kiuriti a sort.",
      "`/queue remove number` egy konkret sortetelt torol a listabol.",
    ],
  },
  {
    name: "register",
    category: "repo",
    usage: "/register path: <helyi_mappa>",
    short: "A jelenlegi Discord csatornat egy helyi repo/project mappahoz rendeli.",
    details: [
      "Ez a channel = project modell alapja.",
      "A path csak a `BASE_PROJECT_DIR` alatt lehet, igy Discordbol nem lehet kimaszni a megengedett workspace-bol.",
      "A Discord autocomplete legfeljebb 25 talalatot mutat, ezert ha nem latszik a repo, kezd el beirni a mappa nevet, peldaul `r_cube` vagy `solution`.",
      "Sikeres regisztracio utan ebben a channelben a Codex ehhez a projecthez dolgozik.",
    ],
  },
  {
    name: "run-tests",
    category: "repo",
    usage: "/run-tests",
    short: "`npm test` futtatasa a regisztralt projecten, ha az env engedi.",
    details: [
      "Lokalis parancsot indit, ezert alapbol tiltott.",
      "Csak `DISCORD_ENABLE_RUN_TESTS=true` mellett mukodik.",
      "A regisztralt project mappajaban futtatja az `npm test` parancsot.",
    ],
  },
  {
    name: "session",
    category: "sessions",
    usage: "/session current|new|stop",
    short: "Az adott channel aktualis Codex sessionjenek kezelesere valo.",
    details: [
      "`/session current` megmutatja a jelenlegi sessiont.",
      "`/session new` uj sessiont keszit elo a kovetkezo prompthoz.",
      "`/session stop` leallitja az aktiv Codex futast ebben a channelben.",
    ],
  },
  {
    name: "sessions",
    category: "sessions",
    usage: "/sessions query: <opcionalis> source: all|vscode|codex|discord limit: <1-24>",
    short: "Listazza, szuri es kivalaszthatova teszi a projecthez tartozo helyi Codex sessionoket.",
    details: [
      "A local Codex thread tarolobol keresi az adott project pathhoz tartozo sessionoket.",
      "A `query`, `source`, es `limit` opciok segitenek nagy session lista eseten.",
      "Lehet uj sessiont kezdeni, regi sessiont resume-olni, vagy engedelyezett esetben torolni.",
    ],
  },
  {
    name: "status",
    category: "ops",
    usage: "/status",
    short: "Megmutatja a szerveren regisztralt project/session allapotokat.",
    details: [
      "Attekinto parancs tobb channel/project allapotanak ellenorzesere.",
      "A regisztralt projecteket es a tarolt session statuszokat mutatja.",
    ],
  },
  {
    name: "tools",
    category: "ops",
    usage: "/tools action: run|status",
    short: "Elinditja vagy megnezi a VSC nelkuli operator tools preflight allapotat.",
    details: [
      "`run` lefuttatja a helyi `scripts/operator-startup.ps1` preflightot.",
      "A preflight a sajat MCP, Docker Desktop es Obsidian MCP elokeszitesere valo VS Code megnyitasa nelkul.",
      "`status` csak a helyi `operator-startup.log` rovid, public-safe allapot sorait mutatja.",
      "A parancs nem ir ki tokent, raw Discord ID-t vagy privat pathot Discordra.",
    ],
  },
  {
    name: "stop",
    category: "sessions",
    usage: "/stop",
    short: "Leallitja az adott channel aktiv Codex futasat.",
    details: [
      "Akkor hasznos, ha egy Codex feladat rossz iranyba ment vagy tul sokaig fut.",
      "Csak az adott channelhez tartozo aktiv futast probalja megszakitani.",
    ],
  },
  {
    name: "sugo",
    category: "ops",
    usage: "/sugo parancs: <nev>",
    short: "A `/help` magyar aliasa.",
    details: [
      "Ugyanazt tudja, mint a `/help`.",
      "Parancs nelkul rovid listat ad, `parancs` opcioval reszletes leirast.",
    ],
  },
  {
    name: "unregister",
    category: "repo",
    usage: "/unregister channel: <opcionalis>",
    short: "Torli a jelenlegi vagy kivalasztott channel es project kozotti kapcsolatot.",
    details: [
      "Argumentum nelkul az aktualis channel mappinget torli.",
      "A `channel` opcioval regi forum/thread vagy mas legacy mapping is torolheto az aktualis operatori csatornabol.",
      "A kapcsolodo local session mapping is torlodik az alkalmazas SQLite allapotabol.",
    ],
  },
  {
    name: "usage",
    category: "codex",
    usage: "/usage",
    short: "Megmutatja a helyi Codex account usage/rate-limit informacioit, ha elerheto.",
    details: [
      "A local Codex app-server rate-limit adataibol dolgozik.",
      "Ha a live lekerdezes nem sikerul, cache-bol is tud olvasni.",
      "Nem igenyel OpenAI API keyt, a helyi `codex login` allapotot hasznalja.",
    ],
  },
];

export function findHelpEntry(name: string): HelpEntry | undefined {
  const normalized = name.trim().replace(/^\//, "").toLowerCase();
  return HELP_ENTRIES.find((entry) => entry.name === normalized);
}
