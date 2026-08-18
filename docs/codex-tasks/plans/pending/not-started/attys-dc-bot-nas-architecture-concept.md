# Attys_DC_BOT_NAS – fejlesztési koncepció és architekturális átadás

> 2026-08-18 superseded note: ezt a tervet ne indítsd külön `Attys_DC_BOT_NAS` source-of-truth irányként. A jelenlegi döntés szerint az `Attys_DC_BOT` az egyetlen aktív repo a Discord bothoz, BotOps contracthoz, NAS handoff/control-plane helperhez és korlátozott Windows/NAS worker execution réteghez. Ez a dokumentum történeti/reference anyag marad; belőle csak kontrolláltan átvett ötletek kerülhetnek az aktív `Attys_DC_BOT` tervbe.

## 1. Kiinduló helyzet

Két kapcsolódó repository létezik:

* `Attys-syttA/Attys_DC_BOT`
* `Attys-syttA/Attys_DC_BOT_NAS`

Az `Attys_DC_BOT` jelenleg egy helyi, Discord-alapú Codex vezérlőfelület. A bot:

* Discord-csatornát rendel helyi projekthez;
* Codex-sessiont indít vagy folytat;
* promptokat küld;
* feladatokat sorba állít;
* jóváhagyásokat kezel;
* felhasználói kérdéseket továbbít;
* állapotot, eseményeket és naplókat jelenít meg;
* helyi `codex app-server` folyamatot indít.

Az `Attys_DC_BOT_NAS` jelenleg nagyrészt ennek klónja, de ez lesz továbbfejlesztve NAS-kompatibilis, 24/7 működő vezérlőréteggé.

## 2. Infrastrukturális környezet

A célhardver:

* Synology DS925+ NAS;
* 24/7 üzem;
* Docker/Container Manager használata;
* a korábbi NAS már futtatott botokat, de gyenge volt komolyabb konténerekhez;
* a DS925+ alkalmasabb tartós szolgáltatások futtatására.

A Windows PC-n találhatók:

* a fejlesztési repositoryk;
* VS Code;
* Codex CLI és Codex VS Code-integráció;
* helyi fejlesztői eszközök;
* Windows-specifikus build- és tesztkörnyezetek.

## 3. Jelenlegi fő probléma

Az `Attys_DC_BOT` nem közvetlenül a VS Code-ban futó aktív Codex-sessionhoz kapcsolódik.

A bot:

1. saját `codex app-server` folyamatot indít;
2. képes helyi, akár VS Code-ból származó Codex-threadeket felismerni;
3. ezeket saját app-server folyamatán keresztül folytatja.

Ez azt jelenti, hogy ugyanaz a tárolt thread folytatható, de nem ugyanaz az élő VS Code Codex-példány működik tovább.

Az MCP önmagában ezt nem oldja meg, mert az MCP eszközök és adatforrások AI-hoz kapcsolására való, nem élő Codex-session átvételére vagy VS Code Codex távvezérlésére.

## 4. Célarchitektúra

Az `Attys_DC_BOT_NAS` ne egyszerűen a jelenlegi bot NAS-on futó változata legyen.

A javasolt architektúra:

```text
Discord
   ↓
DS925+ – NAS Control Plane
   ↓ biztonságos worker-kapcsolat
Windows PC – Codex Worker
   ↓
helyi Codex / VS Code-sessionök / repositoryk / fejlesztői eszközök
```

### 4.1. NAS Control Plane feladatai

A NAS-on futó rendszer kezelje:

* Discord-kapcsolatot;
* felhasználói jogosultságokat;
* projekt-nyilvántartást;
* worker-nyilvántartást;
* tartós feladatsort;
* feladatállapotokat;
* jóváhagyási kérelmeket;
* felhasználói kérdéseket;
* esemény- és auditnaplót;
* értesítéseket;
* online/offline worker-állapotot;
* újrapróbálást és hibakezelést.

A NAS ne legyen elsődleges Codex-végrehajtó a Windows-projektekhez.

### 4.2. Windows Worker feladatai

A Windows PC-n fusson egy külön könnyű worker, amely:

* kifelé kapcsolódik a NAS-hoz;
* hitelesíti magát;
* jelzi online/offline állapotát;
* közli az elérhető projekteket;
* hozzáfér a helyi repositorykhoz;
* felismeri a helyi Codex-sessionöket;
* Codex-feladatot indít vagy folytat;
* továbbítja a streamelt választ;
* továbbítja a jóváhagyási kérelmeket;
* kezeli a megszakítást;
* visszaküldi a végeredményt.

A Windows PC-n lehetőleg ne kelljen nyilvános portot nyitni. A worker kifelé kezdeményezze a kapcsolatot.

## 5. Rétegek szétválasztása

A jelenlegi kódban a Discord-logika, a sessionkezelés és a Codex-protokoll szorosan összekapcsolódik.

Ezt a továbbfejlesztés előtt szét kell választani.

### 5.1. Discord adapter

Feladata kizárólag:

* slash commandok;
* gombok;
* Discord-üzenetek;
* felhasználói interakciók;
* megjelenítés.

Ne tartalmazzon Codex-specifikus végrehajtási logikát.

### 5.2. Orchestrációs mag

Feladata:

* általános feladatmodell;
* feladatsor;
* állapotgép;
* jóváhagyások;
* timeoutok;
* retry;
* worker-hozzárendelés;
* audit;
* idempotencia;
* eredmények kezelése.

### 5.3. Végrehajtói adapterek

Javasolt interfész:

```text
Executor
- startTask
- getStatus
- sendInput
- approve
- reject
- cancel
- getResult
- getCapabilities
```

Első implementáció:

```text
CodexExecutor
```

Későbbi lehetőségek:

```text
EsperExecutor
RagFlowExecutor
DifyExecutor
N8nExecutor
GenericHttpExecutor
McpExecutor
```

### 5.4. Codex kapcsolat

A Codexet külön adapterréteg kezelje:

```text
CodexConnection
├── SpawnedAppServerConnection
├── ExistingSessionConnection
├── SharedAppServerConnection
└── FutureRemoteControlConnection
```

A jelenlegi működés a `SpawnedAppServerConnection`.

A többi ág csak akkor implementálható, ha a Codex hivatalos interfésze támogatja.

## 6. Általános feladatmodell

A jelenlegi Codex-specifikus `threadId` és `turnId` ne legyen a teljes orchestrációs modell alapja.

Javasolt általános modell:

```text
Task
- taskId
- correlationId
- executorType
- workerId
- projectId
- source
- requestedBy
- status
- priority
- input
- result
- error
- approvalState
- createdAt
- queuedAt
- startedAt
- finishedAt
- retryCount
- timeoutAt
```

Lehetséges állapotok:

```text
created
queued
assigned
running
waiting_for_approval
waiting_for_user_input
completed
failed
cancelled
timed_out
offline_wait
```

## 7. Tartós feladatsor

A jelenlegi bot promptqueue-ja memóriában van.

NAS control plane esetén a queue legyen tartós adatbázisban, mert:

* újraindítás után is meg kell maradnia;
* worker-kiesés után folytathatónak kell lennie;
* el kell kerülni a kétszeres végrehajtást;
* auditálni kell az állapotváltozásokat.

Kezdetben használható:

* SQLite, ha egyetlen NAS-példány fut;
* később PostgreSQL, ha több szolgáltatás vagy worker szükséges.

## 8. Worker-kapcsolat

Javasolt kommunikáció:

```text
privát VPN vagy Tailscale
+
TLS WebSocket vagy HTTPS
```

A worker kifelé csatlakozzon.

Szükséges üzenettípusok:

```text
worker.register
worker.heartbeat
worker.capabilities
task.assign
task.accept
task.started
task.progress
task.output
task.approval_required
task.user_input_required
task.completed
task.failed
task.cancel
task.cancelled
```

Minden üzenet tartalmazzon:

* verziót;
* message ID-t;
* task ID-t;
* correlation ID-t;
* időbélyeget;
* hitelesítési kontextust.

## 9. Session-handoff

A cél nem feltétlenül a VS Code-ban futó Codex élő példányának közvetlen vezérlése, mert erre jelenleg nincs igazolt stabil API.

Reális cél:

* VS Code-ból származó session felismerése;
* ugyanazon thread biztonságos folytatása;
* session ownership;
* párhuzamos használat tiltása;
* átadás és visszaadás.

Javasolt sessionállapot:

```text
owner = vscode
owner = discord
owner = worker
owner = free
```

A worker csak akkor vegyen át sessiont, ha:

* nincs aktív turn;
* nincs függő jóváhagyás;
* nincs másik végrehajtó által tartott lock;
* a session megfelel a projekthez.

Szükséges parancsok vagy műveletek:

```text
/session discover
/session attach
/session release
/session owner
/session force-release
```

A `force-release` csak magas jogosultsággal legyen elérhető.

## 10. MCP szerepe

Az MCP használható kiegészítőként.

Például a Codex számára elérhető MCP-eszközök:

```text
send_discord_update
request_operator_approval
get_pending_task
get_project_context
complete_remote_task
report_worker_status
```

Az MCP azonban ne legyen a NAS–worker kapcsolat egyetlen alapja.

Nem oldja meg önmagában:

* a tartós queue-t;
* a worker-regisztrációt;
* az online/offline állapotot;
* a reconnectet;
* a task lockingot;
* a session ownershipot;
* a többszörös végrehajtás megelőzését.

## 11. Biztonsági alapelvek

A jelenlegi bot jó biztonsági elemei megőrzendők:

* engedélyezett felhasználók és szerepkörök;
* projektútvonal-korlátozás;
* veszélyes csatolmányok tiltása;
* auto-approve alapértelmezett tiltása;
* érzékeny adatok kiszűrése;
* nyers tokenek és privát útvonalak elrejtése.

További követelmények:

* NAS és worker kölcsönös hitelesítése;
* worker-specifikus token vagy tanúsítvány;
* tokenrotáció;
* replay-védelem;
* task ID alapú idempotencia;
* parancsengedélyezési politika;
* projektenkénti jogosultság;
* minimális jogosultság elve;
* auditálható jóváhagyások;
* titkok ne kerüljenek Discordra;
* ne legyen nyitott, általános remote shell;
* ne legyen korlátlan tetszőleges parancsfuttatási API.

## 12. Javasolt fejlesztési sorrend

### Fázis 1 – architekturális szétválasztás

* Discord adapter leválasztása;
* Codex adapter leválasztása;
* általános taskmodell;
* egységes állapotgép;
* meglévő tesztek megtartása.

### Fázis 2 – NAS control plane alap

* Docker-kompatibilis futás;
* tartós adatbázis;
* worker registry;
* task queue;
* audit event store;
* health endpoint;
* konfigurációs séma.

### Fázis 3 – Windows worker

* kifelé csatlakozó worker;
* projektfelismerés;
* Codex-adapter;
* streamelt válasz;
* megszakítás;
* jóváhagyási továbbítás.

### Fázis 4 – session discovery és handoff

* VS Code-sessionök felismerése;
* session owner és lock;
* párhuzamos használat tiltása;
* attach/release műveletek;
* ütközési tesztek.

### Fázis 5 – MCP-integráció

* Discord notification MCP tool;
* approval MCP tool;
* task-context MCP tool;
* engedélyezett tool-lista;
* auditált MCP-hívások.

### Fázis 6 – általános orchestrator bővítés

* további executor adapterek;
* E-SPER;
* n8n;
* RAGFlow;
* Dify;
* általános REST/MCP végrehajtók.

## 13. Kerülendő irányok

Ne történjen:

* a teljes Codex végrehajtás NAS-ra költöztetése csak azért, mert a bot ott fut;
* nyilvános remote shell létrehozása;
* a Discord-logika további összekeverése a Codex session managerrel;
* minden n8n/Dify/RAGFlow funkció saját újraimplementálása;
* memóriában tárolt végleges queue;
* ugyanazon Codex-thread egyidejű használata VS Code-ból és Discordból;
* nem dokumentált VS Code-belső API-ra épülő törékeny megoldás;
* MCP használata általános worker-protokoll helyett.

## 14. Végső cél

Az `Attys_DC_BOT_NAS` hosszú távú szerepe:

> 24/7 elérhető, NAS-on futó, ember által felügyelt AI- és fejlesztési control plane, amely Discordon keresztül fogad feladatokat, tartósan kezeli azok állapotát, és biztonságosan továbbítja azokat a megfelelő helyi vagy távoli végrehajtóknak.

A Windows PC szerepe:

> helyi Codex worker, amely a tényleges repositorykat, fejlesztői eszközöket és Codex-sessionöket használja.

A NAS ne legyen második fejlesztőgép, hanem központi vezérlő, queue-, audit- és kommunikációs réteg.
