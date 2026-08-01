# Attys_DC_BOT – egyetlen VS Code/Codex runtime közös Discord-vezérlése

**Cél repository:** `Attys-syttA/Attys_DC_BOT`  
**Javasolt célhely a repositoryban:** `docs/codex-tasks/plans/pending/not-started/attys-dc-bot-vscode-single-runtime-codex-plan.md`  
**Dokumentum típusa:** fejlesztési terv és végrehajtási prompt Codex-agent részére  
**Kutatási állapot dátuma:** 2026-08-01  
**Javasolt megvalósítási állapot:** `not-started`

## Elkészült részek

- [x] A repository jelenlegi Codex-, session-, queue-, adatbázis- és Discord-folyamatának feltérképezése.
- [x] A meglévő NAS-architektúra-koncepció összevetése a jelenlegi kóddal.
- [x] A hivatalos Codex App Server, CLI és VS Code extension kapcsolódási lehetőségeinek ellenőrzése.
- [x] Nyilvános shim/proxy minták és hasonló remote-control projektek áttekintése.
- [x] Ajánlott célarchitektúra, capability gate-ek, biztonsági korlátok és tesztstratégia kidolgozása.

## Nyitott részek

- [ ] A célgépen futó Codex CLI és VS Code extension pontos verziójának rögzítése.
- [ ] A `chatgpt.cliExecutable` alapú átlátszó shim kompatibilitási spike végrehajtása.
- [ ] A Codex-protokoll és a session-orchestráció szétválasztása.
- [ ] A shim, a helyi control gateway és az ownership/queue réteg megvalósítása.
- [ ] Az élő VS Code-panel szinkron igazolása.
- [ ] A teljes szintetikus és Windows E2E validáció végrehajtása.
- [ ] A későbbi NAS-worker interfész stabilizálása, tényleges NAS-hálózati implementáció nélkül.

---

# 1. Codex-agent végrehajtási utasítás

Dolgozz önállóan a terv szerint addig, amíg egy fázis teljesen elkészült, vagy valódi, biztonságosan nem feloldható blokkoló tényezőbe ütközöl.

Ne találj ki nem dokumentált Codex- vagy VS Code-interfészt. Először a célgépen elérhető verziók, parancsok, processzek és protokollsémák alapján bizonyítsd a szükséges capability-ket. Magas kockázatú capability gate sikertelensége esetén állj meg az adott fázis végén, dokumentáld az eredményt, és ne kerüld meg a problémát VS Code-bundle patch-eléssel, UI-automatizálással vagy privát adatbázis-módosítással.

Minden fázis végén:

1. futtasd az előírt teszteket;
2. mentsd az észlelt eredményeket a terv státuszblokkjába vagy a repository meglévő, erre alkalmas teszt-/worklog-struktúrájába;
3. frissítsd az `Elkészült részek` és `Nyitott részek` listát;
4. futtasd az `npm run plans:check` parancsot;
5. csak sikeres ellenőrzés után lépj a következő fázisra.

Ha a repository valós állapota eltér ettől a tervtől, csak a cél megőrzéséhez szükséges legkisebb módosítást végezd el. Ne indíts kapcsolódó, de különálló refaktort.

---

# 2. Cél és elvárt eredmény

A jelenlegi `Attys_DC_BOT` használatakor ne induljon a VS Code Codex mellett egy második, önálló Codex-agent/runtime.

A kívánt topológia:

```text
Discord
   |
   v
Attys_DC_BOT
   |
   | magas szintű, engedélyezett control parancsok
   v
Local Control Gateway
   |
   v
VS Code Codex Shim  <---->  hivatalos VS Code Codex extension
   |
   | egyetlen downstream JSON-RPC kapcsolat
   v
egyetlen valódi `codex app-server`
   |
   v
ugyanaz a thread, turn, approval-, sandbox- és workspace-környezet
```

A shim nem második agent. A shim egy helyi, átlátszó protokollközvetítő, amelyet a VS Code extension indít a `chatgpt.cliExecutable` beállításon keresztül. A shim pontosan egy valódi `codex app-server` gyerekfolyamatot indít, a VS Code teljes forgalmát továbbítja, és engedélyezett vezérlési pontot ad a botnak.

Az MVP akkor tekinthető sikeresnek, ha:

- a VS Code extension továbbra is normálisan használható;
- a bot shared-runtime módban nem indít külön `codex app-server` folyamatot;
- a Discord explicit attach után ugyanazon aktív threadbe tud promptot küldeni;
- ugyanazon threadben egyszerre legfeljebb egy aktív turn lehet;
- a VS Code és Discord közti ownership átadás explicit, auditált és visszavonható;
- az approval és user-input kérés mindig egyértelműen a megfelelő felülethez kerül;
- a bot kiesése nem teszi használhatatlanná a helyi VS Code Codexet;
- a shim eltávolítása egyértelműen és maradéktalanul visszaállítja az eredeti működést.

---

# 3. A jelenlegi rendszer értékelése

## 3.1. Jelenlegi futási modell

A repository jelenlegi `src/codex/app-server-client.ts` implementációja a bot folyamatából indítja el a `codex app-server` child processzt, stdio JSON-RPC kapcsolattal. A `src/codex/session-manager.ts` a globális klienshez kötve kezeli:

- a Discord-csatornához tartozó aktív threadet és turnt;
- a streamelt eseményeket;
- az approval-kéréseket;
- a Codex user-input kéréseit;
- a memóriában élő promptqueue-t;
- a turn lezárása utáni automatikus dequeue-t.

Ezért amikor a VS Code extension is fut, két külön Codex App Server/runtime jön létre.

## 3.2. Session-folytatás és élő runtime közti különbség

A jelenlegi bot képes a helyi Codex-tárolóból VS Code eredetű threadet felismerni és saját App Serverén keresztül folytatni. Ez threadfolytonosság, de nem ugyanazon élő VS Code runtime vezérlése.

A cél nem pusztán ugyanazon `threadId` újranyitása, hanem:

- ugyanazon App Server processz;
- ugyanazon aktív turn állapot;
- ugyanazon approval- és sandbox-kontextus;
- ugyanazon workspace/process environment;
- VS Code-ban látható élő események;
- kizárólagos input ownership.

## 3.3. Jelenlegi állapottárolás korlátai

A bot saját SQLite-adatbázisa jelenleg főként projekt- és session-hozzárendelést tárol. Nem tartalmaz:

- runtime-instance nyilvántartást;
- session ownership lease-t;
- fencing tokent;
- tartós taskqueue-t;
- idempotenciakulcsot;
- pending approval/user-input állapotot;
- audit eseménysort;
- restart utáni reconciliation állapotot.

A jelenlegi promptqueue és több pending interaction map memóriában él, ezért restart esetén elveszik.

## 3.4. Privát Codex-tároló csatolás

A `src/codex/storage.ts` közvetlenül olvassa a `~/.codex/state_*.sqlite` fájlokat, és egyes műveleteknél közvetlen állapot-/rollout-módosítást is végez. Ez verzióérzékeny, privát sémához kötött megoldás.

A shared-runtime megvalósításban:

- aktív runtime- és threadállapot elsődleges forrása a shim által megfigyelt hivatalos App Server-protokoll legyen;
- threadlista és threadolvasás lehetőleg az App Server hivatalos műveletein keresztül történjen;
- privát Codex SQLite-ba írni tilos;
- a meglévő read-only discovery csak átmeneti, feature flag mögötti fallback lehet;
- destruktív sessiontörlés ne módosítsa közvetlenül a Codex privát adatbázisát.

---

# 4. Forrásalapú műszaki következtetés

## 4.1. Hivatalos lehetőségek

A jelenlegi hivatalos dokumentáció alapján:

- a VS Code extension Codex App Servert használ;
- a CLI támogat távoli App Server endpointot `--remote` módban;
- az App Servernek van helyi Unix socketes control-plane lehetősége;
- a WebSocket transport kísérleti;
- a VS Code extension rendelkezik `chatgpt.cliExecutable` beállítással, de ez fejlesztői célú, és a dokumentáció figyelmeztet, hogy manuális felülíráskor egyes extension-funkciók elromolhatnak.

Ezért a `chatgpt.cliExecutable` megoldás használható integrációs varrat, de nem kezelhető garantált, örökké stabil publikus plugin API-ként.

## 4.2. Nyilvános precedensek

Nyilvános projektek és dokumentációk mutatnak olyan mintát, ahol:

- a VS Code extension egy wrapper/shim executable-t indít;
- a wrapper elindítja a valódi `codex app-server` folyamatot;
- a teljes JSON-RPC forgalmat átlátszóan továbbítja;
- csak meghatározott reverse requesteket, approval-kéréseket vagy remote-control eseményeket kezel;
- a távoli chatfelület és a VS Code ugyanazon Codex-munkafolyamatot követi.

Ezek igazolják az architekturális minta realitását, de külső kódot csak egyértelmű licencellenőrzés után szabad átvenni. Az alapértelmezett végrehajtás legyen önálló, a hivatalos App Server-séma alapján.

## 4.3. Nem választott hivatalos socket/proxy út

Az App Server helyi socketes transportja hosszabb távon jó irány lehet. A stock VS Code extension meglévő App Serverhez csatlakoztatása azonban nem dokumentált, stabil végfelhasználói konfiguráció. Az `app-server proxy` körül nyilvános verzióspecifikus hibajelentések is vannak.

Ezért az MVP elsődleges útja ne a stock proxy parancsra épüljön, hanem a saját, minimális stdio shimre, amely a VS Code és az általa indított egyetlen App Server között helyezkedik el.

A socketes, több klienses App Server mód külön későbbi capability spike lehet.

---

# 5. Feltételezések

| Azonosító | Feltételezés | Kockázat | Kezelés |
|---|---|---:|---|
| A-01 | A célkörnyezet elsődlegesen Windows PC és helyi desktop VS Code. | alacsony | A Linux/WSL út külön adapter, nem MVP-követelmény. |
| A-02 | A cél VS Code extension verzió engedi a `chatgpt.cliExecutable` felülírást. | magas | Kötelező Gate G1, verziórögzítés és rollback. |
| A-03 | A wrapperen át indított App Server protokollja elégségesen megfigyelhető és továbbítható. | közepes | Verzióspecifikus séma, parser- és kompatibilitási tesztek. |
| A-04 | A VS Code UI képes megjeleníteni a ugyanazon downstream App Serveren Discordból indított turn eseményeit. | magas | Kötelező Gate G3; sikertelenség esetén megállási pont. |
| A-05 | Egy cél VS Code-window/workspace tartozik az MVP runtime-hoz. | közepes | Több VS Code-window explicit non-goal az MVP-ben. |
| A-06 | Az egyfelhasználós helyi PC-n a loopback/named-pipe control channel megfelelő első biztonsági határ. | közepes | Capability token, user-scoped state, no public listener; NAS előtt új threat model. |
| A-07 | A bot jelenlegi Discord authorization és projektútvonal-védelme megtartható. | alacsony | Regressziós tesztek. |

A-02 és A-04 magas kockázatú. Ezeket nem szabad csendben igaznak feltételezni; a megvalósítás előtt mérni kell.

---

# 6. Nem célok és scope-korlátok

Az MVP nem tartalmazza:

- a NAS control plane tényleges implementációját;
- több PC vagy több worker támogatását;
- nyilvános port vagy általános remote shell létrehozását;
- a VS Code extension bundle-jének automatikus patch-elését;
- a stock extension privát IPC-routerére való közvetlen csatlakozást;
- UI-automatizálást, billentyűleütés-injektálást vagy képernyővezérlést;
- a Codex privát SQLite-adatbázisának írását;
- korlátlan nyers JSON-RPC továbbítást Discord felől;
- automatikus approvalt;
- több egyidejű agentet vagy subagent-orchestrációt;
- minden Codex CLI/extension verzió támogatását;
- új Discord-funkciókat, amelyek nem szükségesek a shared-runtime vezérléshez;
- a `Attys_DC_BOT_NAS` repository módosítását.

A későbbi NAS-hoz csak olyan interfészeket kell most kialakítani, amelyek megakadályozzák a helyi Discord-, Codex- és worker-logika újbóli összekeverését.

---

# 7. Architekturális döntés

## ADR-01 – VS Code által indított átlátszó shim legyen az egyetlen Codex App Server tulajdonosa

### Kontextus és probléma

A bot jelenleg saját App Servert indít. A VS Code extension szintén saját App Servert indít. Ugyanaz a tárolt thread folytatható, de két külön élő runtime jön létre.

### Döntési hajtóerők

- pontosan egy valódi Codex App Server/agent;
- a stock VS Code Codex UI megtartása;
- élő stream és approval-folytonosság;
- explicit concurrency control;
- gyors és teljes rollback;
- ne épüljön VS Code privát belső API-ra;
- később legyen worker/NAS adapterrel bővíthető;
- helyi botleálláskor a VS Code alapfunkció maradjon használható.

### Vizsgált opciók

1. Két App Server megtartása, csak adatbázis-lockkal.
2. Közvetlen csatlakozás a VS Code extension privát child processzéhez vagy IPC-jéhez.
3. Egy külső socketes App Server, amelyhez minden kliens csatlakozik.
4. A VS Code `chatgpt.cliExecutable` pontján átlátszó stdio shim.
5. A VS Code extension bundle-jének patch-elése.
6. UI-automatizálás.

### Döntés

A választott opció: **4. átlátszó stdio shim**.

A shim a VS Code extension által várt executable-ként indul, majd pontosan egy valódi `codex app-server` child processzt indít. A VS Code-kéréseket és válaszokat továbbítja, a bot felől érkező engedélyezett műveleteket ugyanabba a downstream kapcsolatba multiplexeli, és a runtime/thread állapotot egy helyi gateway felé projektálja.

### Következmények

Pozitív:

- valóban egy downstream App Server fut;
- a VS Code és Discord ugyanazon runtime-ot használhatja;
- a shim látja mindkét irány protokollüzeneteit;
- origin alapján route-olhatók approval-k és user-input kérések;
- a bot nem függ a Codex privát adatbázisától az élő állapothoz;
- később a helyi gateway mögé Windows worker illeszthető.

Negatív:

- a `chatgpt.cliExecutable` fejlesztői beállítás és verzióérzékeny integrációs varrat;
- a JSON-RPC multiplexelés hibája a VS Code Codexet is érintheti;
- külön kompatibilitási mátrix és rollback szükséges;
- az élő VS Code renderelést ténylegesen bizonyítani kell;
- extensionfrissítés után újra kell futtatni a compatibility checket.

### Megerősítés

A döntés akkor igazolt, ha a G1–G6 capability gate-ek sikeresek, és a processzfa bizonyítja, hogy shared-runtime használatkor pontosan egy valódi `codex app-server` fut.

---

# 8. Ajánlott célarchitektúra

## 8.1. Fő komponensek

### 8.1.1. `CodexConnection`

**Felelősség:** a session-orchestráció leválasztása a konkrét Codex-processzkapcsolatról.

Javasolt interfész:

```text
CodexConnection
- start()
- stop()
- getCapabilities()
- listThreads()
- readThread()
- startThread()
- resumeThread()
- startTurn()
- steerTurn()
- interruptTurn()
- resolveApproval()
- resolveUserInput()
- subscribe()
- getRuntimeSnapshot()
```

Implementációk:

```text
SpawnedStdioCodexConnection       # jelenlegi működés, kompatibilitási fallback
SharedVscodeRuntimeConnection     # bot -> local gateway -> shim
FakeCodexConnection               # unit/integration tesztek
FutureWorkerCodexConnection       # későbbi NAS-fázis, most csak interfész
```

A jelenlegi singleton `codexAppServer` ne maradjon a domainlogika globális függősége. Dependency injection szükséges.

### 8.1.2. `VscodeCodexShim`

**Felelősség:** executable-kompatibilis, átlátszó közvetítő a VS Code extension és az egyetlen valódi App Server között.

Bemenetek:

- az extension által átadott CLI argumentumok;
- stdin JSON-RPC stream;
- helyi gateway command stream;
- konfigurált valódi Codex binary path.

Kimenetek:

- stdout JSON-RPC stream az extension felé;
- stderr diagnosztika;
- gateway runtime- és eventüzenetek;
- egyetlen child App Server.

Belső állapot:

- downstream request ID mapper;
- extension-origin request map;
- bot-origin request map;
- reverse-request routing map;
- aktuális runtime/thread/turn snapshot;
- origin surface;
- pending interactionök;
- control connection állapot.

Hibamódok:

- valódi Codex binary nem található;
- wrapper-recursion;
- inkompatibilis protokoll;
- hibás vagy túl nagy frame;
- App Server child leáll;
- local gateway nem elérhető;
- stale ownership/fencing token;
- approval owner eltűnik.

Fail-safe viselkedés:

- gateway nélkül a VS Code lokális működése folytatódjon;
- remote parancs ne hajtódjon végre hiteles gateway és érvényes lease nélkül;
- ismeretlen approval routing esetén deny;
- protokollinkompatibilitáskor a shim álljon le egyértelmű hibával, ne módosítson üzeneteket találomra.

### 8.1.3. `LocalControlGateway`

**Felelősség:** magas szintű, allowlistelt helyi control protokoll a bot és a shim között.

MVP transport prioritás:

1. Windows named pipe, ha az adott Node/Windows környezetben megbízhatóan és user-scope-ban működik.
2. Unix domain socket Linux/WSL alatt.
3. `127.0.0.1` ephemeral port + 256 bites capability token csak dokumentált fallbackként.

A gateway ne tegye elérhetővé a teljes nyers App Server JSON-RPC felületet. Engedélyezett műveletek:

- runtime regisztráció és heartbeat;
- runtime snapshot;
- thread discovery;
- ownership attach/release;
- turn start/steer/interrupt;
- approval resolve;
- user-input resolve;
- stream/event továbbítás;
- health és capability lekérdezés.

Minden command envelope tartalmazza:

```text
protocolVersion
messageId
correlationId
runtimeId
threadId
leaseId
fencingToken
timestamp
commandType
payload
```

### 8.1.4. `RuntimeRegistry`

**Felelősség:** online shim/runtime példányok nyilvántartása.

Nyilvántartandó:

- runtime ID;
- process ID és App Server child PID;
- host/platform;
- Codex CLI verzió;
- VS Code extension verzió, ha kimérhető;
- protokoll/schema fingerprint;
- workspace;
- aktív thread és turn;
- last heartbeat;
- capability-k;
- kapcsolat állapota.

A teljes privát elérési út ne kerüljön Discordra vagy általános logba. A felhasználói felület projektnevet vagy redaktált útvonalat jelenítsen meg.

### 8.1.5. `SessionOwnershipService`

**Felelősség:** annak garantálása, hogy egy threadbe egyszerre csak egy input surface adhasson új munkát.

Owner értékek:

```text
vscode
discord
worker
free
reconciliation_required
```

Szabályok:

- alapértelmezett owner: `vscode`;
- Discord csak explicit attach után indíthat új turnt;
- attach csak idle threadnél lehetséges;
- aktív turn, pending approval vagy pending user input mellett nincs automatikus takeover;
- minden lease-hez monoton növekvő fencing token tartozik;
- stale tokennel érkező parancs elutasítandó;
- release után owner visszaáll `vscode` vagy `free` állapotra;
- force-release admin művelet, aktív turn esetén előbb explicit interrupt és reconciliation szükséges;
- a shim az extensionből érkező `turn/start` kéréseket is ellenőrzi, nem csak a Discord-parancsokat.

### 8.1.6. `TaskQueueService`

**Felelősség:** tartós, threadenként soros feladatvégrehajtás.

A jelenlegi memóriabeli queue helyett SQLite repository szükséges.

Alapállapotok:

```text
created
queued
dispatching
running
waiting_for_approval
waiting_for_user_input
completed
failed
cancelled
timed_out
reconciliation_required
```

Követelmények:

- idempotency key;
- threadenként legfeljebb egy aktív task;
- restartbiztos queue;
- explicit retry policy;
- ismeretlen kimenetelnél nincs automatikus újrafuttatás;
- teljes audit state transitionök;
- a queue max továbbra is konfigurálható;
- a turn lezárása utáni dequeue tranzakciósan történjen.

### 8.1.7. `ApprovalAndInputRouter`

**Felelősség:** reverse request routing a turn eredete alapján.

Routing:

- VS Code-origin turn approvalja -> VS Code extension;
- Discord-origin turn approvalja -> Discord;
- worker-origin turn approvalja -> későbbi worker/control plane;
- ismeretlen vagy megszűnt owner -> deny/fail closed.

Minden interaction egyszer oldható fel. Dupla gombnyomás, timeout utáni válasz vagy stale UI action nem küldhet második downstream választ.

### 8.1.8. `DiscordSessionFacade`

**Felelősség:** a Discord commandok és a domain-orchestráció közti vékony adapter.

Ne kezeljen közvetlen App Server eseményeket vagy child processt.

---

# 9. Javasolt adatséma

A meglévő SQLite-adatbázisban verziózott migration runner bevezetése javasolt.

## 9.1. `schema_migrations`

```text
version
applied_at
checksum
```

## 9.2. `runtime_instances`

```text
runtime_id                 PK
runtime_kind               vscode_shim | spawned_bot | future_worker
host_id
process_id
app_server_process_id
platform
codex_version
extension_version
protocol_fingerprint
workspace_path
workspace_display_name
state                      online | offline | incompatible
active_thread_id
active_turn_id
last_heartbeat_at
created_at
updated_at
```

A `workspace_path` helyi adat; Discordra csak `workspace_display_name` menjen.

## 9.3. `thread_bindings`

```text
thread_id                  PK
project_id
runtime_id
source_kind
last_seen_at
last_known_status
created_at
updated_at
```

## 9.4. `session_leases`

```text
thread_id                  PK
owner_surface
owner_instance_id
lease_id                   UNIQUE
fencing_token
lease_state
acquired_at
renewed_at
expires_at
pending_interaction_type
updated_at
```

Lease acquisition és átadás `BEGIN IMMEDIATE` tranzakcióban, compare-and-set feltételekkel történjen.

## 9.5. `tasks`

```text
task_id                    PK
thread_id
project_id
channel_id
source_surface
requested_by
idempotency_key            UNIQUE
status
prompt_payload
result_summary
error_code
error_message
lease_id
fencing_token
created_at
queued_at
started_at
finished_at
retry_count
timeout_at
```

Javasolt részleges egyedi index:

```sql
CREATE UNIQUE INDEX ... ON tasks(thread_id)
WHERE status IN (
  'dispatching',
  'running',
  'waiting_for_approval',
  'waiting_for_user_input'
);
```

## 9.6. `pending_interactions`

```text
interaction_id             PK
runtime_id
thread_id
turn_id
request_id
interaction_type
routed_surface
status
expires_at
created_at
resolved_at
```

## 9.7. `task_events`

```text
event_id                   PK
task_id
runtime_id
thread_id
turn_id
correlation_id
event_type
actor_surface
safe_payload
created_at
```

A `safe_payload` nem tartalmazhat credentialt, teljes promptot, teljes privát útvonalat vagy nyers approval commandot.

---

# 10. Futásidejű forgatókönyvek

## 10.1. Normál VS Code használat, bot nélkül

1. A VS Code extension elindítja a shim executable-t `app-server` argumentummal.
2. A shim feloldja a valódi Codex binary útvonalát.
3. A shim ellenőrzi, hogy a valódi binary nem önmaga.
4. A shim elindít egyetlen `codex app-server` child processzt.
5. A VS Code stdin/stdout JSON-RPC forgalma változtatás nélkül átmegy.
6. Ha a bot/gateway nem elérhető, a shim csak lokális pass-through módban működik.
7. A VS Code felhasználó változatlanul dolgozhat.

## 10.2. Discord attach

1. A shim heartbeat alapján online runtime-ként látható.
2. `/session discover` megjeleníti a redaktált workspace-t és aktív threadet.
3. `/session attach` ellenőrzi:
   - a projekt-hozzárendelést;
   - a Discord authorizationt;
   - nincs aktív turn;
   - nincs pending interaction;
   - nincs más lease.
4. A bot tranzakciósan létrehozza a Discord lease-t és fencing tokent.
5. A gateway elküldi az attach parancsot a shimnek.
6. A shim csak egyező lease/fencing token esetén állítja át az input ownert.
7. A VS Code továbbra is observerként kapja az eseményeket.

## 10.3. Discordból indított turn

1. A Discord prompt tartós taskként `queued` állapotba kerül.
2. A dispatcher ellenőrzi az ownership-et.
3. A shim bot-origin request ID-t generál, és downstream `turn/start` kérést küld.
4. Az App Server eseményei:
   - továbbmennek a VS Code felé;
   - projektálódnak a gateway felé;
   - frissítik a task állapotát.
5. Az assistant stream a meglévő Discord formatteren keresztül jelenik meg.
6. Turn complete után a task lezárul, majd a következő queue-elem atomikusan kiválasztható.

## 10.4. VS Code input Discord ownership alatt

1. A VS Code extension `turn/start` kérést küld.
2. A shim felismeri az extension origin surface-t.
3. A shim ellenőrzi a thread ownerét.
4. Ha owner `discord`, a kérés nem mehet downstream.
5. A shim stabil JSON-RPC hibát ad vissza.
6. A gateway audit eseményt kap.
7. A hibaüzenet ne tartalmazzon tokent vagy belső útvonalat.

A capability spike során ellenőrizni kell, hogy a stock VS Code UI hogyan jeleníti meg ezt a hibát. Ha használhatatlan UX-et okoz, alternatív megoldás szükséges: queued input vagy explicit owner-visszaadás, de párhuzamos downstream turn akkor sem engedhető.

## 10.5. Discord-origin approval

1. Az App Server reverse approval requestet küld.
2. A shim a turn originje alapján Discord route-ot választ.
3. A request pending interactionként tartósan regisztrálódik.
4. Discordon csak jogosult felhasználó dönthet.
5. Az első érvényes döntés compare-and-set művelettel lezárja az interactiont.
6. A shim egyetlen választ küld downstream.
7. Timeout vagy gateway-kiesés esetén deny.
8. A VS Code megkapja a kapcsolódó állapoteseményeket, de nem kap második approval authorityt.

## 10.6. Botleállás

1. A shim elveszti a gateway kapcsolatot.
2. A downstream App Server és VS Code kapcsolat nem szakad meg.
3. Új remote command nem fogadható.
4. Discord-origin pending approval fail closed.
5. Aktív turn eseményei lokálisan továbbra is mennek a VS Code felé.
6. Újracsatlakozáskor a bot runtime snapshotot kér.
7. Bizonytalan task `reconciliation_required`, nem indul újra automatikusan.

## 10.7. Shim/App Server leállás

1. A shim offline runtime eseményt küld, ha lehetséges.
2. A lease és aktív task bizonytalan állapotba kerül.
3. Új task nem dispatch-elhető.
4. Új shim runtime új runtime ID-val regisztrál.
5. Thread/runtime egyezés után explicit reconciliation történik.
6. Stale runtime/fencing token parancsai elutasítandók.

---

# 11. Capability gate-ek

## G0 – Környezeti baseline

Rögzítsd szintetikus, titokmentes reportban:

- OS és architektúra;
- Node/npm verzió;
- Codex CLI verzió és binary path;
- VS Code verzió;
- Codex/ChatGPT extension verzió;
- `codex --help`;
- `codex app-server --help`;
- effektív `chatgpt.cliExecutable`;
- a VS Code Codex indítása előtti és utáni processzfa;
- elérhető hivatalos App Server schema-generation parancs;
- a protokollséma hash/fingerprintje.

Ne találj ki schema-generation commandot. A célverzió `--help` kimenetéből használd a tényleges parancsot.

**Gate feltétel:** baseline reprodukálható, nincs secret a reportban.

## G1 – Shim indíthatóság

Készíts minimális pass-through shim spike-ot, amely:

- nem injektál botkérést;
- minden extension argumentumot naplóz redaktált formában;
- elindítja a valódi Codex binaryt;
- byte-/frame-szinten helyesen továbbít;
- a VS Code-ban új és meglévő chatet is kezel.

**Gate feltétel:** a stock VS Code Codex funkció regresszió nélkül használható, és a processzfa egyetlen valódi App Servert mutat.

**Sikertelenség:** állj meg; állítsd vissza a VS Code beállítást; ne patch-eld az extension bundle-t.

## G2 – Protokollmegfigyelés

A shim passzívan azonosítsa:

- initialize;
- thread start/resume/read/list;
- turn start/interrupt/complete;
- stream notificationök;
- approval reverse request;
- user-input reverse request;
- hibaválaszok.

**Gate feltétel:** a parser nem módosítja a VS Code felé menő payloadot, és a megfigyelt események sémája tesztelt.

## G3 – Ugyanazon runtime-ba történő külső turnindítás

Szintetikus workspace-ben, explicit attach után a helyi test client indítson turnt a shim gatewayen keresztül.

Ellenőrizd:

- ugyanaz az App Server PID;
- ugyanaz a thread ID;
- nincs második `codex app-server`;
- a VS Code megkapja a turn eseményeit;
- a Discord/test client megkapja a streamet;
- a turn eredménye ugyanabban a thread historyban jelenik meg.

**Gate feltétel A:** a VS Code-panel élőben rendereli a külső turnt.  
**Gate feltétel B – korlátozott siker:** ugyanaz a runtime/thread működik, de a panel csak refresh után frissül.

A B eredményt ne minősítsd teljes élő megoldásnak. Dokumentáld, és kérj architekturális döntést a továbblépés előtt.

## G4 – Concurrency enforcement

Indíts közel egyidejű `turn/start` kérést VS Code-ból és a test clientből.

**Gate feltétel:** pontosan egy kérés jut downstream; a másik determinisztikusan queue-zódik vagy elutasításra kerül; nincs két aktív turn.

## G5 – Approval routing

Futtass szintetikus approvalt igénylő eseteket mindkét origin surface-ről.

**Gate feltétel:** minden request pontosan egy authorityhoz kerül, egyszer oldható fel, timeoutkor deny.

## G6 – Recovery

Teszteld:

- bot restart;
- gateway disconnect/reconnect;
- shim restart;
- App Server child crash;
- stale lease;
- stale fencing token;
- pending approval alatti kapcsolatvesztés;
- queue restart.

**Gate feltétel:** nincs duplikált végrehajtás, nincs automatikus approval, bizonytalan eset `reconciliation_required`.

---

# 12. Lépésenkénti implementációs terv

## Fázis 0 – Baseline, threat model és rollback

### T-001 – Környezeti evidence report

**Cél:** a célgépen ténylegesen futó Codex/VS Code topológia bizonyítása.

**Érintett komponensek:**

- új diagnosztikai CLI vagy script a `src/cli/` vagy `scripts/` alatt;
- dokumentáció;
- nincs üzleti logika módosítás.

**Elvárt output:**

- redaktált JSON/Markdown report;
- processzfa;
- verzió- és schema fingerprint;
- feature/capability matrix.

**Tesztek/checkek:**

- report schema unit test;
- token/path redaction test;
- Windows szintetikus futtatás.

**Függőség:** nincs.

**Done:**

- G0 teljesül;
- report nem tartalmaz Discord tokent, Codex authot vagy valós privát adatot;
- rollbackhez az eredeti VS Code setting rögzítve van.

### T-002 – ADR és threat model rögzítése

**Cél:** a shim döntés, biztonsági határok és leállási szabályok dokumentálása.

**Érintett komponensek:** ez a terv vagy a repository meglévő ADR-helye.

**Elvárt output:**

- ADR-01 elfogadott/proposed státusszal;
- trust boundary diagram;
- abuse case lista.

**Tesztek/checkek:** dokumentum review, `npm run plans:check`.

**Done:** a magas kockázatú feltételezések és gate-ek explicit módon dokumentáltak.

---

## Fázis 1 – Codex-réteg leválasztása viselkedésváltozás nélkül

### T-101 – `CodexConnection` interfész

**Cél:** a `SessionManager` ne függjön a globális `codexAppServer` singletontól.

**Érintett komponensek:**

- `src/codex/app-server-client.ts`;
- `src/codex/session-manager.ts`;
- új `src/codex/connections/` modulok;
- meglévő tesztek.

**Elvárt output:**

- interface;
- `SpawnedStdioCodexConnection`;
- dependency injection;
- változatlan jelenlegi működés.

**Tesztek/checkek:**

- meglévő `session-manager.test.ts`;
- fake connection unit tesztek;
- lifecycle start/stop/error tesztek.

**Függőség:** T-001.

**Done:**

- nincs globális singleton a domainlogikában;
- legacy spawned mode változatlanul működik;
- `npm run check` sikeres.

### T-102 – Discord adapter és orchestrációs mag határ

**Cél:** a session/queue/approval domainállapot ne tartalmazzon Discord-specifikus objektumokat.

**Érintett komponensek:**

- `src/codex/session-manager.ts`;
- `src/bot/client.ts`;
- `src/bot/handlers/interaction.ts`;
- új `src/orchestration/`;
- formatter/presenter adapterek.

**Elvárt output:**

- domain eventek;
- Discord presenter;
- Codex event -> domain event -> Discord output lánc.

**Tesztek/checkek:**

- unit tesztek Discord mock nélkül az orchestrációra;
- meglévő command tesztek regressziója.

**Done:** Codex-orchestráció tesztelhető `discord.js` nélkül.

---

## Fázis 2 – Átlátszó VS Code shim

### T-201 – Shim entry point és valódi Codex binary feloldás

**Cél:** külön buildelhető shim process role.

**Javasolt fájlok:**

```text
src/shim/index.ts
src/shim/real-codex-resolver.ts
src/shim/process-lifecycle.ts
src/shim/config.ts
```

**Követelmények:**

- nem `app-server` parancsnál delegáljon a valódi Codex CLI-nak;
- `app-server` parancsnál indítsa a child processzt;
- őrizze meg az argumentumok sorrendjét;
- ne használjon shell string concatot;
- ellenőrizze a recursiont;
- kezelje a signalokat és child exitet;
- a shim és a real binary path külön legyen.

**Tesztek/checkek:**

- argumentum passthrough;
- path with spaces;
- recursion rejection;
- missing binary;
- child exit code propagation;
- Windows `.cmd`/executable launch spike.

**Done:** G1 minimális pass-through változata fut.

### T-202 – JSON-RPC stream codec

**Cél:** chunk-safe, limitált és tesztelt protokollfeldolgozás.

**Javasolt fájlok:**

```text
src/codex/protocol/json-rpc-types.ts
src/codex/protocol/stream-codec.ts
src/codex/protocol/schema-guards.ts
```

**Követelmények:**

- a cél Codex-verzió tényleges framingjét használja;
- részleges chunk és több frame/chunk kezelése;
- max frame size;
- UTF-8 hibakezelés;
- ismeretlen notification továbbítása;
- megfigyelés nem változtathatja meg az eredeti üzenetet;
- a schema guard ne dobja el az új, ismeretlen mezőket.

**Tesztek/checkek:**

- split every byte boundary;
- több frame egy chunkban;
- malformed frame;
- oversized frame;
- Unicode;
- request/response/notification/reverse request;
- property/fuzz jellegű generált esetek, ha a meglévő toolchainnel egyszerűen megoldható.

**Done:** G2 parser-része teljesül.

### T-203 – Request ID namespace és routing

**Cél:** a VS Code- és bot-origin requestek ne ütközzenek.

**Javasolt fájlok:**

```text
src/shim/request-router.ts
src/shim/request-id-map.ts
src/shim/reverse-request-router.ts
```

**Követelmények:**

- downstream ID-k belső namespace-ben;
- eredeti extension ID visszaállítása;
- bot request response a gatewaynek;
- timeout cleanup;
- duplicate response elutasítás;
- reverse request egyszeri resolution;
- reconnectkor régi map érvénytelenítése.

**Tesztek/checkek:**

- azonos upstream numeric ID két surface-ről;
- out-of-order response;
- timeout;
- duplicate response;
- child restart;
- reverse request routing.

**Done:** nincs ID-collision vagy response leakage.

---

## Fázis 3 – Helyi control gateway és runtime discovery

### T-301 – Versionált local control protocol

**Cél:** szűk, magas szintű control API.

**Javasolt fájlok:**

```text
src/control/protocol.ts
src/control/messages.ts
src/control/auth.ts
src/control/server.ts
src/control/client.ts
```

**Követelmények:**

- Zod schema;
- protocol version negotiation;
- capability token;
- timestamp/skew ellenőrzés;
- message ID deduplikáció;
- command allowlist;
- payload size limit;
- rate limit/bounded queue;
- backpressure;
- generic raw App Server call tiltása.

**Tesztek/checkek:**

- invalid token;
- expired/replayed message;
- unknown command;
- oversized payload;
- queue overload;
- reconnect/backoff;
- no secret in error/log.

**Done:** a shim és bot szintetikus gatewayen kommunikál.

### T-302 – Runtime registry és heartbeat

**Cél:** az online VS Code shim példányok biztonságos discovery-je.

**Érintett komponensek:**

- `src/db/database.ts`, `src/db/types.ts`;
- új migration/repository;
- shim runtime snapshot;
- orchestráció.

**Elvárt output:**

- runtime register/update/offline;
- active workspace/thread/turn snapshot;
- process/version metadata;
- stale runtime cleanup.

**Tesztek/checkek:**

- reconnect ugyanazzal és új runtime ID-val;
- heartbeat timeout;
- két runtime;
- path redaction;
- stale runtime nem attach-elhető.

**Done:** `/session discover` backendje Discord nélkül tesztelhető.

---

## Fázis 4 – Ownership, fencing és tartós queue

### T-401 – Verziózott DB migration framework

**Cél:** biztonságos, tesztelhető sémabővítés.

**Követelmények:**

- `schema_migrations`;
- tranzakció;
- checksum;
- idempotens startup;
- backup/rollback dokumentáció;
- in-memory SQLite tesztek.

**Done:** régi adatbázis migrálható, új adatbázis tisztán létrejön.

### T-402 – Session lease repository

**Cél:** atomikus ownership.

**Követelmények:**

- acquire/renew/release;
- monoton fencing token;
- compare-and-set;
- stale lease kezelés;
- `BEGIN IMMEDIATE`;
- aktív interaction mellett takeover tiltás;
- audit event.

**Tesztek/checkek:**

- két párhuzamos acquire;
- stale fencing;
- lease timeout;
- release másik owner által;
- admin force-release;
- DB restart.

**Done:** egy threadnek egyszerre legfeljebb egy input ownere van.

### T-403 – Tartós taskqueue

**Cél:** a memóriabeli promptqueue kiváltása.

**Követelmények:**

- enqueue/dequeue tranzakció;
- unique idempotency key;
- one-active-task-per-thread invariant;
- FIFO azonos prioritásnál;
- queue max;
- explicit cancel;
- restart reconciliation;
- nincs automatikus replay bizonytalan state-nél.

**Tesztek/checkek:**

- restart queued taskkal;
- duplicate message;
- concurrent dequeue;
- active turn alatt új prompt;
- cancel;
- timeout;
- queue max.

**Done:** a session manager memóriabeli queue-jának nincs authority szerepe.

---

## Fázis 5 – Shared runtime turnvezérlés

### T-501 – Thread és active-turn megfigyelés

**Cél:** a shim valós időben ismerje az aktív threadet és turnt.

**Követelmények:**

- thread start/resume/focus;
- turn started/completed/interrupted/failed;
- runtime snapshot frissítés;
- ismeretlen állapotnál `reconciliation_required`;
- nincs közvetlen Codex DB írás.

**Tesztek/checkek:**

- threadváltás;
- új thread;
- resume;
- több notification sorrend;
- hiányzó complete event;
- child restart.

**Done:** runtime snapshot konzisztens a szintetikus App Serverrel.

### T-502 – Bot-origin `turn/start`

**Cél:** ugyanabba a downstream App Serverbe indított remote turn.

**Követelmények:**

- érvényes lease/fencing;
- idle thread;
- idempotency;
- origin binding;
- task/turn correlation;
- stream projection;
- response routing.

**Tesztek/checkek:**

- happy path;
- stale token;
- owner mismatch;
- duplicate submit;
- App Server error;
- overload/backpressure;
- interrupt.

**Done:** G3 szintetikus integráció teljesül.

### T-503 – VS Code-origin concurrency guard

**Cél:** Discord ownership alatt a VS Code se tudjon párhuzamos turnt indítani.

**Követelmények:**

- extension `turn/start` intercept;
- determinisztikus reject vagy queue policy;
- biztonságos hiba;
- audit;
- owner release után normál működés.

**Tesztek/checkek:**

- közel egyidejű VS Code/Discord start;
- két VS Code start;
- owner switch;
- queued follow-up;
- current turn steer policy.

**Done:** G4 teljesül.

### T-504 – Steer és interrupt policy

**Cél:** külön kezelni az új turnt, a steer/follow-up inputot és a stopot.

**Szabályok:**

- steer csak az aktív turn origin ownere vagy explicit policy alapján;
- másik surface inputja alapból queue;
- interrupt csak jogosult owner/admin;
- interrupt után reconciliation a complete/interrupt eventig;
- queue ürítése explicit parancs legyen.

**Done:** nincs implicit cross-surface steer.

---

## Fázis 6 – Approval és user-input routing

### T-601 – Pending interaction state machine

**Cél:** reverse requestek tartós, egyszeri feloldása.

**Követelmények:**

- request origin/turn binding;
- single-resolution CAS;
- timeout;
- stale button;
- reconnect;
- deny-on-unknown;
- biztonságos audit.

**Tesztek/checkek:**

- approve/reject;
- két egyidejű döntés;
- timeout;
- bot disconnect;
- owner switch;
- mismatched turn;
- malformed response.

**Done:** G5 teljesül.

### T-602 – Discord approval és question adapter frissítése

**Cél:** a meglévő Discord UI a domain interaction service-t használja.

**Érintett komponensek:**

- `src/bot/handlers/interaction.ts`;
- approval/question helper;
- session managerből kivont mapek.

**Done:** nincs process-local pending map mint egyetlen source of truth.

### T-603 – VS Code-origin reverse request pass-through

**Cél:** a normál VS Code approval UX változatlan maradjon.

**Tesztek/checkek:**

- VS Code-origin approval byte-/schema-paritása;
- Discord observer nem tudja megválaszolni;
- gateway nélkül is működik.

**Done:** shim nem rontja a helyi approval flow-t.

---

## Fázis 7 – Discord parancsok és telepíthetőség

### T-701 – Session commandok

Bővítsd a meglévő commandfelületet:

```text
/session discover
/session attach
/session release
/session owner
/session force-release
```

Megőrzendő kompatibilitás:

```text
/session current
/session new
/session stop
/sessions
/queue
/status
```

**UX-szabályok:**

- nincs implicit attach az első promptnál shared-runtime módban;
- aktív turn esetén attach elutasítva;
- owner és runtime mindig látható;
- force-release admin-only;
- force-release aktív turnnél ne fusson automatikus interrupt nélkül;
- privát path, token, PID csak admin diagnosztikában és redaktálva.

**Tesztek/checkek:**

- authorization;
- owner állapotok;
- offline runtime;
- stale interaction;
- multiple runtime ambiguity;
- help text.

### T-702 – VS Code shim install/uninstall

**Cél:** biztonságos beállítás és teljes rollback.

Első MVP-ben csak local desktop VS Code támogatott.

Követelmények:

- ellenőrizze az extension telepítését és verzióját;
- készítsen backupot az érintett settingről;
- ne írja át a felhasználó teljes settings fájlját formázásvesztéssel;
- állítsa be a `chatgpt.cliExecutable` értéket;
- rögzítse a valódi Codex binary pathot külön konfigurációban;
- uninstall pontosan az eredeti értéket állítsa vissza;
- extensionfrissítés után compatibility check;
- dry-run mód;
- egyértelmű `doctor` output.

Ne vezess be automatikus extension-bundle patch-et.

**Done:** install, health check és uninstall szintetikus user profile-lal tesztelt.

### T-703 – Runtime mode konfiguráció

Javasolt konfiguráció:

```text
CODEX_CONNECTION_MODE=spawned|vscode-shared
ATYS_CONTROL_TRANSPORT=auto|pipe|unix|loopback
ATYS_CONTROL_ENDPOINT=<local-only>
ATYS_CONTROL_TOKEN_FILE=<user-scoped path>
CODEX_REAL_BINARY=<absolute path>
CODEX_PROTOCOL_COMPATIBILITY=exact|warn|deny
```

A secret/token ne kerüljön source controlba. A konfiguráció deployonként változó része környezeti vagy user-scoped state legyen.

Kezdetben a `spawned` maradjon default, a `vscode-shared` explicit opt-in. A default csak a teljes acceptance után változhat.

---

## Fázis 8 – Hardening, recovery és release

### T-801 – Process lifecycle és orphan prevention

**Cél:** shim, App Server és bot restartok kontrollált kezelése.

**Tesztek/checkek:**

- VS Code bezárás;
- shim SIGTERM/Windows termination;
- App Server crash;
- bot crash;
- többszöri extension restart;
- nincs orphan child;
- exit code és stderr diagnosztika.

### T-802 – Biztonsági hardening

Követelmények:

- no public listener;
- capability token legalább 128 bit, javasolt 256 bit CSPRNG;
- user-scoped token file;
- strict message schema;
- command allowlist;
- path allowlist;
- bounded queue és rate limit;
- timeout és korlátozott retry;
- log injection elleni strukturált logging;
- secret/path redaction;
- approval fail closed;
- nincs nyers arbitrary command API;
- nincs auto-approve default;
- nincs private Codex DB write;
- dependency audit és secret scan.

### T-803 – Compatibility matrix

Dokumentáld:

```text
OS
VS Code version
Codex extension version
Codex CLI version
schema fingerprint
shim version
G1-G6 result
known limitations
rollback steps
```

Exact compatibility módban ismeretlen fingerprint esetén a remote control legyen letiltva, de a local VS Code passthrough lehetőleg maradjon használható.

### T-804 – Release gate

Kötelező:

```text
npm run plans:check
npm run lint
npm run typecheck
npm test
npm run build
npm run check
npm run secret:scan
```

A secret scan csak a repository szabályai szerint, valódi credential nélkül fusson.

---

# 13. Szintetikus validációs csomag

Hozz létre repository-konvencióhoz illeszkedő tesztcsomagot, például:

```text
test/fixtures/shared-codex-runtime/
├── README.md
├── manifest.json
├── fake-workspace/
│   ├── README.md
│   └── synthetic.txt
├── app-server-traces/
│   ├── initialize.jsonl
│   ├── thread-start.jsonl
│   ├── turn-stream.jsonl
│   ├── approval.jsonl
│   ├── user-input.jsonl
│   ├── malformed.jsonl
│   └── overload.jsonl
└── expected/
    ├── runtime-snapshot.json
    ├── audit-events.json
    └── task-transitions.json
```

A `README.md` vagy `manifest.json` minden esetre írja le:

- case ID;
- bemenet;
- kiinduló owner;
- elvárt downstream requestek;
- elvárt surface routing;
- elvárt DB-state;
- elvárt audit;
- elvárt hiba;
- secret/path redaction elvárás.

## 13.1. Minimális esetkészlet

| ID | Eset | Elvárt eredmény |
|---|---|---|
| SYN-01 | VS Code-only pass-through | változatlan protokoll, nincs botinjektálás |
| SYN-02 | Discord attach idle threadre | lease és fencing token létrejön |
| SYN-03 | Attach aktív turn alatt | elutasítás |
| SYN-04 | Discord turn | egy downstream start, stream mindkét felületre |
| SYN-05 | VS Code start Discord ownership alatt | nem jut downstream |
| SYN-06 | Közel egyidejű start | pontosan egy aktív turn |
| SYN-07 | Discord approval approve | egy downstream response |
| SYN-08 | Approval dupla kattintás | második stale |
| SYN-09 | Approval timeout | deny |
| SYN-10 | Bot disconnect aktív turn alatt | nincs duplikált replay |
| SYN-11 | Shim restart | reconciliation |
| SYN-12 | App Server crash | task bizonytalan/failed, nincs automatikus újrafuttatás |
| SYN-13 | Stale fencing token | reject |
| SYN-14 | Duplicate idempotency key | egy task |
| SYN-15 | Malformed frame | kontrollált hiba |
| SYN-16 | Oversized payload | reject |
| SYN-17 | Invalid local auth | reject és audit |
| SYN-18 | Secret a hibaüzenetben | redaktált log/output |
| SYN-19 | Queue restart | queued task megmarad |
| SYN-20 | Uninstall | eredeti VS Code setting helyreáll |

## 13.2. Valódi runtime E2E

A valódi Codex E2E csak szintetikus workspace-szel és ártalmatlan prompttal történjen. Ne használjon valós ügyanyagot, privát projektet, credentialt vagy személyes adatot.

Példa elvárt művelet:

- szintetikus könyvtárban hozzon létre vagy módosítson egy `synthetic-result.txt` fájlt;
- a prompt és az expected diff legyen a fixture README-ben;
- rögzítsd a processzfa, thread ID, turn ID és UI-megfigyelés redaktált eredményét;
- ne commitold a Codex auth state-et vagy teljes rollout logot.

A VS Code élő megjelenítés minősége emberi ellenőrzést igényelhet, de a processz-, protokoll-, DB- és concurrency eredmények legyenek automatizáltak.

---

# 14. Biztonság, adatvédelem és retention

## 14.1. Releváns ASVS-területek

A megvalósítás során legalább az alábbi elveket kell konkrét tesztekkel lefedni:

- OS command injection megelőzése: argumentumtömb, nem shell string;
- input validation és dokumentált limitek;
- üzleti folyamatok sorrendje és locking;
- anti-automation/rate limit a local control endpointon;
- trusted service layeren végzett authorization;
- backend komponensek erős, least-privilege hitelesítése;
- timeout, retry és resource management dokumentálása;
- secret management;
- safe concurrency és TOCTOU-védelem;
- strukturált security logging;
- log integritás és secret-redaction;
- fail-secure error handling.

## 14.2. Naplózási szabályok

Logolható:

- timestamp explicit timezone-nal;
- runtime/thread/turn/task correlation ID;
- event type;
- owner surface;
- state transition;
- safe error code;
- duration és retry count.

Nem logolható:

- Discord bot token;
- Codex auth token/session secret;
- local capability token;
- teljes prompt alapértelmezetten;
- approval command teljes tartalma;
- teljes privát fájlrendszerút Discordra;
- fájlok tartalma;
- környezeti secret.

## 14.3. Retention

Az MVP-ben dokumentáld:

- task/audit esemény retention;
- runtime heartbeat adatok törlése;
- pending interaction cleanup;
- redaktált diagnosztikai report retention;
- queue completed/failed rekordok archiválása vagy törlése.

Ne adj önkényes végleges időtartamot üzleti döntés nélkül. Legyen konfigurálható és alapértelmezetten adatminimalizáló.

---

# 15. Kockázatok és mitigációk

| Kockázat | Súly | Mitigáció |
|---|---:|---|
| `chatgpt.cliExecutable` megváltozik vagy megszűnik | magas | G1 minden támogatott verzión; exact compatibility; gyors uninstall |
| Shim hiba miatt a VS Code panel nem indul | magas | minimális pass-through először; watchdog nélküli egyszerű lifecycle; rollback |
| A VS Code nem rendereli élőben a bot-origin turnt | magas | G3 külön acceptance; korlátozott siker explicit; ne állítsuk, hogy élő |
| JSON-RPC ID collision | magas | origin namespace, request map, out-of-order tesztek |
| Rossz felület válaszol approvalra | magas | turn-origin binding, single-resolution CAS, fail closed |
| Két aktív turn race miatt | magas | shim oldali guard + DB unique invariant + fencing token |
| Stale lock botcrash után | közepes | lease TTL, heartbeat, explicit reconciliation |
| Extensionfrissítés protokollt tör | magas | schema fingerprint, compatibility matrix, remote-control deny |
| Wrapper recursion | magas | real binary canonical path és self-check |
| App Server child orphan marad | közepes | lifecycle teszt, process cleanup, startup doctor |
| Local IPC más user számára elérhető | közepes | user-scope transport/token, no public bind, ACL vizsgálat |
| Privát Codex DB-séma változik | közepes | runtime authority a shim; private DB write eltávolítása |
| Több VS Code-window összekeveredik | közepes | MVP-ben egy runtime/workspace; runtime ID; ambiguity reject |
| NAS-scope túl korai beépítése | közepes | csak interface seam, nincs hálózati worker most |
| Külső referencia kód licencproblémája | közepes | csak viselkedési referencia; code reuse előtt licenc review |

---

# 16. Rollbackpontok

## R0 – Implementáció előtti rollback

- új Git branch;
- tiszta working tree;
- aktuális `chatgpt.cliExecutable` export/backup;
- Codex/VS Code verzió report;
- adatbázis backup.

## R1 – Shim spike rollback

- VS Code bezárása;
- `chatgpt.cliExecutable` eredeti értékének visszaállítása vagy eltávolítása;
- shim processzek leállítása;
- esetleges temp state törlése;
- stock extension újraindítása;
- processzfa ellenőrzése.

## R2 – DB migration rollback

- migration előtt backup;
- csak additive migration az MVP-ben;
- régi kód számára is tolerálható új táblák;
- destructive column/table removal tilos ugyanabban a release-ben.

## R3 – Feature rollback

- `CODEX_CONNECTION_MODE=spawned`;
- shared-runtime commandok letiltása;
- legacy bot működés megtartása;
- shared-runtime DB rekordok read-only megőrzése elemzéshez.

A rollback nem törölhet Codex threadet vagy rolloutot.

---

# 17. Elfogadási kritériumok

## Funkcionális

- [ ] A stock VS Code Codex extension a shimen keresztül elindul és használható.
- [ ] Shared-runtime módban a bot nem indít saját App Servert.
- [ ] A processzfa pontosan egy valódi `codex app-server` folyamatot mutat a cél VS Code runtime-hoz.
- [ ] Discord `/session discover` megtalálja a cél runtime-ot.
- [ ] Explicit attach után ugyanaz a thread ID vezérelhető.
- [ ] Discord prompt ugyanazon App Server PID-en fut.
- [ ] A VS Code legalább konzisztensen látja az eredményt; az élő render külön G3-A kritérium.
- [ ] Release után a VS Code ismét input owner.
- [ ] Stop/interrupt a megfelelő aktív turnt szakítja meg.
- [ ] Queue restart után megmarad.

## Concurrency

- [ ] Egy threadben legfeljebb egy aktív turn.
- [ ] Közel egyidejű VS Code/Discord startból pontosan egy jut downstream.
- [ ] Stale lease/fencing parancs nem hajtódik végre.
- [ ] Duplikált Discord delivery nem indít duplikált turnt.

## Approval és user input

- [ ] Turn-origin alapján egyetlen authority.
- [ ] Dupla válasz elutasítva.
- [ ] Timeout fail closed.
- [ ] Kapcsolatvesztés nem eredményez implicit approvalt.

## Biztonság

- [ ] Nincs public listener.
- [ ] Nincs arbitrary raw RPC vagy remote shell.
- [ ] Nincs Codex private DB write.
- [ ] Nincs token/secret a logokban.
- [ ] Path validation a jelenlegi `BASE_PROJECT_DIR` politikával kompatibilis.
- [ ] Auto-approve default továbbra is tiltott.
- [ ] Install/uninstall backupolt és visszafordítható.

## Minőség

- [ ] `npm run check` sikeres.
- [ ] Secret scan sikeres.
- [ ] Szintetikus fixture package README/manifest elkészült.
- [ ] G0–G6 eredmények dokumentáltak.
- [ ] Windows E2E eredmények mentve.
- [ ] A terv státuszblokkja frissítve.
- [ ] A compatibility matrix elkészült.
- [ ] A rollbacket ténylegesen kipróbálták.

---

# 18. Későbbi NAS/24-7 irányítási kapu

A mostani megvalósításban a `LocalControlGateway` és a `SharedVscodeRuntimeConnection` határa legyen az a seam, amely mögé később Windows Worker kerülhet.

Későbbi topológia:

```text
Discord
   |
NAS Control Plane
   |
   | outbound-authenticated worker channel
   v
Windows Worker
   |
Local Control Gateway
   |
VS Code Codex Shim
   |
egyetlen helyi App Server
```

A későbbi worker:

- kifelé csatlakozzon a NAS-hoz;
- ne nyisson általános inbound shellt;
- mTLS- vagy hasonló kölcsönös hitelesítést használjon;
- message ID, task ID, correlation ID és timestamp alapján védjen replay ellen;
- ugyanazt az ownership/fencing modellt használja;
- csak allowlistelt magas szintű műveleteket fogadjon;
- helyben ellenőrizze a projektútvonalat és az authorization contextet;
- offline esetben tartós taskállapotot és reconciliationt használjon.

A NAS nem lehet a Windows workspace közvetlen fájlrendszer-tulajdonosa, és ne indítson Codexet a Windows projekt helyett.

---

# 19. Javasolt végső report sorrend a Codex-agent számára

A megvalósítás vagy egy lezárt fázis végén a report ebben a sorrendben készüljön:

1. **Összefoglaló**
   - mely fázis készült el;
   - teljesült-e az „egy valódi App Server” cél;
   - mely gate-ek sikeresek.

2. **Feltárt valós környezet**
   - redaktált verziók;
   - processztopológia;
   - protokoll fingerprint.

3. **Módosított fájlok**
   - fájlonként rövid felelősség és változás.

4. **Architekturális eredmény**
   - shim/gateway/ownership/queue állapot;
   - eltérések a tervtől és indoklásuk.

5. **Biztonsági eredmény**
   - auth, path policy, approval routing, logging, secret kezelés.

6. **Automatizált tesztek**
   - parancs;
   - exit code;
   - összefoglaló.

7. **Szintetikus E2E**
   - case ID-k;
   - elvárt és megfigyelt eredmény;
   - mentett reporthely.

8. **Capability gate-ek**
   - G0–G6: pass/fail/blocked;
   - bizonyíték;
   - G3-A vagy G3-B eredmény.

9. **Rollback-próba**
   - végrehajtott lépések;
   - megfigyelt eredmény.

10. **Nyitott kockázatok és blokkolók**
    - csak konkrét, bizonyítékhoz kötött elemek.

11. **Tervstátusz**
    - `Elkészült részek`;
    - `Nyitott részek`;
    - következő egyetlen konkrét lépés.

---

# 20. Első konkrét végrehajtási lépés

Ne kezdd a teljes refaktort.

Először hajtsd végre a **T-001 + T-201 minimális capability spike-ot** egy külön branchben:

1. rögzítsd a cél Codex CLI és VS Code extension verzióját;
2. mentsd az eredeti `chatgpt.cliExecutable` értéket;
3. készíts minimális, bot nélküli pass-through shim prototípust;
4. állítsd be ideiglenesen a VS Code extensiont erre a shimre;
5. igazold, hogy a stock VS Code chat változatlanul működik;
6. processzfával igazold, hogy a shim pontosan egy valódi App Servert indít;
7. futtasd az uninstall/rollbacket;
8. mentsd a redaktált eredményt;
9. csak G1 siker után indulhat a teljes architekturális refaktor.

---

# 21. Felhasznált források

## Repository és koncepció

- `Attys-syttA/Attys_DC_BOT`
- `docs/codex-tasks/plans/pending/not-started/attys-dc-bot-nas-architecture-concept.md`
- `src/codex/app-server-client.ts`
- `src/codex/session-manager.ts`
- `src/codex/storage.ts`
- `src/db/database.ts`
- `src/bot/commands/session.ts`
- `src/bot/commands/sessions.ts`
- `src/bot/commands/queue.ts`
- `src/bot/handlers/interaction.ts`
- `AGENTS.md`
- `package.json`

## Hivatalos Codex-források

- https://developers.openai.com/codex/app-server
- https://developers.openai.com/codex/developer-commands
- https://developers.openai.com/codex/developer-settings
- https://developers.openai.com/codex/config-basic

## Nyilvános referenciaimplementációk és problémaleírások

- https://github.com/kxn/codex-remote-feishu
- https://docs.ony.ai/guides/codex
- https://github.com/openai/codex/issues/34109
- https://github.com/openai/codex/issues/35679
- https://github.com/openai/codex/issues/23572

A nyilvános projektek viselkedési és architekturális referenciák. Forráskód átvétele előtt külön licencellenőrzés kötelező.

## Átadott tervezési és biztonsági segédanyagok

- `arc42-template-HU.md`
- `adr-template.md`
- `OWASP Application Security Verification Standard 5.0.0`
- `The Twelve Factors`

A terv az arc42 releváns nézeteit, ADR döntési szerkezetet, ASVS security-verification szemléletet és a Twelve-Factor konfiguráció/processz/logging elveit alkalmazza, de nem próbálja a teljes szabványkészletet mechanikusan ráerőltetni az MVP-re.
