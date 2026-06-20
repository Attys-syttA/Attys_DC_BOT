# Cross-platform source parity and beyond

Status: active

## Elkeszult reszek

- Fazon 0 baseline lezarva: a `Send to Codex` file handoff/application command valtozasok validalva, commitolva es pusholva (`a89a2f8`).
- Fazon 1 cross-platform launcher alap lezarva es pusholva: `install.sh`, `linux-start.sh`, `mac-start.sh` (`a5411c1`).
- Fazon 2 Linux tray/control panel adaptacio elindult: `tray/codex_tray.py`, `tray/codex_control_panel.py` Attys brandinggel, launcher-alapu Start/Stop/Restart contracttal.
- Fazon 2 Linux tray/control panel lezarva es pusholva (`d7c53da`).
- Fazon 3 macOS menubar adaptacio elindult: `menubar/CodexBotMenu.swift` Attys brandinggel, read-only update modellel, `mac-start.sh`/launchd contracttal.
- Fazon 3 macOS menubar lezarva es pusholva (`085c795`).
- Fazon 4 Discord attachment/message prompt parity elindult: `DISCORD_ENABLE_ATTACHMENT_MESSAGES` flag, doctor/help/docs, normal text+attachment message flow.

## Nyitott reszek

- Fazon 4 teljes validacio, commit es push.
- Linux tray/control panel GUI runtime smoke tenyleges Linux desktop hoston kesobb platformtesztet igenyelhet.
- macOS menubar Swift build/runtime smoke tenyleges macOS hoston kesobb platformtesztet igenyelhet.
- Fazon 5-8 meg nincs implementalva.

## Cel

A `chadingTV/codex-discord` aktualis `main` aganak kodja es dokumentacioja alapjan az `Attys_DC_BOT` ne csak Windows-first sajat fork legyen, hanem legalabb ugyanazt a platform- es tavoli operatori hasznalhatosagot tudja, majd nehany ponton tul is lepje azt.

Referencia allapot:

- Forras repo: `https://github.com/chadingTV/codex-discord`
- Vizsgalt commit: `dc1afb8` (`Fix Linux Codex usage refresh`)
- Helyi repo: `E:\codex_works\Attys_DC_BOT`
- Jelenlegi helyi baseline: Windows launcher/tray/control panel eros; Linux/macOS launcher parity meg nincs; `Send to Codex` message context menu es modalos file handoff lokalisan kesz, de a terv keszitesekor meg commitolatlan.

## Szigoru vegrehajtasi szabaly

- A teljes munka nagy, onallo szeletekben fusson, de mindig csak akkor alljon meg, ha:
  - emberi dontes kell;
  - kulso platform/tooling hianyzik es telepites kell;
  - validation/secret scan/CI olyan hibat ad, amelyet biztonsagosan nem lehet lokalisan megoldani;
  - a teljes szelet kesz.
- Minden szelet elott `git status --short --branch`.
- A mostani commitolatlan `Send to Codex` valtozasokat tilos elveszteni. Elso lepesben vagy commitolni kell oket, vagy tudatosan bele kell venni az uj baseline commitba.
- Nincs remote-history rewrite.
- Nincs `git reset --hard`.
- Nincs automatikus destruktiv cleanup.
- `git stash`, `git pull`, `npm install`, bot restart, service install, autostart modositas csak a konkret szeletben dokumentalt es ellenorzott feltetelek mellett futhat.
- Token, Discord ID, privat path, Codex auth state, `.env`, runtime DB/log/cache soha nem kerulhet trackelt fajlba.

## Osszkep: mi van meg, mi hianyzik

### Ami nalunk mar erosebb vagy elorebb tart

- Windows launcher/status/stop logika repohoz kotott.
- Windows C# tray/control panel van Start/Stop/Restart, settings editor, log/folder open, usage panel, update readiness, Safe Update, login startup, Tools gomb.
- Public-safe `/health`, `/events`, `/logs`, `/doctor`, `/dashboard`.
- Central notification flow approval/question/task outcome es startup esemenyekhez.
- `DISCORD_ENABLE_MESSAGE_PROMPTS=false` mellett slash-only biztonsagos uzem.
- Allowed roles is vannak, nem csak allowed users.
- Public-safe path/ID/secret scrub tobb parancsban.
- `/mappings` es legacy mapping cleanup.
- `/tools` es Windows operator preflight MCP/Docker/Obsidian eloinditashoz.
- `Send to Codex` message context menu explicit file handoff modalos prompttal, amely iPad/telefon oldalon is hasznalhatobb lehet, mint a Discord slash attachment mezok.
- CI/lint/typecheck/secret-scan fegyelem erosebb.

### Ami a forras repo-ban van, nalunk meg nincs vagy csak reszben van

- `install.sh` macOS/Linux telepitovonal.
- `mac-start.sh` launchd alapu macOS hatterinditas.
- `linux-start.sh` systemd --user alapu Linux inditas.
- `menubar/CodexBotMenu.swift` macOS menubar/control app.
- `tray/codex_tray.py` Linux tray app.
- `tray/codex_control_panel.py` Linux desktop control panel.
- Cross-platform README/SETUP struktura macOS, Linux es Windows fejezetekkel.
- Forras-repo szeru normal Discord message attachment handling, ahol a sima fajlos uzenet is prompt lehet, ha Message Content intent engedelyezett.
- Cross-platform installer a Codex CLI hiany kezelesere.
- Public release setup olyan felhasznaloknak, akik nem csak Windows gepen futtatnak.
- Platform specifikus troubleshooting launchd/systemd/tray/menubar es Codex command resolver eseteire.

## Celallapot

A munka vegen az Attys bot:

- Windows mellett macOS-on es Linuxon is elindithato legyen dokumentalt modon.
- Desktopos Linux/macOS feluleten legyen helyi status/control panel vagy legalabb menubar/tray minimal operator surface.
- iPadrol/telefonrol a Discord operator flow legyen egyszeru:
  - channel registration;
  - file handoff;
  - Codex prompt;
  - approval/question answer;
  - logs/events/last/status inspection;
  - safe stop/restart request.
- A source repo kepessegei kozul a cross-platform launcher/panel/doc/attachment reszek legalabb parity szinten legyenek.
- A sajat repo public-safe es safety hardeningje ne gyenguljon.
- A `README.md` Current Scope ne mondja tovabb, hogy Linux/macOS launcher parity out of scope, ha a munka elkeszult.

## Fazon 0: jelenlegi pending worktree baseline lezarasa

Cel: ne induljon cross-platform atalakitas dirty, felig commitolt allapotbol.

Lepesek:

1. `git status --short --branch`.
2. Diff audit:
   - `src/bot/client.ts`
   - `src/bot/commands/send-to-codex.ts`
   - `src/bot/commands/send-to-codex.test.ts`
   - `src/bot/command-surface.ts`
   - `src/bot/commands/doctor.ts`
   - `src/bot/commands/help-*`
   - `src/bot/notifications.ts`
3. Megerositeni, hogy a pending diff csak a file handoff/application command valtozasokat tartalmazza.
4. Futtatni:
   - `npm run check`
   - `git diff --check`
   - `npm run secret:scan`
5. Ha zold, commit:
   - javasolt uzenet: `Add explicit Discord file handoff command`
6. Push `main`-ra.
7. Ellenorzes:
   - `git rev-list --left-right --count origin/main...HEAD` -> `0 0`
   - `git status --short --branch` tiszta legyen.

Elfogadas:

- A local es origin synced.
- A bot forraskodja mar tartalmazza a `Send to Codex` modalos handoffot.
- Az uj cross-platform munka tiszta baseline-rol indul.

Stop feltetel:

- Ha a pending diffben nem ehhez tartozo valtozas van, emberi dontes kell.
- Ha secret scan vagy check bukik, javitani kell, commit nincs.

## Fazon 1: cross-platform launcher alap es runtime lifecycle

Cel: legyen macOS/Linux indito es status/stop logika a forras repo kepessegeivel egyezve, de az Attys safety policy szerint.

Forras-repo referencia:

- `install.sh`
- `mac-start.sh`
- `linux-start.sh`
- `win-start.bat`
- `src/codex/command-resolver.ts`
- `SETUP.md` platform start fejezetei

Implementacios lepesek:

1. Letrehozni vagy adaptalni:
   - `install.sh`
   - `mac-start.sh`
   - `linux-start.sh`
2. Script policy:
   - POSIX shell kompatibilitas;
   - `set -e` vagy explicit exit-code handling;
   - private path/log scrub ahol output Discordba vagy docsba kerulhet;
   - ne irjon `.env` valodi ertekeket;
   - ne inditson auto-update-et implicit modon.
3. `install.sh` feladata:
   - Node 20+ ellenorzes;
   - `npm install` csak explicit install futtataskor;
   - Codex CLI ellenorzes;
   - `.env.example` -> `.env` ajanlas, de valodi ertekek nelkul;
   - `npm run build`;
   - platform launcher next steps.
4. `linux-start.sh` feladata:
   - `--status`;
   - `--stop`;
   - foreground diagnostic mode;
   - background start;
   - systemd --user unit letrehozas/inditas opcion;
   - lock/log kezeles;
   - `bot.log` es `bot.err.log` konzisztens hasznalata.
5. `mac-start.sh` feladata:
   - `--status`;
   - `--stop`;
   - foreground diagnostic mode;
   - launchd plist letrehozas/inditas opcion;
   - lock/log kezeles;
   - notarization/alairas nem cel ebben a szeletben, de Gatekeeper troubleshooting dokumentalasa kell.
6. `src/codex/command-resolver.ts` audit:
   - Windows `codex.cmd` baseline marad;
   - macOS/Linux path candidates legyenek source parity szinten;
   - runtime cache path ne legyen projekt-fuggo privat adat Discord outputban.
7. Platform fuggvenyekhez minimal unit/smoke tesztek:
   - command resolver tests;
   - launch script syntax check, ahol platformon ertelmezheto;
   - docs commands ne hivatkozzanak nem letezo scriptre.

Elfogadas:

- `install.sh`, `linux-start.sh`, `mac-start.sh` trackelt es executable bit beallitva, ha Git ezt kezeli.
- Windows launcher viselkedese nem romlik.
- Linux/macOS script nem futtat destructive git muveletet.
- README es SETUP mar nem Windows-only telepitesi logikat allit.

Stop feltetel:

- Ha a helyi Windows kornyezetben nem lehet ertelmesen validalni shell script syntaxot, ezt dokumentalni kell, de nem feltetlen blocker.
- Ha implementaciohoz macOS/Linux gep kell runtime smoke-hoz, a terv azon a ponton emberi/platform tesztet ker.

## Fazon 2: Linux tray es control panel parity

Cel: a forras repo Linux desktop operator felulete bekeruljon vagy Attys-kompatibilis ujrairas keszuljon.

Forras-repo referencia:

- `tray/codex_tray.py`
- `tray/codex_control_panel.py`
- `README.md` Linux launcher fejezet
- `SETUP.md` Linux start es troubleshooting

Implementacios lepesek:

1. Letrehozni/adaptalni:
   - `tray/codex_tray.py`
   - `tray/codex_control_panel.py`
2. Branding:
   - `Attys DC BOT`;
   - GitHub link: `Attys-syttA/Attys_DC_BOT`;
   - source attribution a docsban.
3. Funkciok:
   - bot status;
   - Start;
   - Stop;
   - Restart;
   - Open Log;
   - Open Folder;
   - Usage cache display;
   - Refresh usage Codex app-serveren keresztul, ha lehet;
   - Settings editor placeholder-safe modon;
   - GitHub/Releases/Setup linkek;
   - optional Tools/Operator preflight csak akkor, ha Linuxon ertelmezheto.
4. Linux service integration:
   - `systemd --user` status olvasas;
   - service restart;
   - log tail;
   - fallback foreground process detection, ha nincs systemd user session.
5. Dependency strategy:
   - Python csomagok dokumentalasa;
   - nem automatikus global pip install normal bot start soran;
   - installerben csak explicit install modban.
6. Public safety:
   - local pathok roviditett megjelenitese;
   - token/env ertekek soha;
   - error log scrub vagy lokalis-only jeloles.
7. Tests:
   - Python syntax check, ha Python elerheto;
   - minimal import smoke dependency hiany eseten graceful failure;
   - docs smoke.

Elfogadas:

- Linux desktop session eseten van tray/panel inditasi ut.
- Headless Linux eseten a bot systemd --user service-kent futhat panel nelkul.
- Failure mode: dependency hiany nem torli/irja at configot; ertheto hibauzenetet ad.

Stop feltetel:

- Ha Linux GUI dependency validaciohoz tenyleges Linux desktop kell, emberi/platform teszt kell.

## Fazon 3: macOS menubar parity

Cel: a macOS hasznalat ne csak shell script legyen, hanem a forras repo menubar kepessegeit is lefedje.

Forras-repo referencia:

- `menubar/CodexBotMenu.swift`
- `mac-start.sh`
- `SETUP.md` macOS fejezet

Implementacios lepesek:

1. Letrehozni/adaptalni:
   - `menubar/CodexBotMenu.swift`
2. Branding es linkek:
   - `Attys DC BOT`;
   - GitHub link `Attys-syttA/Attys_DC_BOT`;
   - source attribution docsban.
3. Funkciok:
   - bot status;
   - Start;
   - Stop;
   - Restart;
   - Open Log;
   - Open Folder;
   - Usage cache status;
   - Refresh usage, ha Codex command elerheto;
   - Setup/README/GitHub link;
   - optional Launch at Login vagy launchd helper status.
4. `mac-start.sh` es menubar kozos contract:
   - azonos logfajlok;
   - azonos lock/status detektalas;
   - launchd plist neve Attys brandinggel;
   - nem hasznal privat pathot docsban.
5. Build/run dokumentacio:
   - `swiftc` vagy Xcode command line tools feltetel;
   - Gatekeeper/quarantine troubleshooting;
   - first run permission notes.
6. Tests:
   - ha macOS runner/local gep nincs, legalabb statikus dokumentalt acceptance;
   - Swift syntax/build csak macOS-on kotelezo.

Elfogadas:

- macOS user shellbol es menubarbol is tudja inditani/allitani a botot.
- iPad/telefon Discord operator flowhoz a macOS host is megbizhato hattergep lehet.

Stop feltetel:

- Swift build/run csak macOS-on validalhato; ha nincs macOS gep, a szelet dokumentaltan partial marad, es emberi macOS smoke kell.

## Fazon 4: Discord attachment/message prompt parity es iPad-baratsag

Cel: a forras repo normal message attachment flow-ja elerheto legyen, de a mi explicit/safe mode-unk is megmaradjon.

Forras-repo referencia:

- `src/bot/client.ts` GuildMessages + MessageContent intents
- `src/bot/handlers/message.ts` normal message attachment download
- `README.md` Attachments
- `SETUP.md` Message Content Intent es Attachments

Jelenlegi sajat baseline:

- `/ask file/file2/file3` slash attachment slotok.
- `Send to Codex` message context menu.
- Modalos prompt, ha a fajlos uzenethez nincs szoveg.
- `DISCORD_ENABLE_MESSAGE_PROMPTS=false` mellett is lehet explicit fajlt atadni.

Implementacios lepesek:

1. Uj feature flag bevezetese:
   - `DISCORD_ENABLE_ATTACHMENT_MESSAGES`
   - alapertelmezett: `false`
2. Ha `DISCORD_ENABLE_ATTACHMENT_MESSAGES=true`:
   - bot kerje a szukseges intenteket;
   - normal message handler dolgozza fel a regisztralt csatornak fajlos uzeneteit;
   - csak allowed principal kuldhet;
   - csak regisztralt channelben mukodik.
3. Message Content policy:
   - Ha teljes message prompt mode off, de attachment message mode on, pontosan dokumentalni kell, hogy Discord oldalon Message Content intent valoszinuleg kellhet a tartalom/attachment eleresehez.
   - `/doctor` jelezze kulon:
     - message prompts;
     - attachment messages;
     - Message Content intent kovetelmeny.
4. UX flow:
   - Explicit `Send to Codex` marad ajanlott iPad/telefon mod.
   - Optional automatic attachment message flow forras-repo parity celbol.
   - Ha csak attachment van prompt nelkul normal message flow-ban, ne inditson vak default promptot; vagy:
     - kuldjon vissza ephemeral/modal jellegu prompt-kerest, ha interactionbol lehet;
     - vagy nyilvanos rovid valaszt: hasznald `Send to Codex` es ird be a promptot.
5. Attachment safety:
   - kozos `attachments.ts` marad canonical;
   - blocked extensions;
   - 25 MB limit;
   - safe filename;
   - `.codex-uploads` ignored marad.
6. Help/docs:
   - `/sugo parancs: fajlfeltoltes` frissites;
   - README Attachments frissites;
   - SETUP iPad/phone flow;
   - kepernyokep vagy public-safe illusztracio, ha hasznos.
7. Tests:
   - disabled flags mellett normal message ignore;
   - attachment messages enabled -> download + prompt suffix;
   - promptless attachment -> nem indul vakon, hanem guidance/modal fallback;
   - unauthorized user reject;
   - queue behavior active sessionnel;
   - dangerous file blocked.

Elfogadas:

- A forras repo egyszeru "attach file in Discord" flow-ja elerheto feature flaggel.
- A biztonsagos explicit `Send to Codex` flow tovabbra is mukodik flag nelkul.
- iPadrol ertheto, melyik utat kell hasznalni.

Stop feltetel:

- Ha Discord Developer Portalban Message Content intent nincs bekapcsolva, live acceptance ott emberi beavatkozast ker.

## Fazon 5: Cross-platform usage panel es Codex app-server health

Cel: a `/usage`, Windows panel, Linux panel, macOS menubar ugyanarra a usage/cache logikara epuljon.

Forras-repo referencia:

- `src/codex/usage.ts`
- `tray/CodexBotTray.cs`
- `tray/codex_control_panel.py`
- `tray/codex_tray.py`

Implementacios lepesek:

1. Canonical TS usage module audit:
   - live `codex app-server` read;
   - cache fallback;
   - public-safe error messages.
2. Cross-platform panel contract:
   - cache file: `~/.codex/rate-limits-cache.json`;
   - refresh command;
   - unavailable states:
     - cache missing;
     - Codex app-server unavailable;
     - login missing;
     - parse error.
3. Windows panel ne romoljon.
4. Linux panel olvassa ugyanazt.
5. macOS menubar/panel olvassa ugyanazt vagy legalabb status/open usage linket ad.
6. Tests:
   - usage parser;
   - cache age formatting;
   - unavailable states;
   - panel docs examples public-safe.

Elfogadas:

- Minden platform ugyanazt a usage igazsagot mutatja.
- Nincs token/path leak usage hibaallapotban.

## Fazon 6: Install/docs/public release parity

Cel: a repo dokumentacioja ne Windows-only legyen, hanem forras repohoz hasonlo, de Attys-specifikusan szigorubb.

Forras-repo referencia:

- `README.md`
- `SETUP.md`
- `docs/README.kr.md`
- `docs/SETUP.kr.md`
- `install.bat`
- `install.sh`

Implementacios lepesek:

1. README atstrukturalsa:
   - What this is;
   - Why Discord;
   - Key features;
   - Architecture;
   - Requirements;
   - Installation by platform;
   - Quick start by platform;
   - Commands;
   - Attachments and iPad/mobile flow;
   - Platform launchers;
   - Security model;
   - Current scope frissitese.
2. SETUP atstrukturalsa:
   - Discord bot creation;
   - Message Content intent kulon matrix:
     - slash-only;
     - `Send to Codex`;
     - normal message prompts;
     - attachment messages;
   - `.env` variable reference;
   - macOS;
   - Linux;
   - Windows;
   - First Discord test;
   - Sessions;
   - Attachments;
   - Troubleshooting;
   - Development checks.
3. Public-safe assets:
   - Windows screenshot marad;
   - Linux panel synthetic screenshot/illustration, ha nincs valos Linux desktop;
   - macOS menubar synthetic screenshot/illustration, ha nincs valos macOS smoke;
   - valodi token/path/Discord ID tilos.
4. Source attribution:
   - README-ben es SETUP-ban roviden:
     - based on/local-first direction from `chadingTV/codex-discord`;
     - Attys-specific changes: safety, Windows tools, explicit file handoff, public-safe diagnostics.
5. Localization dontes:
   - Forras repo tartalmaz koreai docsokat.
   - Nalatok minimal cel: English README/SETUP + magyar `/sugo`.
   - Ha "minden docs parity" kell, kesobb kulon tervben lehet `docs/README.hu.md` es/vagy `docs/SETUP.hu.md`; koreai docs nem kotelezo Attys repohoz, hacsak nincs explicit igeny.
6. Release checklist frissitese:
   - macOS smoke;
   - Linux smoke;
   - Windows smoke;
   - Discord mobile/iPad smoke;
   - attachment handoff smoke;
   - secret scan.

Elfogadas:

- Uj felhasznalo el tud indulni Windows, Linux vagy macOS hoston.
- iPad/telefon csak operator clientkent erthetoen dokumentalt.
- Docs nem iger olyat, ami nincs implementalva.

## Fazon 7: Safe update es lifecycle tovabbfejlesztes, source repo meghaladasa

Cel: a forras repo auto-update kepessegeit ugy fedjuk le, hogy ne gyenguljon a safety.

Forras-repo referencia:

- Windows tray auto-update reszek;
- Linux tray update reszek;
- release linkek.

Sajat elv:

- Default update csak safe, clean, fast-forward.
- Destruktiv vagy stash-alapu recovery csak explicit, kulon emberi jovahagyasra.

Implementacios lepesek:

1. Cross-platform read-only update check:
   - `git fetch`;
   - local/upstream sha;
   - ahead/behind/diverged;
   - dirty state.
2. Safe update:
   - clean only;
   - behind only;
   - `git pull --ff-only`;
   - `npm install` csak package file valtozas utan;
   - `npm run check`;
   - restart csak siker utan.
3. Advanced update mode terv, nem alap implementacio:
   - ha dirty vagy diverged, UI csak magyaraz;
   - `git stash` vagy manual merge csak explicit user approved future work.
4. Logs:
   - `update.log` public-safe;
   - Discord `/logs source:update`;
   - no tokens/private paths.
5. Tests:
   - git state parser;
   - safe update enablement matrix;
   - dirty/diverged disable.

Elfogadas:

- Windows, Linux, macOS feluletek ugyanazt a safe update policyt mutatjak.
- Source repo auto-update UX erzes megvan, de Attys safety erosebb.

## Fazon 8: Platform acceptance matrix

Cel: ne zaruljon a terv "papiron kesz" allapotban.

Kotelezo validation:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run check
npm run plans:check
git diff --check
ggshield secret scan path --recursive --yes --use-gitignore .
```

Windows smoke:

```powershell
cmd /c win-start.bat --status
cmd /c win-start.bat
cmd /c win-start.bat --status
cmd /c win-start.bat --stop
```

Linux smoke:

```bash
./install.sh --help
./linux-start.sh --status
./linux-start.sh
./linux-start.sh --status
./linux-start.sh --stop
```

macOS smoke:

```bash
./install.sh --help
./mac-start.sh --status
./mac-start.sh
./mac-start.sh --status
./mac-start.sh --stop
```

Discord smoke:

- `/doctor`
- `/health`
- `/dashboard`
- `/register`
- `/ask`
- `Send to Codex` file handoff with prompt modal
- optional normal attachment message flow if enabled
- approval card accept/deny
- user question answer
- `/events`
- `/logs`
- `/last`
- `/sessions`
- `/usage`
- `/bot status`

iPad/mobile smoke:

- Discord channel open;
- file upload;
- message context/app command path megtalalhato;
- modal prompt kitoltheto;
- bot visszajelzi, hogy attachment saved;
- Codex kapja a file path prompt suffixet;
- `/last` visszahozza a valaszt.

CI/publish:

- Push utan GitHub Actions zold.
- `git rev-list --left-right --count origin/main...HEAD` -> `0 0`.

## Varhato commit szeletek

1. `Close pending file handoff baseline`
2. `Add macOS and Linux launcher scripts`
3. `Add Linux tray and control panel`
4. `Add macOS menubar control app`
5. `Add optional attachment message mode`
6. `Align cross-platform usage panels`
7. `Refresh cross-platform setup docs`
8. `Add cross-platform release checklist and smoke docs`

## Nyitott emberi dontesek

- Legyen-e defaultbol bekapcsolva a normal message prompt/attachment flow, vagy maradjon default: slash/context-command only?
- Kell-e magyar teljes SETUP/README a public English docs mellett?
- Kell-e koreai docs parity a forras repo miatt, vagy ez nem relevans az Attys repo kozonsegenek?
- Van-e elerheto macOS gep a Swift menubar valos build/smoke teszthez?
- Van-e elerheto Linux desktop session a tray/control panel valos smoke teszthez?
- Engedelyezheto-e valaha stash-alapu advanced update, vagy maradjon csak safe ff-only?

## Definition of Done

Ez a terv csak akkor zarhato `done` ala, ha:

- Fazon 0-8 minden kotelezo pontja kesz vagy explicit future-workkent elfogadott.
- A repo docs nem allit Windows-only scope-ot, ha Linux/macOS parity megvalosult.
- A source parity matrix minden pontja statuszt kapott:
  - implemented;
  - implemented differently;
  - intentionally not included with reason;
  - future work with user approval.
- Minden implementation change validalva van.
- Secret scan zold vagy dokumentalt manual fallback keszult, ha ggshield nem elerheto.
- Commit/push kesz es origin/main szinkronban van.
