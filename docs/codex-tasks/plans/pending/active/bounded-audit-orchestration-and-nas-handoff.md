# Korlátozott audit-orchestráció és későbbi NAS handoff

Status: active implementation / NAS-0 complete, audit contract-runner foundation in progress

Kapcsolódó jelenlegi helyzet:

- Ez a dokumentum az `Attys_DC_BOT` következő local-first fejlesztési irányát rögzíti.
- Nem váltja le és nem keveri össze az `external-platform-acceptance.md` tervet. A két terv egymástól függetlenül követhető.
- A jelenlegi bot már rendelkezik project-channel mappinggel, egy aktív Codex turnnel csatornánként, queue-val, approval és user-input flow-val, `/run-tests`, `/dashboard`, `/events`, `/logs`, `/health`, `/doctor` és Stop vezérléssel.
- A ForgeLab nyilvános dokumentációja és marketingoldala csak mintaforrás. A motor zárt forrású, ezért a leírt belső megvalósítás és biztonsági állítások nem tekinthetők auditált referenciakódnak.
- Az `Attys_DC_BOT_NAS` külön repository és külön kockázati felület. Ebben a tervben csak handoff-feltételek szerepelnek; a NAS repo módosítása külön, explicit feladat lesz.

## 2026-08-01 prioritásváltás

A terv korábban audit/szigorítás-first sorrendet írt le: előbb local audit-orchestrator, utána későbbi NAS handoff. Ez a korábbi irány nem törlődik, és nincs késznek nyilvánítva.

A végrehajtási sorrend a felhasználói döntés alapján módosul:

1. először a NAS-kapcsolat legkisebb biztonságos alapja készül el;
2. utána tér vissza a terv a local audit-orchestrator Szelet 0-1 részéhez;
3. a repair, izolált worktree, bounded retry és multi-agent részek továbbra is későbbi, magasabb kockázatú szeletek;
4. a VS Code single-runtime / shim terv külön not-started terv marad, és nem része ennek az első NAS-kapcsolati checkpointnak.

Az átirányítás oka: ha a NAS lesz a 24/7 control-plane irány, akkor előbb a worker registry, heartbeat, public-safe status és deploy boundary contractját kell tisztázni. Így a későbbi audit-orchestrator már nem egy kizárólag helyi botra lesz ráépítve, hanem NAS-handoffra előkészített határokkal indulhat.

## Elkeszult reszek

- Local-first Discord -> helyi bot -> Codex app-server/CLI -> helyi project útvonal architektúra.
- Egy aktív turn csatornánként, operátor által megerősített queue és korlátozott queue-méret.
- Explicit tool/file approval, default-off auto-approve és ötperces approval/user-input timeout.
- Read-only `/run-tests` kapu `DISCORD_ENABLE_RUN_TESTS=true` feature flag mögött, fix `npm test` paranccsal és timeouttal.
- Public-safe `/dashboard`, `/status`, `/health`, `/events` és `/logs` operátori láthatóság.
- Public-safe output/path sanitizing, `BASE_PROJECT_DIR` határ és allowed user/role ellenőrzés.
- Aktív/done tervfájl-rend és CI-ben futó `npm run plans:check`.
- Windows prerelease baseline és külön external-platform acceptance terv.
- 2026-08-01 döntés: a NAS-on a kiürített `Discord_Codex_BOT` megosztott mappa lesz az új NAS deploy célhely; a régi ARM bundle ZIP csak érzékeny történeti referencia.
- Szelet NAS-0 első biztonságos alapja: worker registry, NAS config parser, public-safe worker-target config, public-safe worker store/status, heartbeat writer, archive-kompatibilis worker health/repo-status/named-check probe, default-off PC worker health/repo-status/named-check server, file-backed handoff mailbox, tracked NAS sablon és ignored copy-ready staging kimenet.
- NAS Discord vezérlés: a `/nas status`, `/nas request`, `/nas requests`, `/nas results`, default-off `/nas bridge action:<status|start|stop|restart>`, default-off `/nas smoke` és default-off `/nas sync-status` útvonalak a PC worker, NAS handoff mailbox, bridge lifecycle, synthetic bridge smoke és NAS deploy dry-run kontrollját adják public-safe módon, arbitrary shell és NAS oldali Codex futtatás nélkül.
- NAS observability: a `/nas status` a worker/handoff readiness mellett a result notifier állapotát és a csatornához tartozó tracked NAS request counts értékeket is mutatja.
- NAS deploy guardrail: a `nas:sync-share` dry-run és a `/nas sync-status` public-safe `staging-source` jelzést ad, hogy látszódjon, ha a jelenlegi repo source frissebb, mint a NAS-ra szánt staging kópia. `-Apply` módban a helper ezt alapból megtagadja, és csak explicit operatori `-AllowStaleSource` review override-dal engedi.
- NAS build identity: a staging `app/NAS_BUILD_INFO.json` fájlt generál, a NAS image bemásolja, és a `nas:status` / `nas-control-plane-status` public-safe `buildInfo` blokkban mutatja, melyik source commit és package version került a konténerbe.
- NAS latest status snapshot: a long-running NAS control-plane loop a `logs/nas-control-plane-status.json` fájlt atomikusan frissíti, így a Windows oldal a megosztott mappából is láthatja a legutóbbi NAS állapotot Synology log scraping nélkül.
- NAS deploy verification: a `nas:deploy:verify` parancs és a `/nas status` rövid sora együtt ellenőrzi, hogy a NAS manifest, a build identity és a futó control-plane snapshot ugyanarra a commitra/package versionre mutat-e, a snapshot friss-e, a handoff ready-e, a worker egészséges-e, és NAS oldali Codex továbbra is tiltott-e.
- NAS deploy-status Discord vezérlés: a read-only `/nas deploy-status` ugyanennek a verifiernek a részletes check-listáját mutatja Discordon, NAS írás, raw JSON, path, worker URL vagy process ID nélkül.
- NAS container lifecycle helper: a `nas:container:status` és `nas:container:rebuild` npm parancsok a helyi ignored SSH configon és NAS oldali korlátozott sudo wrapperen keresztül ellenőrzik vagy újraépítik a NAS control-plane konténert. A repó nem tárol NAS jelszót, privát kulcsot, valós hostot vagy tokent.
- NAS deploy orchestration helper: a `nas:deploy` alapból dry-run módban `prepare -> check -> sync plan` sorrendet futtat, explicit `-Apply` mellett pedig synceli a share-t, restricted SSH helperrel újraépíti a NAS konténert, vár a snapshotra és lefuttatja a deploy verifiert.
- NAS container lifecycle output: a `nas:container:rebuild` sikeres futáskor rövid operatori összegzést ad, a `nas:container:status` rövid státuszsorai alapból láthatók maradnak, teljes távoli outputot pedig hiba esetén vagy explicit verbose módban mutat.
- NAS share sync output: a `nas:sync-share` alapértelmezésben rövid emberi összegzést ad, miközben a Discord `/nas sync-status` és `/nas doctor` explicit JSON módot kér, így a bot parsing contractja változatlanul stabil.
- NAS request lifecycle: a locally tracked `queued` NAS request `DISCORD_NAS_REQUEST_STALE_AFTER_MS` után public-safe `failed` timeout summaryval záródik, így nem marad végtelenül várakozó állapotban.
- NAS request audit-store bridge: a `/nas request` linked local audit jobot is nyit `waiting_nas_result` állapotban, ezért `/audit status` alatt is követhető a NAS-ra küldött fixed named-check. A kézi `/nas results` és az automatikus result notifier ugyanazzal a public-safe step summaryval zárja a linked audit jobot.
- NAS request ledger: a read-only `/nas requests status:<all|queued|completed|failed>` nézet a helyi SQLite trackingből listázza a requesteket rövid ID-val, checkkel, státusszal, kor/frissítés perccel, public-safe summaryval és handoff mailbox állapottal.
- NAS request event trail: a queue/result/timeout átmenetek public-safe `/events` státusztokenként is megjelennek, és a lezárt requesteket a manual results reconciliation nem írja újra régi outbox fájlokból.
- NAS request detail: a read-only `/nas request-status request:<id-prefix>` nézet egy konkrét helyileg tracked request public-safe részleteit mutatja, túl rövid vagy ambiguous prefix esetén fail-safe válasszal. A részletes nézet most public-safe `mailbox` állapotot is ad (`inbox`, `outbox`, `archive`, `missing`, `unavailable`, `invalid`), de nem ír ki NAS pathot, fájlnevet vagy raw payloadot.
- NAS mailbox message view: a read-only `/nas mailbox box:<inbox|outbox|archive> limit:<1-10>` nézet egy handoff box olvasható üzeneteit mutatja rövid public-safe sorokban invalid JSON darabszámmal, de file path, fájlnév, raw payload, parse error, token, worker URL vagy process ID nélkül.
- NAS mailbox consistency status: a read-only `/nas mailbox-status` nézet a mailbox valid/invalid darabszámokat, current-channel request trackinget, pending tracked outbox resultokat, orphan outbox resultokat és missing queued requesteket foglalja össze public-safe számokkal.
- NAS doctor summary: a read-only `/nas doctor` nézet egyetlen public-safe riportban fogja össze a bridge readiness, worker/handoff status, deploy verification, NAS share sync dry-run, mailbox consistency, result notifier és stale timeout állapotot. Nem ad át `-Apply` kapcsolót és nem végez NAS írást.
- Worker bridge lifecycle detach fix: a PC worker HTTP és handoff worker lifecycle helper WMI/CIM útvonalon indít háttérfolyamatot, ezért a `nas:bridge:*` parancsok Codex/PowerShell futtatásból sem ragadnak be a long-running child process tree miatt.
- NAS worker URL hardening: az `ATTYS_NAS_WORKERS_JSON` alapból elutasítja a `localhost`, `127.*`, `0.0.0.0` és `::1` worker URL-eket, mert ezek NAS konténerből nem a Windows PC workerre mutatnak. A lokális loopback smoke csak explicit smoke-only override-dal engedélyezett.
- NAS worker secret config hardening: az `ATTYS_NAS_WORKERS_JSON` worker targeteknél a `sharedSecretEnv` kötelező, és csak nagybetűs env-változó neve lehet, így a NAS control-plane nem konfigurálható véletlenül unauthenticated PC worker targettel.
- NAS worker HTTP auth guard: a worker HTTP kliens hiányzó tényleges shared-secret env érték esetén nem küld hálózati kérést, hanem public-safe hibaeredménnyel fail-closed megáll.
- NAS worker CLI output: a `nas:workers:health`, `nas:workers:repo-status` és `nas:workers:check` alapból rövid emberi összegzést ad, a gépi JSON kimenet pedig explicit `--json` módban maradt meg.
- NAS public worker metadata hardening: a public `configuredWorkers` snapshot és JSON kimenet már nem tartalmaz worker `baseUrl` értéket; a URL csak belső klienskonfiguráció marad.
- NAS deploy verifier public metadata guard: a `nas:deploy:verify` `public-worker-metadata` checkkel fail-closed jelzi, ha a futó NAS snapshot public worker metadata mégis URL mezőt tartalmazna.
- NAS restricted SSH runbook: a `docs/NAS_STAGING.md` titokmentesen dokumentálja a kulcsos SSH + szűk sudo wrapper setupot, amely a `nas:container:*` és `nas:deploy -- -Apply` parancsokhoz kell.
- NAS deploy rebuild skip: a `nas:deploy -- -Apply` rebuild előtt ellenőrzi, hogy a NAS deploy már aktuális-e; zöld verifier esetén kihagyja a konténer rebuildet, `-ForceRebuild` mellett pedig továbbra is kényszeríthető.
- NAS deploy verifier clock-skew guard: a `nas:deploy:verify` snapshot freshness check most azt is elutasítja, ha a futó NAS control-plane timestampje túl messze a jövőben van a PC oldali ellenőrzéshez képest.
- NAS container-status Discord command: a read-only `/nas container-status` a restricted SSH status wrapperből csak public-safe reachability/futás/duration sorokat mutat, raw Docker/SSH output és NAS írás nélkül.
- NAS doctor container visibility: a `/nas doctor` read-only összkép most a NAS control-plane konténer restricted SSH státuszát is tartalmazza public-safe sorban.
- NAS deploy no-op skip: tiszta checkoutnál a `nas:deploy -- -Apply` már sync előtt összeveti az élő NAS verifiert a jelenlegi Git commit + package version párossal, és egyezésnél NAS share írás és rebuild nélkül csak verifikál.
- NAS command JSON parsing fix: a Discord NAS report parser kezeli a PowerShell `ConvertTo-Json` több soros kimenetét is, így a `nas:container:status -Json` valós outputja helyesen parse-olódik.
- NAS doctor partial-report hardening: a `/nas doctor` mailbox/request tracking hiba esetén is public-safe partial riporttal tér vissza, raw DB/path/error output nélkül.
- NAS embedded JSON parsing fix: a Discord NAS report parser a zajos előtag után érkező több soros JSON blokkot is felismeri, így a `nas:sync-share -Json` valós outputja helyesen jelenik meg.
- NAS deploy preflight guard: `nas:deploy -- -Apply` konténer rebuild út esetén a NAS share írása előtt read-only `nas:container:status` restricted SSH preflightot futtat, így SSH/sudo/container lifecycle hiba esetén nem marad frissített share + régi konténer félállapot.
- NAS deploy snapshot wait: konténer rebuild után a `nas:deploy -- -Apply` a deploy verifiert pollolja a snapshot frissüléséig vagy timeoutig, fix vak várakozás helyett.
- NAS deploy snapshot timeout: éles rebuild alapján a default polling timeout 120 másodperc lett, mert a NAS control-plane tick + SMB láthatóság 65 másodpercnél hamis pirosat tudott adni.
- NAS deploy snapshot timeout calibration: második éles rebuild alapján a default polling timeout 180 másodperc lett, mert a snapshot 120 másodperc után pár másodperccel váltott át.
- NAS deploy snapshot timeout final calibration: két egymás utáni éles rebuild után a default polling timeout 300 másodperc lett, hogy a Synology control-plane tick + SMB láthatóság ne okozzon hamis piros deployt.
- NAS deploy snapshot grace verification: timeout után a deploy helper egy utolsó rövid grace intervallumot vár és újraellenőriz, mielőtt a final verifierrel pirosra futna.
- NAS deploy verifier snapshot reread: a `nas:deploy:verify` CLI rövid célzott snapshot újraolvasást végez build mismatch esetén, mert éles NAS deploynál SMB stale-read jellegű átmeneti eltérés jelent meg.
- NAS deploy final verifier retry: a `nas:deploy -- -Apply` végső verifier lépése rövid retry-t kapott, mert élesben a közvetlenül utána futtatott kézi verifier már zöld lett.
- NAS compose recreate trigger: a staging generált source commit/package version labelt ír a `docker-compose.yml` szolgáltatásra, így a jelenlegi restricted `docker compose up -d --build` NAS wrapper is compose-config változást lát és új konténert hoz létre.
- NAS compose image tag recreate trigger: a staging commit-alapú `image:` taget is generál, így a NAS wrapper nem csak label/config változást, hanem új image referenciát kap.
- NAS deploy verifier compose identity guard: a `nas:deploy:verify` a NAS share `docker-compose.yml` commit-alapú image tagjét és generated labeljeit is összeveti a staged build infóval.
- NAS deploy final verifier tolerance: a végső deploy verifier retry ablak 90 másodperc lett, mert élesben az új image már futott, de az SMB snapshot olvasás rövid ideig még régi buildet adott.
- NAS deploy isolated verifier fallback: a végső deploy verifier hosszu retry után egyszer friss PowerShell processzben is ellenőriz, mert ugyanazon deploy folyamat SMB olvasása stale snapshotot láthatott, miközben a következő önálló verifier már zöld volt.
- NAS deploy SMB cool-down fallback: az izolált verifier előtt 30 másodperces cool-down van, mert éles NAS-on a snapshot fájl átmenetileg `A paraméter nem megfelelő` olvasási hibát is adott, mielőtt zöld lett.
- NAS deploy current-image fast path: rebuild után a helper read-only restricted SSH státuszból felismeri, ha a NAS már a jelenlegi commit image tagjét futtatja. Ilyenkor kihagyja a hosszú ugyanazon-folyamatú SMB snapshot pollingot, de a teljes deploy verifier továbbra is kötelező sikerfeltétel.
- NAS container image visibility: a `/nas container-status` és `/nas doctor` public-safe `image=<commit>` mezőt mutat a futó NAS control-plane image tagből, raw Docker/SSH output nélkül.
- Szelet 0 első fele: audit mode/status/capability contract és fix named-check catalog fókuszált tesztekkel.
- Szelet 1 előkészítő runner alap: local `npm run audit:check -- <check>` CLI, amely csak catalog-checkeket futtat, public-safe JSON-t ad, hiányzó scriptnél `unsupported` állapotot jelez, és nem végez repairt vagy Git write-ot.
- Szelet 2 előkészítő store alap: additive SQLite `audit_jobs` és `audit_steps` táblák, public-safe job/step helper függvényekkel.
- Első read-only Discord integráció: default-off `/audit start|status|stop` `DISCORD_ENABLE_AUDIT=true` flag mögött, regisztrált csatornához kötve, repair nélkül.
- Observability/recovery integráció: `/dashboard` és `/status` audit összefoglaló, startup interrupted-normalization, és pipeline-lépések közötti stop-request ellenőrzés.
- Audit stop/events/dashboard finomítás: `/audit stop` már az aktuális bot processzben futó child-processnek is abort signalt küld, a `/dashboard` és `/status` közös public-safe audit-summaryt használ, és a lefutott named-check lépések `audit-check-*` operator eventként is megjelennek.
- Audit repair approval/worktree preflight: külön `DISCORD_ENABLE_AUDIT_REPAIR` flag, `/audit repair` approval kérés, approve/deny button handler, és isolated worktree előkészítő Git preflight elkészült. Ez még nem indít Codex repair turnt, merge-et, commitot vagy pusht.
- Audit repair workspace tracking: approval után az izolált worktree tartós helyi SQLite rekordot kap, és `/audit status` public-safe státuszt mutat róla lokális path nélkül.
- Audit requested-check tracking: az `audit_jobs.requested_check` additive mező elkészült, hogy a későbbi repair/recheck ugyanazt a named checket futtassa újra a törlődő `current_step` helyett.
- Audit isolated recheck: `/audit recheck` elkészült a repair flag alatt; prepared/retained isolated repair worktree-ben futtatja újra az eredeti named checket public-safe outputtal, automatikus Codex repair/merge/commit/push nélkül.
- Audit recheck stagnation/budget: public-safe issue fingerprint készült a sanitizált step output alapján; a `/audit recheck` nem lépi túl a job iteration budgetjét, és ha ugyanazt a named checket ugyanazzal a failed fingerprinttel bukja újra, a job `stagnated` állapotban megáll és a repair workspace retained marad.
- Audit repair workspace diff visibility: `/audit status` public-safe `changes:` összegzést mutat az izolált worktree-ről (`clean`, `unavailable`, vagy darabszámok), fájlnevek, lokális path és diff tartalom nélkül.
- Audit review command: `/audit review` read-only döntési összefoglalót ad a legutóbbi jobról, legutóbbi stepről, repair workspace-ről, és az engedélyezett/tiltott következő lépésekről, automatikus repair/merge/commit/push nélkül.
- Audit repair contract preview: `/audit repair-plan` read-only szerződés-előnézetet ad a későbbi izolált Codex repairhez, strukturált `audit-repair-contract/v1` contractból. A nézet public-safe módon mutatja a cél checket, legutóbbi bizonyítékot, repair workspace állapotot, scope-ot, kötelező validációt, prompt readiness állapotot és tiltott műveleteket; tényleges Codex repair turnt továbbra sem indít.
- Audit repair executor gate: belső fail-closed executor adapter készült a Codex repair turnhoz. Alapból disabled/rejected, és csak valid contract, valid prompt, izolált worktree path és explicit injektált starter callback mellett adhat `started` eredményt; most default-off `/audit repair-run` mögött érhető el.
- Audit repair Codex starter adapter: belső injektálható starter készült, amely a Codex app-serveren izolált repair worktree `cwd` mellett nyit threadet és egy repair prompt turnt indít. Csak a fail-closed executor gate mögött, a guardolt `/audit repair-run` útvonalon használható.
- Audit repair execution tracking: additive SQLite ledger és belső tracked-start helper készült a Codex repair turnhoz. A `/audit status` és `/audit review` public-safe módon mutatja a repair execution státuszt rövid thread/turn prefixekkel és sanitizált summaryval.
- Audit repair-run command gate: default-off `/audit repair-run` és külön `DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION=false` flag készült. Explicit engedélyezés után is csak prepared/retained izolált repair worktree-ben, valid contract/prompt mellett indíthat egy tracked Codex repair turnt; merge/commit/push/deploy/source worktree write továbbra sincs.
- Audit repair-run iteration guard: a repair execution ledger iterationt tárol, és `/audit repair-run` ugyanarra az audit iterationre nem indít második started repair turnt. Új repair-run csak `/audit recheck` után, következő iterationben indulhat.
- Audit repair-run evidence guard: `/audit repair-run` csak nem-passed audit evidence mellett indulhat; üres vagy sikeres audit bizonyítékból nincs repair prompt.
- Audit repair-run budget guard: `/audit repair-run` nem indít új Codex repair turnt, ha a job már elérte az iteration budgetet.
- Audit repair-run help/docs alignment: a `/audit` részletes súgó, README, SETUP és ez a terv már a jelenlegi default-off, guardolt repair-run működést írja le.
- Audit repair-reviewed marker: `/audit repair-reviewed` kézzel `reviewed` állapotra jelöli a legutóbbi same-iteration started repair executiont a public-safe ledgerben; nem futtat checket és nem ír fájlt.
- Audit recheck reviewed gate: `/audit recheck` started repair execution után megköveteli a kézi `/audit repair-reviewed` jelölést.
- Audit review next-action guidance: `/audit review` a repair execution státusza alapján mutatja, hogy `/audit repair-reviewed` vagy `/audit recheck` a következő biztonságos lépés.
- Audit stop terminalization: `/audit stop` controller nélküli aktív jobnál `stopped` terminál állapotot állít, repair workspace cleanup vagy source write nélkül.

## Nyitott reszek

- NAS control-plane és Windows worker transport/auth kapcsolatának további keményítése a mostani file-backed handoff mailbox, PC worker HTTP és restricted SSH container lifecycle helper után.
- Egyetlen approved repair + recheck végrehajtása izolált worktree-ben; a repair-run kapu elkészült, de a normál user worktree automatikus módosítása, merge, commit és push továbbra is tilos.
- Korlátozott retry, issue fingerprint és stagnation stop.
- Repair eredményének kézi review/átvételi folyamata.
- Semleges planner/executor/validator szerepek opcionális bevezetése, kezdetben egy Codex threaden belül.
- NAS handoff előfeltételeinek teljesítése és külön NAS architecture plan létrehozása.

## 1. Forrásalap és bizonyítéki határ

2026-07-13-án áttekintett nyilvános források:

- ForgeLab marketingoldal: `https://forgelab.one/home`
- nyilvános README: `https://github.com/forgelabeone-svg/forgelabone/blob/main/README.md`
- nyilvános architektúraleírás: `https://github.com/forgelabeone-svg/forgelabone/blob/main/ARCHITECTURE.md`
- roadmap: `https://github.com/forgelabeone-svg/forgelabone/blob/main/ROADMAP.md`
- licenc: `https://github.com/forgelabeone-svg/forgelabone/blob/main/LICENSE`
- bejelentkezett béta workspace: a `https://forgelab.one/chat` felület 2026-07-13-i, read-only UI-feltérképezése, projekt létrehozása, importja, AI-futtatás, deploy vagy credential/network vizsgálat nélkül

A bejelentkezett UI közvetlenül igazolta a felület szintjén, hogy:

- a `Single Chat` és `Brain Mode` külön munkamód;
- a `Brain` és az utólagos `Audit` külön kapcsolható;
- a workspace context átadása külön kapcsoló;
- a file capabilityk külön `Can Read Files`, `Can Edit Files` és `Can Create/Delete` határok;
- a Conductor, Architect, Senior Developer, Bug Hunter Fast és Bug Hunter Deep szerepekhez külön modellek rendelhetők;
- meglévő projekt ZIP-ből, mappából vagy GitHubból tölthető be, majd a UI `PATCH mode`-ként írja le a célzott módosítást;
- a Files, Editor, Preview és Terminal panelek, valamint export, GitHub push és deploy külön operátori felületek.

Ez UI-contract bizonyíték, nem forráskód-audit: nem igazolja a háttérben futó permission enforcementet, a patch algoritmust, a file lockingot, a modell-routingot vagy az automatikus audit eredményességét.

A forrásokból csak általános minták használhatók:

- fázisos orchestration;
- tervjóváhagyás végrehajtás előtt;
- specializált planner/executor/validator felelősségek;
- build/lint/typecheck/runtime jellegű auditlépések;
- korlátozott fix-újraellenőrzés ciklus;
- stagnálás felismerése;
- checkpoint és rollback elv;
- progress, Stop és állapotláthatóság.

Nem tekinthető bizonyítottnak és nem másolható át:

- a proprietary patch engine megvalósítása;
- a párhuzamos agent file locking konkrét algoritmusa;
- a termék biztonsági, teljesítmény- és minőségi marketingállításai;
- a globális memory, titkosítás, WebContainer, Judge0, Supabase vagy deployment megvalósítása;
- bármely zárt forrású kódrészlet vagy dokumentációszöveg.

## 2. Döntés röviden

Az első cél nem egy ötagentes, autonóm fejlesztőrendszer, és nem a VS Code single-runtime shim.

Az első cél a NAS-kapcsolat legkisebb biztonságos alapja:

1. a NAS oldali control-plane célmappa és deploy boundary rögzítése;
2. Windows worker health/heartbeat/status contract;
3. public-safe worker registry és timeout kezelés;
4. nincs Codex prompt, nincs named check, nincs repair, nincs VS Code shim;
5. nincs NAS oldali Codex auth, Git credential vagy Windows workspace secret.

Csak ezután következhet a local-first, operátor által kontrollált audit-orchestrator, amely:

1. egy regisztrált projecthez fix, allowlisted checkeket futtat;
2. fázisonként jelenti az állapotot;
3. alapból semmit nem javít;
4. repair előtt külön jóváhagyást kér;
5. repairt csak izolált worktree-ben enged;
6. kis, előre meghatározott retry-budget után megáll;
7. stagnálás vagy romlás esetén fail-closed módon operátori review-ra vált.

## 3. Célok

- A `/run-tests` egyetlen fix checkjéből biztonságos named-check rendszer kialakítása.
- A check pipeline állapotának tartós és public-safe megjelenítése Discordon.
- Megszakítható és újraindítás után diagnosztizálható audit jobok.
- A validáció és a javítás jogosultságának szétválasztása.
- Minden automatikus repair izolálása a user normál worktree-jétől.
- Determinisztikus stop-conditionök: timeout, retry-budget, stagnálás, romlás és operator stop.
- A későbbi NAS workerhez stabil, helyben bizonyított job/step contract előkészítése.

## 4. Nem célok

- OpenRouter, BYOK vagy más új model provider bekötése.
- A normál `codex login` kiváltása API-kulccsal.
- Több agent automatikus párhuzamos írása ugyanabba a worktree-be.
- Automatikus `npm install`, package upgrade, migration, deploy vagy release.
- Tetszőleges Discordból kapott shell parancs futtatása.
- Default-on auto-approve vagy operátori approval megkerülése.
- Dirty user worktree automatikus resetje, stash-e, commitja vagy felülírása.
- Git history rewrite, force-push vagy automatikus PR/merge.
- ForgeLab felület, branding, agentnevek vagy proprietary patch stratégia másolása.
- NAS oldali Codex-végrehajtás vagy Windows workspace közvetlen NAS-fájlrendszeres használata.
- VS Code `chatgpt.cliExecutable` / shim módosítás ebben a tervben; az külön, későbbi terv marad.

## 5. Megőrzendő biztonsági invariánsok

- Minden Discord művelet allowed user/role ellenőrzésen megy át.
- A project útvonal a `BASE_PROJECT_DIR` alatt marad.
- A check neve választási érték, nem parancsszöveg.
- A check catalog kizárólag source-controlled executable + argv + timeout rekordokat tartalmaz.
- Nincs `shell: true`, string-összefűzött command vagy letöltő `npx`.
- A check output Discord előtt méretkorlátot és public-safe sanitizingot kap.
- Raw lokális path, token, Discord ID, env value és teljes log nem kerül Discordra vagy tracked dokumentumba.
- Audit alapértelmezés: `check-only`.
- Repair alapértelmezés: tiltott, külön feature flag és per-job approval szükséges.
- A context-hozzáférés, a meglévő fájl módosítása és a fájl létrehozása/törlése három külön capability legyen; egyik se következzen automatikusan a másikból.
- A read-only check runner nem kap create/delete capabilityt, és a repair approval sem ad automatikusan create/delete engedélyt.
- A create/delete capability külön, scope-olt approvalt igényeljen a jóváhagyott relatív fájllistával vagy könyvtárhatárral.
- Auto-approve állapot nem jogosít audit repairre; ez két külön permission boundary.
- Stop után nincs újabb automatikus kör.
- Timeout/stagnálás/romlás után nincs automatikus budget-emelés.
- A user normál worktree-jén nincs automatikus rollback vagy destruktív Git.

## 6. Célarchitektúra az `Attys_DC_BOT` repóban

```text
Discord /audit parancs
        |
        v
AuditCommandController
        |
        +--> authorization + project mapping + feature flags
        |
        v
AuditOrchestrator
        |
        +--> AuditJobStore (SQLite)
        +--> NamedCheckCatalog (fix allowlist)
        +--> CheckRunner (structured process invocation)
        +--> AuditEventReporter (public-safe Discord/events)
        +--> RepairApprovalGate
        +--> IsolatedWorktreeManager (későbbi szelet)
        +--> IssueFingerprint / StagnationPolicy
        |
        v
Codex app-server egyetlen threadje
        |
        v
operator review / kézi átvétel
```

Javasolt modulhatárok:

- `src/audit/types.ts`
- `src/audit/check-catalog.ts`
- `src/audit/check-runner.ts`
- `src/audit/job-store.ts`
- `src/audit/orchestrator.ts`
- `src/audit/fingerprint.ts`
- `src/audit/worktree-manager.ts` csak a repair fázisban
- `src/bot/commands/audit.ts`
- meglévő `src/bot/commands/run-tests.ts` compatibility wrapper marad

## 7. Audit job állapotgép

Javasolt állapotok:

- `queued`
- `planning`
- `running_checks`
- `waiting_repair_approval`
- `preparing_isolated_worktree`
- `repairing`
- `rechecking`
- `waiting_manual_review`
- `completed`
- `failed`
- `stagnated`
- `stopped`

Fő átmenetek:

```text
queued -> planning -> running_checks
running_checks -> completed                    ha minden check zöld
running_checks -> waiting_repair_approval      ha van hiba és repair engedélyezhető
running_checks -> waiting_manual_review        ha repair tiltott vagy nem biztonságos
waiting_repair_approval -> preparing_isolated_worktree  explicit approval után
preparing_isolated_worktree -> repairing -> rechecking
rechecking -> completed                        ha zöld
rechecking -> repairing                        ha javul és maradt budget
rechecking -> stagnated                        ha nincs javulás
rechecking -> waiting_manual_review            ha romlik vagy elfogy a budget
active state -> stopped                        operator stop esetén
active state -> failed                         kezelt infrastruktúrahiba esetén
```

Tiltott átmenetek:

- `check-only` jobból közvetlenül `repairing`;
- `stagnated`, `stopped`, `failed` vagy `completed` állapotból automatikus újraindulás;
- repair normál user worktree-ben;
- approval nélkül budget-emelés vagy új repair job.

## 8. Minimális domain contract

Az első implementáció előtt pontos TypeScript contract és DB migration terv szükséges.

```ts
type AuditMode = "check-only" | "approved-repair";

type AuditJobStatus =
  | "queued"
  | "planning"
  | "running_checks"
  | "waiting_repair_approval"
  | "preparing_isolated_worktree"
  | "repairing"
  | "rechecking"
  | "waiting_manual_review"
  | "completed"
  | "failed"
  | "stagnated"
  | "stopped";

interface AuditJobSummary {
  id: string;
  channelId: string;
  projectLabel: string;
  mode: AuditMode;
  status: AuditJobStatus;
  currentStep: string | null;
  iteration: number;
  maxIterations: number;
  stopRequested: boolean;
  createdAt: string;
  updatedAt: string;
}
```

Adattárolási szabályok:

- A Discord-outputhoz csak public-safe project label használható.
- A DB-ben szükséges lokális project path meglévő project mappingből oldódjon fel, ne audit-event szövegből.
- Raw command output ne kerüljön az audit job fő táblába.
- Tartós részletes output csak ignored runtime területen, méret- és retention-korláttal tárolható.
- A public-safe summary külön mező legyen; ne a raw log rövidítéséből keletkezzen vakon.
- Audit job és step rekordok törlése külön, explicit retention feladat legyen; ne kerüljön az első szeletbe.

## 9. Named-check catalog

Első catalog:

| Check név | Fix végrehajtás | Timeout | Megjegyzés |
|---|---|---:|---|
| `plans` | `npm run plans:check` | 60 s | csak ha a script létezik |
| `lint` | `npm run lint` | 120 s | csak ha a script létezik |
| `typecheck` | `npm run typecheck` | 180 s | csak ha a script létezik |
| `tests` | `npm test` | 300 s | a jelenlegi `/run-tests` utód-contractja |
| `build` | `npm run build` | 300 s | nincs automatikus dependency install |
| `full` | `plans -> lint -> typecheck -> tests -> build` | lépésenként | progress miatt nem egyetlen opaque `npm run check` |

Catalog szabályok:

- Csak a catalogban szereplő név választható.
- Az executable platformfüggően `npm.cmd` vagy `npm`, strukturált argv-val.
- Hiányzó script `unsupported`, nem automatikus install vagy találgatott parancs.
- Egy project későbbi saját catalogja csak külön, validált és source-controlled contract alapján vezethető be.
- Repo-local konfiguráció nem írhat felül biztonsági timeoutot, executable-t vagy path-határt.
- Egyidejűleg egy audit job futhat projectenként; új kérés queue-ba kerül vagy kezelt `already-running` választ kap.

## 10. Discord és operator UX

Javasolt új parancs:

```text
/audit start check:<plans|lint|typecheck|tests|build|full> mode:<check-only>
/audit status
/audit stop
```

Az Attys megfelelő UI-contractja ne egyetlen összekapcsolt kapcsoló legyen, hanem három látható döntés:

- `Context`: a regisztrált local project olvasási kontextusa használható-e;
- `Audit`: melyik named-check pipeline fusson;
- `Repair capabilities`: `edit-existing` és külön `create-delete`, mindkettő default-off.

A ForgeLab `Single Chat` / `Brain Mode` szétválasztásából a botban a kisebb fogalmi megfelelő használható:

- `/ask`: normál, egyetlen Codex-turn;
- `/audit`: állapotgéppel vezérelt, ellenőrizhető workflow.

Ehhez nem szükséges külön model provider vagy több párhuzamos agent.

Repair csak későbbi szeletben:

```text
/audit start check:<...> mode:<approved-repair>
```

Az első hibás check után Discord gombok:

- `Review Summary`
- `Approve Isolated Repair`
- `Stop`

Nem legyen:

- `Run arbitrary command`;
- `Approve all forever`;
- automatikus repair az eredménykártya megjelenése előtt;
- raw log dump Discordon.

`/dashboard` új, rövid blokkja:

- audit job rövid ID;
- állapot;
- aktuális check;
- iteráció/budget;
- pending operator action;
- utolsó public-safe eredmény.

`/events` új audit eseményei vagy kezdetben `task` státuszai:

- `audit-started`
- `audit-check-passed`
- `audit-check-failed`
- `audit-repair-waiting`
- `audit-repair-started`
- `audit-stagnated`
- `audit-completed`
- `audit-stopped`

## 11. Repair és izoláció

Az első repair verzió csak akkor engedélyezhető, ha:

- külön `DISCORD_ENABLE_AUDIT_REPAIR=true` flag aktív;
- az operator per-job jóváhagyást adott;
- a source repo Git repository;
- nincs rebase/merge/cherry-pick/bisect folyamat;
- a source worktree clean;
- a target commit egyértelműen feloldható;
- az izolált worktree root biztonságos, előre konfigurált hely;
- a worktree létrehozása és eltávolítása ütközésmentes.

Izolációs szabály:

- Repair nem a regisztrált normál project mappában fut.
- Jobonként detached vagy külön ideiglenes branchhez kötött worktree készül `<AUDIT_WORKTREE_ROOT>/<job-id>` alatt.
- Az audit job eltárolja a source commitot, de nem ír automatikusan a source branchre.
- Sikeres repair eredménye review-ready diff és check summary.
- A diff átvétele külön, explicit későbbi operátori művelet; az első verzió csak megmutatja a következő biztonságos lépést.
- Failed/stagnated repair után az izolált worktree megőrizhető rövid retention ideig diagnosztikára, majd külön cleanup workflow törölheti.
- Automatikus `git reset --hard`, stash, commit, push vagy merge tilos.

Dirty source worktree esetén:

- check-only audit futhat read-only módon a jelenlegi állapoton;
- repair nem indul;
- a bot public-safe választ ad: előbb kézi checkpoint/clean state szükséges;
- a bot nem készít automatikus commitot a user helyett.

## 12. Korlátozott retry és stagnation policy

Kezdeti policy:

- default `maxIterations = 2`;
- hard maximum `3`;
- minden iteráció pontosan egy repair turn + teljes érintett recheck;
- sikeres check után az adott issue lezárt;
- nincs automatikus negyedik kör.

Issue fingerprint csak sanitizált, stabil mezőkből készülhet:

- check neve;
- exit-code kategória;
- normalizált hibakategóriák;
- érintett fájlok public-safe relatív címkéi;
- issue-darabszám;
- hash a sanitizált strukturált összefoglalóról.

Stagnálás:

- két egymást követő kör azonos fingerprinttel;
- az issue-darabszám nem csökken;
- ugyanaz a check ugyanabban a fázisban azonos exit-kategóriával bukik.

Romlás:

- nő az issue-darabszám;
- korábban zöld check piros lesz;
- új security/path/permission kategória jelenik meg;
- build vagy test infrastruktúrahibára vált.

Stagnálás vagy romlás eredménye:

- automatikus stop;
- `stagnated` vagy `waiting_manual_review` állapot;
- public-safe summary;
- nincs új prompt, budget-emelés vagy rollback a normál worktree-n.

## 13. Szerepek és párhuzamosság

Az első verzió egy Codex threadet használ, semleges fázisszerepekkel:

- `planner`: cél, checklista, kockázatok és elfogadási feltételek;
- `executor`: csak a jóváhagyott izolált repair szelet;
- `validator`: fix check catalog eredményeinek értékelése;
- `reviewer`: public-safe összegzés és következő operátori döntés.

Ezek kezdetben phase-specific prompt contractok, nem külön provider/model/agent processzek.

A ForgeLab agentenkénti modelválasztója alapján később hasznos lehet szerepenkénti prompt- és budget-profile, de az első verzióban:

- minden fázis ugyanazt a támogatott local Codex sessiont használja;
- nincs Discordból választható provider vagy modell;
- a Conductor megfelelője csak állapotátmenetet és stop-conditiont dönthet el, kódot nem írhat;
- a validator és reviewer nem kaphat write capabilityt;
- model routing csak mért minőség-, költség- és biztonsági bizonyíték után kerülhet külön tervbe.

Több agent csak később mérlegelhető, ha:

- az egy-threades audit loop már stabil;
- a Codex host támogatott contractja igazolt;
- minden agent külön fájltulajdonlással vagy külön worktree-vel dolgozik;
- nincs párhuzamos írás ugyanabba a fájlba;
- a token-, concurrency- és stop-budget mérhető;
- a user explicit engedélyezi.

## 14. Implementációs szeletek

### Szelet NAS-0 — Control-plane/worker kapcsolat alap

Ez az új első szelet. Célja nem audit futtatása, hanem annak bizonyítása, hogy a későbbi NAS control plane és a Windows worker között van biztonságosan modellezett, public-safe állapotkapcsolat.

2026-08-01 implementációs checkpoint:

- létrejött a minimális `src/nas/worker-registry.ts` contract modul;
- létrejött a fókuszált `src/nas/worker-registry.test.ts` teszt;
- létrejött a `src/nas/control-plane-config.ts` NAS config parser és a hozzá tartozó fókuszált teszt;
- a config parser az ARM-korszakos archive-ból menthető worker-target mintát is kezeli `ATTYS_NAS_WORKERS_JSON` alatt, de csak public-safe metadata jelenik meg statuszban;
- létrejött a `src/nas/worker-store.ts` file-backed public-safe worker store olvasó és a `src/cli/nas-status.ts` dry-run status CLI;
- létrejött a `src/cli/nas-worker-heartbeat.ts` Windows worker heartbeat writer;
- létrejött a `src/nas/worker-http-client.ts` archive-kompatibilis `GET /health` worker kliens és a `src/cli/nas-workers-health.ts` CLI;
- létrejött a default-off `src/worker/worker-http-server.ts` PC worker health szerver és a `src/cli/worker-http.ts` CLI;
- létrejött a read-only `src/worker/repo-status.ts`, a worker `GET /repo-status?project=...` endpointja és az `npm run nas:workers:repo-status` kliens CLI;
- létrejött a fixed-catalog `POST /checks/<name>?project=...` worker endpoint és az `npm run nas:workers:check` kliens CLI;
- létrejött az `npm run nas:control-plane` hosszan futó NAS status loop, és a staged Dockerfile ezt indítja;
- létrejött a `src/nas/handoff-store.ts` file-backed public-safe handoff mailbox contract;
- létrejött a `src/cli/nas-handoff-status.ts` és az `npm run nas:handoff:status` dry-run status CLI;
- a modul kizárólag message type, worker state, heartbeat timestamp, timeout és public-safe status modell;
- a config parser csak public-safe control-plane nevet, opcionális HTTP(S) public URL-t és korlátozott heartbeat timeoutot fogad;
- a NAS oldali Codex execution flag `true` értéke fail-closed hibával megáll;
- a worker secret csak `sharedSecretEnv` env-var névként szerepelhet a JSON-ban; a tényleges érték nem kerül public statuszba vagy tracked fájlba;
- a worker health probe a régi archive `x-telecodex-shared-secret` headerét használja kompatibilitásból, de csak env-változóból olvasott értékkel;
- a PC worker health server csak `GET /health` endpointot szolgál ki, loopback alapértelmezéssel, prompt/session/Git/filesystem/Codex endpoint nélkül;
- a PC worker repo-status endpoint csak read-only `git rev-parse --abbrev-ref HEAD` és `git status --short` információt ad vissza a beállított workspace root alatti projektről;
- a PC worker named-check endpoint csak a fix audit catalogot fogadja, tetszőleges shell parancs nélkül, és a meglévő read-only audit runnert használja;
- nincs NAS oldali endpoint/runtime, Codex prompt, repair vagy VS Code shim; a PC worker endpoint ebben a szeletben csak default-off health/repo-status/fixed named-check.
- a NAS konténer továbbra sem Discord bot és nem Codex runtime; csak public-safe status loopként marad életben.
- a NAS Dockerfile alapértelmezett parancsa csak `npm run nas:status`, vagyis nem indítja el a fő Discord botot.
- a heartbeat writer csak public-safe worker mezőket ír, és invalid store esetén nem ír felül vakon.
- a handoff mailbox `inbox`, `outbox`, `archive` és `tmp` könyvtárakat használ, atomic temp write-tal ír, nem ír felül meglévő message fájlt, és csak public-safe mezőket tárol.

2026-08-01 staging checkpoint:

- létrejött a tracked NAS sablon: `deploy/nas/Discord_Codex_BOT/`;
- létrejött a másolható, Gitből kizárt staging kimenet: `nas-staging/Discord_Codex_BOT/`;
- a staging kimenet belseje a NAS `Discord_Codex_BOT` megosztott mappájának belsejét tükrözi;
- `npm run nas:prepare` újragenerálja a staging mappát;
- a staging kimenetben létrejön a `data/handoff/inbox`, `data/handoff/outbox`, `data/handoff/archive` és `data/handoff/tmp` mailbox struktúra;
- `-IncludeSource` mód dirty checkoutból alapból megtagadja a forrásmásolást, hogy user változás vagy titok ne kerüljön véletlenül a NAS stagingbe.

2026-08-01 audit contract/runner checkpoint:

- létrejött a `src/audit/types.ts` contract modul;
- létrejött a `src/audit/types.test.ts` fókuszált teszt;
- létrejött a `src/audit/check-catalog.ts` fix named-check catalog;
- létrejött a `src/audit/check-catalog.test.ts` fókuszált teszt;
- létrejött a `src/audit/check-runner.ts` read-only check runner;
- létrejött a `src/audit/check-runner.test.ts` fókuszált teszt;
- létrejött a `src/cli/audit-check.ts` helyi CLI és az `npm run audit:check` script;
- a `full` check külön látható `plans`, `lint`, `typecheck`, `tests`, `build` lépésekre bomlik;
- a hiányzó package script `unsupported`, nem automatikus install vagy találgatott parancs;
- a runner public-safe outputot ad vissza, raw path/token/ID szivárgás ellen scrubbolva;
- a runner még nincs bekötve Discord `/audit` parancsra, és nincs tartós job store.
- létrejött az additive SQLite `audit_jobs` és `audit_steps` store alap;
- a store public-safe project labelt és public-safe step outputot tárol;
- a store támogatja a progress update-et és stop requestet;
- a meglévő project/session táblák változatlanul működnek.
- létrejött a default-off Discord `/audit start|status|stop` parancs;
- a `/audit start` csak regisztrált csatornán és `DISCORD_ENABLE_AUDIT=true` mellett fut;
- a `/audit start` kizárólag named-check catalogból futtat;
- a `/audit status` a legutóbbi audit job store-állapotot mutatja;
- a `/audit stop` stop requestet rögzít az aktív jobhoz;
- a `/dashboard` és `/status` rövid audit összefoglalót mutat;
- startupkor a processzhez kötött félbemaradt audit állapotok `failed` állapotba normalizálódnak;
- a `full` pipeline lépések között ellenőrzi a stop requestet;
- a `/audit` még nem fut háttérben és nem tartalmaz izolált repairt vagy child-process abortot.

Érintett területek:

- új vagy meglévő terv/contract dokumentáció az `Attys_DC_BOT` repóban;
- worker registry típusok és timeout/public-safe status helper;
- tracked NAS staging sablon és ignored copy-ready staging kimenet;
- NAS control-plane config parser;
- NAS handoff mailbox contract;
- `.env.example` csak synthetic placeholderrel, ha új feature flag vagy endpoint név kell;
- NAS deploy célhely dokumentáció: `Discord_Codex_BOT` megosztott mappa.

Minimális üzenettípusok:

- `worker.register`
- `worker.heartbeat`
- `worker.health`
- `worker.status`
- `control.status`
- `audit.request`
- `audit.status`
- `audit.result`

Minimális worker mezők:

- `workerId`
- `label`
- `hostKind`
- `workspaceRootLabel`
- `capabilities`
- `lastSeenAt`
- `status`

Elfogadási feltételek:

- a NAS-on a kiürített `Discord_Codex_BOT` megosztott mappa az új deploy célhelyként dokumentált;
- a régi `Discord_Codex_BOT.zip` érzékeny történeti referencia, nem aktuális futtatási alap;
- a régi archive ignored `_reference_nas_archive/Discord_Codex_BOT/` alatt vizsgálható, a benne lévő `.env.nas` nem olvasható/logolható/commitolható;
- az első contract nem tartalmaz Codex promptot, named checket, approval routingot, repairt vagy VS Code shimet;
- a worker státusz public-safe: nincs raw local path, token, Discord ID, `.env` érték, Codex auth vagy Git credential;
- a Windows worker végrehajtói szerepe megmarad, a NAS nem futtat Codexet Windows workspace-hez;
- a fókuszált registry/timeout teszt bizonyítja a fenti public-safe contractot;
- a fókuszált handoff teszt bizonyítja az ID-normalizálást, path escape tiltást, duplikált message elutasítást és invalid mailbox public-safe jelentését;
- a fókuszált worker HTTP kliens teszt bizonyítja a header contractot, a public-safe failure outputot és a több worker egymás utáni health probe-ját;
- a fókuszált PC worker HTTP server teszt bizonyítja a public-safe health payloadot, az opcionális shared-secret header kötelezését és a raw path maszkolást;
- a NAS worker HTTP integrációs teszt loopback szerverrel bizonyítja, hogy a NAS kliens health és repo-status adatot tud olvasni a PC worker szervertől;
- a fókuszált worker server/kliens tesztek bizonyítják, hogy unsupported check név elutasításra kerül, és csak a fix catalog kaphat futási útvonalat;
- a staging script nem másol `.env`, Codex auth state, Git credential, `node_modules`, `dist`, log vagy SQLite runtime state fájlokat;
- a config parser tesztelt, de endpoint vagy runtime kapcsolat előtt külön transport/auth szelet kell.

### Szelet 0 — Contract és teszt-fixture alap

Érintett területek:

- `src/audit/types.ts`
- `src/audit/check-catalog.ts`
- unit tesztek
- `.env.example` csak akkor, ha új read-only feature flag szükséges

Elfogadási feltételek:

- státuszok és átmenetek explicit típussal leírva; **kész**
- fix check catalog; **kész**
- explicit `read-context`, `edit-existing` és `create-delete` capability contract; **kész**
- ismeretlen check fail-closed; **kész a catalog parser szintjén**
- nincs process execution ebben a szeletben;
- parser/typecheck/test zöld.

Megjegyzés: a process execution már külön, read-only runner előkészítőként elindult, de Discord command és tartós job store nélkül. Ez nem repair és nem arbitrary shell.

### Szelet 1 — Read-only check runner

Érintett területek:

- `src/audit/check-runner.ts`
- `src/bot/commands/audit.ts`
- `src/bot/client.ts`
- `src/bot/command-surface.ts`
- focused Vitest

Elfogadási feltételek:

- `/audit start` csak engedélyezett principalnak és regisztrált projectben működik; **kész, bot-global auth + registered channel + feature flag mellett**
- kizárólag catalog check fut; **kész**
- timeout és stop működik; **timeout kész, stop request store szinten, pipeline-lépések között és az aktuális bot processzben futó child-process abortjával kész**
- output public-safe és korlátozott; **kész**
- nincs repair, install vagy Git write; **kész**
- `/run-tests` továbbra is kompatibilis.

### Szelet 2 — Tartós job/step állapot és observability

Érintett területek:

- SQLite migration a meglévő DB modulban;
- `src/audit/job-store.ts`
- `/audit status`
- `/dashboard`
- `/events`

Elfogadási feltételek:

- restart után a befejezett/megakadt job diagnosztizálható; **kész a `/audit status`, `/dashboard`, `/status` audit-summary nézetben**
- aktív processz nélküli korábbi `running` job `interrupted`-szerű kezelt állapotra normalizálódik; **kész `failed` állapotba**
- raw log és privát path nem kerül DB summaryba vagy Discordra; **store helper szinten kész**
- egy projectre nincs két aktív audit job; **kész exact project path + guild alapú lockkal a `/audit start` és `/nas request` útvonalon**
- `/events` mutatja a fontos audit progress állapotokat; **kész `audit-started`, `audit-check-*`, `audit-completed`, `audit-manual-review`, `audit-stop-requested` tokenekkel**

Megjegyzés: az additive SQLite táblák, helper függvények, Discord observability, interrupted normalization és per-project active-job enforcement elkészültek. A következő audit-orchestrációs munka már a repair approval gate / izolált worktree előkészítés felé vihető.

### Szelet 3 — Repair approval gate és izolált worktree előkészítés

Érintett területek:

- külön repair feature flag;
- approval button/handler;
- `src/audit/worktree-manager.ts`;
- Git preflight;
- negatív tesztek dirty repo, in-progress Git és path escape esetre.

Elfogadási feltételek:

- approval nélkül nincs worktree és Codex repair turn; **kész**
- dirty source esetén repair elutasítva; **kész preflight szinten**
- worktree root escape és symlink/reparse kockázat kezelve; **kész preflight szinten**
- nincs source branch write; **kész, csak isolated worktree add lehetséges approval után**
- cleanup hiba nem törli a user worktree-jét; **részben kész: ebben a szeletben nincs cleanup workflow, így source/user worktree törlés sincs**

Megjegyzés: Szelet 3 csak az approval gate-et és az isolated worktree preflightet készíti elő. A tényleges Codex repair turn, recheck, retention és cleanup Szelet 4 feladat.

### Szelet 4 — Egyetlen approved repair + recheck

Elfogadási feltételek:

- egy repair turn izolált worktree-ben;
- ugyanaz a check catalog fut újra;
- eredmény review-ready summary;
- automatikus merge/commit/push nincs;
- failed repair megőrzi a diagnosztikai állapotot a retention policy szerint;
- **részben kész előfeltételként:** approval-created worktree rekord és public-safe `/audit status` láthatóság elkészült.
- **részben kész előfeltételként:** az eredetileg kért named check tartós `requested_check` mezőben megmarad, így a recheck célja nem vész el a job lezárásakor.
- **részben kész:** ugyanaz a check catalog izolált repair worktree-ben újrafuttatható `/audit recheck` paranccsal, `/audit status` review-ready public-safe változásszámokat mutat, és `/audit review` külön read-only döntési összefoglalót ad.
- **részben kész:** `/audit repair-reviewed` jelöli, hogy az operátor kézzel átnézte az elindított repair executiont; a validálás továbbra is külön `/audit recheck`.
- **részben kész:** `/audit recheck` nem fut started same-iteration repair execution után, amíg nincs kézi `reviewed` jelölés.
- **részben kész:** `/audit review` már ezt a kézi review -> recheck sorrendet mutatja next-actionként.
- **részben kész:** `/audit stop` manual-review/repair-review fázisban is terminál `stopped` állapotba tud zárni, ha nincs futó process controller.
- **részben kész:** azonos public-safe failed fingerprint esetén a recheck `stagnated` állapotban megáll, és a recheck nem lépi túl a job iteration budgetjét; retry-budgettel vezérelt új repair kör még nincs.

### Szelet 5 — Bounded loop és stagnation

Elfogadási feltételek:

- default két iteráció, hard maximum három;
- fingerprint determinisztikus és public-safe;
- stagnálásnál nincs újabb repair;
- romlásnál manual review;
- stop minden várakozó/futó fázisban idempotens.
- **részben kész:** deterministic public-safe fingerprint, iteration budget guard és stagnation stop elkészült az isolated `/audit recheck` útvonalon.

### Szelet 6 — Planner/executor/validator prompt contract

Elfogadási feltételek:

- egy thread, fázisonként külön szerződés;
- planner output strukturált és validált;
- executor nem bővítheti a jóváhagyott fájl/scope-határt;
- validator csak bizonyítékból állapít meg sikert;
- reviewer nem ír és nem indít új kört.
- **részben kész:** determinisztikus, read-only `/audit repair-plan` contract renderer, strukturált `audit-repair-contract/v1` validátor és prompt readiness check elkészült. Ez még nem planner/executor/validator futtatás, de a későbbi repair prompt biztonsági szerződésének public-safe alapja.
- **részben kész:** belső fail-closed executor gate elkészült, és default-off `/audit repair-run` mögött érhető el; nincs automatikus merge/commit/push/deploy vagy source worktree write.
- **részben kész:** a Codex app-server starter adapter elkészült tesztelt injektálható callbackként, és csak explicit `DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION=true` mellett, guardolt `/audit repair-run` útvonalon használható.

### Szelet 7 — NAS handoff gate

Ez a szelet még nem módosítja az `Attys_DC_BOT_NAS` repót.

Handoff csak akkor indulhat, ha:

- local read-only audit stabil és publikált;
- repair loop legalább egy valós, izolált acceptance smoke-on bizonyított;
- stop/restart/interrupted recovery tesztelt;
- job/step contract verziózott;
- security review lezárta az auth, path, command, secret és log boundaryket;
- eldőlt, mi marad shared és mi NAS-specifikus;
- az `Attys_DC_BOT_NAS` saját `AGENTS.md`, `docs/STATE.md` és aktív terve a tényleges NAS irányt írja le;
- a user külön jóváhagyta a remote/multi-machine architecture boundary megváltoztatását.

## 15. Későbbi NAS architecture minimum

A külön NAS terv várható minimuma:

```text
Discord control plane
        |
        v
authenticated job API / queue
        |
        v
NAS worker lease + heartbeat
        |
        v
isolated checkout/worktree
        |
        v
named checks / approved repair
        |
        v
sanitized result + artifact manifest
```

Kötelező NAS fogalmak:

- hitelesített control plane és execution plane szétválasztás;
- durable queue és idempotens job ID;
- worker lease, heartbeat és expiry;
- reconnect/restart recovery;
- project allowlist;
- fix check catalog a worker oldalán;
- per-job isolated worktree;
- artifact hash/manifest;
- explicit approval token rövid élettartammal és egy jobhoz kötve;
- hálózati timeout, payload-size limit és replay-védelem;
- raw log, token, local path és Codex auth állapot tiltása a hálózati válaszokból.

Nem használható NAS contractként:

- nyitott CORS-os local helper;
- unauthenticated HTTP execution endpoint;
- network share közvetlen, közös worktree-ként;
- bot token vagy Codex auth state másolása a NAS workerre terv nélkül;
- ugyanazon worktree több worker általi párhuzamos írása.

## 16. Tesztstratégia

Unit:

- state transition table;
- named-check allowlist;
- timeout és stop;
- output sanitizing;
- fingerprint és stagnation;
- retry-budget;
- permission és feature-flag gate;
- path/worktree root validation.

Integration:

- synthetic temp Git repo;
- clean vs dirty preflight;
- missing npm script;
- pass/fail/timeout check;
- interrupted process utáni state normalization;
- SQLite job/step persistence;
- worktree create/list/remove biztonságos temp root alatt.

Discord command:

- unauthorized principal;
- unregistered channel;
- unknown check;
- active-job conflict;
- status és stop;
- repair approval accept/deny/timeout;
- public-safe summary és komponensfrissítés.

Acceptance:

- read-only audit egy synthetic repo sikeres és hibás checkjével;
- bot restart után job status helyes;
- approved repair csak izolált worktree-ben;
- stagnation két azonos fingerprint után megáll;
- normál user worktree hash/status változatlan marad.

## 17. Validációs kapuk minden implementációs szelethez

Minimum:

```powershell
npm run plans:check
npm run lint
npm run typecheck
npm test
npm run build
npm run check
git diff --check
ggshield secret scan path --recursive --yes --use-gitignore .
```

Repair/worktree szeletnél ezen felül:

- synthetic Git integration teszt;
- Windows path, reparse/symlink és process-stop negatív teszt;
- source worktree változatlanságának bizonyítása;
- cleanup idempotencia;
- manuális Discord smoke csak synthetic, secretmentes projecttel.

## 18. Dokumentáció, verzió és release döntés

- Ez a tervfájl docs-only előkészítés; most nincs version bump.
- Read-only `/audit` command megjelenése user-visible feature, ezért majd prerelease version bumpot és README/SETUP/help frissítést igényel.
- Repair approval/worktree preflight megjelenése miatt a package verzió `0.1.1-prerelease.3` lett; a deploy verifier output és repair workspace tracking miatt `0.1.1-prerelease.4`; az isolated `/audit recheck` miatt `0.1.1-prerelease.5`; a recheck stagnation stop miatt `0.1.1-prerelease.6`; a többüzenetes részletes `/help` és `/sugo` súgó miatt `0.1.1-prerelease.7`; a restricted SSH NAS container lifecycle helper miatt `0.1.1-prerelease.8`; a bridge lifecycle detach fix miatt `0.1.1-prerelease.9`; a NAS deploy orchestration helper miatt `0.1.1-prerelease.10`; a NAS worker URL hardening miatt `0.1.1-prerelease.11`; a NAS container lifecycle sikeres kimenetének rövidítése miatt `0.1.1-prerelease.12`; a NAS share sync terminálos kimenetének emberibbé tétele miatt `0.1.1-prerelease.13`; a NAS worker secret config hardening miatt `0.1.1-prerelease.14`; a NAS worker HTTP runtime auth guard miatt `0.1.1-prerelease.15`; a NAS worker CLI-k emberi alapértelmezett kimenete miatt `0.1.1-prerelease.16`; a public worker URL metadata szűkítése miatt `0.1.1-prerelease.17`; a deploy verifier public worker metadata guard miatt `0.1.1-prerelease.18`; a NAS deploy rebuild skip miatt `0.1.1-prerelease.19`; a deploy verifier clock-skew guard miatt `0.1.1-prerelease.20`; a read-only `/nas container-status` miatt `0.1.1-prerelease.21`; a `/nas doctor` container visibility miatt `0.1.1-prerelease.22`; a NAS deploy no-op skip miatt `0.1.1-prerelease.23`; a NAS command JSON parsing fix miatt `0.1.1-prerelease.24`; a NAS doctor partial-report hardening miatt `0.1.1-prerelease.25`; a NAS embedded JSON parsing fix miatt `0.1.1-prerelease.26`; a NAS deploy preflight guard miatt `0.1.1-prerelease.27`; a NAS deploy snapshot wait miatt `0.1.1-prerelease.28`; a NAS deploy snapshot timeout miatt `0.1.1-prerelease.29`; a NAS deploy snapshot timeout calibration miatt `0.1.1-prerelease.30`; a NAS deploy snapshot timeout final calibration miatt `0.1.1-prerelease.31`; a NAS deploy snapshot grace verification miatt `0.1.1-prerelease.32`; a NAS deploy verifier snapshot reread miatt `0.1.1-prerelease.33`; a NAS deploy final verifier retry miatt `0.1.1-prerelease.34`; a NAS compose recreate trigger miatt `0.1.1-prerelease.35`; a NAS compose image tag recreate trigger miatt `0.1.1-prerelease.36`; a NAS deploy verifier compose identity guard miatt `0.1.1-prerelease.37`; a NAS deploy final verifier tolerance miatt `0.1.1-prerelease.38`; a NAS deploy isolated verifier fallback miatt `0.1.1-prerelease.39`; a NAS deploy SMB cool-down fallback miatt `0.1.1-prerelease.40`; a NAS deploy current-image fast path miatt `0.1.1-prerelease.41`; a NAS container image visibility miatt `0.1.1-prerelease.42`; az audit repair workspace diff visibility miatt `0.1.1-prerelease.43`; az `/audit review` command miatt `0.1.1-prerelease.44`; az `/audit repair-plan` contract preview miatt `0.1.1-prerelease.45`; az audit repair execution tracking miatt `0.1.1-prerelease.46`; a default-off `/audit repair-run` command gate miatt `0.1.1-prerelease.47`; a repair-run iteration guard miatt `0.1.1-prerelease.48`; a repair-run evidence guard miatt `0.1.1-prerelease.49`; a repair-run budget guard miatt `0.1.1-prerelease.50`; a repair-run help/docs alignment miatt `0.1.1-prerelease.51`; a repair-reviewed marker miatt `0.1.1-prerelease.52`; a recheck reviewed gate miatt `0.1.1-prerelease.53`; az audit review next-action guidance miatt `0.1.1-prerelease.54`; az audit stop terminalization miatt `0.1.1-prerelease.55`.
- Minden elkészült szelet után frissítendő ez a terv, `docs/STATE.md` és `docs/CHANGELOG.dev.md`.
- Lezáráskor a terv csak akkor mozgatható `done` alá, ha a NAS handoff külön tervben ténylegesen elindult vagy explicit későbbi iránnyá lett visszasorolva.

## 19. Rollback és feature control

- Read-only audit külön default-off feature flag mögött induljon.
- Repair külön, még szigorúbb default-off flag mögött maradjon.
- Új DB táblák additive migrationnel készüljenek; régi bot flow-k ne függjenek tőlük.
- Feature flag kikapcsolásakor a meglévő `/ask`, `/run-tests`, queue, approval és dashboard baseline változatlanul működjön.
- Hibás rollout esetén az audit command regisztráció eltávolítható anélkül, hogy a session manager vagy project mapping schema sérülne.
- Izolált worktree cleanup külön runbook szerint történjen; automatikus széles könyvtártörlés tilos.

## 20. Definition of Done

A local audit-orchestráció akkor kész:

- a read-only check pipeline stabil és public-safe;
- job/step state restart után konzisztens;
- stop és timeout idempotens;
- repair csak explicit approval után, izolált worktree-ben fut;
- a retry-budget és stagnation stop tesztekkel bizonyított;
- a normál user worktree automatikusan soha nem módosul vagy törlődik;
- nincs arbitrary command, install, deploy, commit, push vagy merge;
- a dashboard/events/help/docs valós működést írnak le;
- minden repo-check és GitGuardian zöld;
- a version és release dokumentáció szinkronban van;
- a NAS handoff feltételei külön, repo-specifikus tervhez átadhatók.

## 21. Első javasolt megvalósítási checkpoint

Az első fejlesztési checkpoint kizárólag a **Szelet NAS-0** legyen:

- NAS deploy célhely dokumentálása: a Synology `Discord_Codex_BOT` megosztott mappa;
- régi ZIP/ARM image érzékeny történeti referenciaként kezelése;
- worker registry és heartbeat/status contract: `src/nas/worker-registry.ts`;
- public-safe worker státuszmezők: fókuszált unit teszttel lefedve;
- copy-ready local staging folder: `nas-staging/Discord_Codex_BOT/`;
- config parser implementálva és tesztelve; endpoint vagy runtime kapcsolat előtt külön transport/auth szelet jön;
- Codex prompt, named check, repair, worktree, retry és VS Code shim nélkül.

Ez adja meg a NAS-kapcsolat biztonságos alapját. Csak ezután indulhat a korábbi audit Szelet 0-1: domain contract, named-check catalog és read-only `/audit start|status|stop`.
