# Korlátozott audit-orchestráció és későbbi NAS handoff

Status: active design / implementation not started

Kapcsolódó jelenlegi helyzet:

- Ez a dokumentum az `Attys_DC_BOT` következő local-first fejlesztési irányát rögzíti.
- Nem váltja le és nem keveri össze az `external-platform-acceptance.md` tervet. A két terv egymástól függetlenül követhető.
- A jelenlegi bot már rendelkezik project-channel mappinggel, egy aktív Codex turnnel csatornánként, queue-val, approval és user-input flow-val, `/run-tests`, `/dashboard`, `/events`, `/logs`, `/health`, `/doctor` és Stop vezérléssel.
- A ForgeLab nyilvános dokumentációja és marketingoldala csak mintaforrás. A motor zárt forrású, ezért a leírt belső megvalósítás és biztonsági állítások nem tekinthetők auditált referenciakódnak.
- Az `Attys_DC_BOT_NAS` külön repository és külön kockázati felület. Ebben a tervben csak handoff-feltételek szerepelnek; a NAS repo módosítása külön, explicit feladat lesz.

## Elkeszult reszek

- Local-first Discord -> helyi bot -> Codex app-server/CLI -> helyi project útvonal architektúra.
- Egy aktív turn csatornánként, operátor által megerősített queue és korlátozott queue-méret.
- Explicit tool/file approval, default-off auto-approve és ötperces approval/user-input timeout.
- Read-only `/run-tests` kapu `DISCORD_ENABLE_RUN_TESTS=true` feature flag mögött, fix `npm test` paranccsal és timeouttal.
- Public-safe `/dashboard`, `/status`, `/health`, `/events` és `/logs` operátori láthatóság.
- Public-safe output/path sanitizing, `BASE_PROJECT_DIR` határ és allowed user/role ellenőrzés.
- Aktív/done tervfájl-rend és CI-ben futó `npm run plans:check`.
- Windows prerelease baseline és külön external-platform acceptance terv.

## Nyitott reszek

- Audit job és audit step domain contract megtervezése és tesztelése.
- Fix, server-side named-check catalog bevezetése tetszőleges shell parancs nélkül.
- Read-only `/audit start|status|stop` első vertikális szelet.
- Tartós, újraindítás után is olvasható audit-job állapot.
- `/dashboard` és `/events` audit progress integráció.
- Explicit operátori repair-jóváhagyás.
- Izolált worktree-alapú repair végrehajtás; a normál user worktree automatikus módosítása tilos.
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

Az első cél nem egy ötagentes, autonóm fejlesztőrendszer.

Az első cél egy local-first, operátor által kontrollált audit-orchestrator, amely:

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
- NAS/multi-machine végrehajtás implementálása ebben a repository-szeletben.

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

### Szelet 0 — Contract és teszt-fixture alap

Érintett területek:

- `src/audit/types.ts`
- `src/audit/check-catalog.ts`
- unit tesztek
- `.env.example` csak akkor, ha új read-only feature flag szükséges

Elfogadási feltételek:

- státuszok és átmenetek explicit típussal leírva;
- fix check catalog;
- explicit `read-context`, `edit-existing` és `create-delete` capability contract;
- ismeretlen check fail-closed;
- nincs process execution ebben a szeletben;
- parser/typecheck/test zöld.

### Szelet 1 — Read-only check runner

Érintett területek:

- `src/audit/check-runner.ts`
- `src/bot/commands/audit.ts`
- `src/bot/client.ts`
- `src/bot/command-surface.ts`
- focused Vitest

Elfogadási feltételek:

- `/audit start` csak engedélyezett principalnak és regisztrált projectben működik;
- kizárólag catalog check fut;
- timeout és stop működik;
- output public-safe és korlátozott;
- nincs repair, install vagy Git write;
- `/run-tests` továbbra is kompatibilis.

### Szelet 2 — Tartós job/step állapot és observability

Érintett területek:

- SQLite migration a meglévő DB modulban;
- `src/audit/job-store.ts`
- `/audit status`
- `/dashboard`
- `/events`

Elfogadási feltételek:

- restart után a befejezett/megakadt job diagnosztizálható;
- aktív processz nélküli korábbi `running` job `interrupted`-szerű kezelt állapotra normalizálódik;
- raw log és privát path nem kerül DB summaryba vagy Discordra;
- egy projectre nincs két aktív audit job.

### Szelet 3 — Repair approval gate és izolált worktree előkészítés

Érintett területek:

- külön repair feature flag;
- approval button/handler;
- `src/audit/worktree-manager.ts`;
- Git preflight;
- negatív tesztek dirty repo, in-progress Git és path escape esetre.

Elfogadási feltételek:

- approval nélkül nincs worktree és Codex repair turn;
- dirty source esetén repair elutasítva;
- worktree root escape és symlink/reparse kockázat kezelve;
- nincs source branch write;
- cleanup hiba nem törli a user worktree-jét.

### Szelet 4 — Egyetlen approved repair + recheck

Elfogadási feltételek:

- egy repair turn izolált worktree-ben;
- ugyanaz a check catalog fut újra;
- eredmény review-ready summary;
- automatikus merge/commit/push nincs;
- failed repair megőrzi a diagnosztikai állapotot a retention policy szerint.

### Szelet 5 — Bounded loop és stagnation

Elfogadási feltételek:

- default két iteráció, hard maximum három;
- fingerprint determinisztikus és public-safe;
- stagnálásnál nincs újabb repair;
- romlásnál manual review;
- stop minden várakozó/futó fázisban idempotens.

### Szelet 6 — Planner/executor/validator prompt contract

Elfogadási feltételek:

- egy thread, fázisonként külön szerződés;
- planner output strukturált és validált;
- executor nem bővítheti a jóváhagyott fájl/scope-határt;
- validator csak bizonyítékból állapít meg sikert;
- reviewer nem ír és nem indít új kört.

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
- Repair capability külön, későbbi version bump és SECURITY/release-checklist frissítés nélkül nem publikálható.
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

Az első fejlesztési checkpoint kizárólag a Szelet 0 és Szelet 1 legyen:

- domain contract;
- külön context/edit/create-delete capability contract;
- fix named-check catalog;
- read-only `/audit start|status|stop`;
- progress és public-safe summary;
- focused tesztek;
- repair, worktree, retry és NAS nélkül.

Ez ad valódi operátori értéket, miközben nem hozza be idő előtt a zárt forrású termék marketingjének legkockázatosabb autonóm elemeit.
