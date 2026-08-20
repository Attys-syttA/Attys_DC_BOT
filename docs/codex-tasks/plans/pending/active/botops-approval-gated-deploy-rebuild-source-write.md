# BotOps jovahagyasos deploy, rebuild es source-write terv

Status: approved / deploy apply, audit repair apply/revert, cleanup, Git commit/push, and Windows restart gates implemented; rebuild/rollback remain explicit later gates

## Kapcsolodo jelenlegi helyzet

- Az `Attys_DC_BOT` az egyetlen aktiv source-of-truth a Discord bot, BotOps parancsfelulet, NAS handoff/control-plane helper es korlatozott Windows/NAS worker execution reteg szamara.
- A bot mar tud allapotot mutatni, fix ellenorzeseket inditani, audit repair worktree-t elokesziteni, izolalt repair kort futtatni, rechecket vegezni, review utan egyszeru repair eredmenyt atvenni, valamint kulon jovahagyassal staged-only commitot es clean/not-behind pusht inditani.
- A NAS oldalon jelenleg a biztonsagos irany a read-only/control-plane modell: queue, heartbeat, status, verifier es fixed task worker. A `nas.deploy.verify` mar csak ellenoriz, nem deployol.
- A kovetkezo szint veszelyesebb, mert mar valodi gepallapotot valtoztatna: source worktree iras, NAS share sync, container rebuild, service restart, deploy, cleanup vagy rollback.
- Ez a terv elfogadott fejlesztesi szerzodes. Az elso kor csak biztonsagos preview/status runtime kodot kapcsolhat be; a valodi source-write, deploy, rebuild, restart, cleanup es rollback muveletek tovabbra is kulon explicit jovahagyast kernek.

## Laikus osszefoglalo

A cel az, hogy a Discord bot ne csak megnezni es elokesziteni tudjon dolgokat, hanem idovel biztonsagosan vegig tudjon vinni egy javitas -> ellenorzes -> atvetel -> commit -> push -> NAS frissites -> ujrainditas lancot.

De ezt nem ugy kell elkepzelni, hogy a bot "magatol nyomogat mindent". Inkabb ugy, mint egy muhelyben a munkalap:

1. A bot letrehoz egy feladatot.
2. Kiirja, pontosan mit akar csinalni.
3. Ellenorzi, hogy tiszta-e a terep.
4. Kulon rakerdez a veszelyes lepesekre.
5. Csak az adott jovahagyott lepesre kap engedelyt.
6. Lefuttatja a fix, elore ismert helper muveletet.
7. Visszajelzi, hogy sikerult-e, hol van a naplo, es mi a kovetkezo biztonsagos dontes.

Fontos: egy `deploy` jovahagyas nem jelenthet automatikus `push` jogot, egy `push` jovahagyas nem jelenthet automatikus `restart` jogot, es egy `restart` jovahagyas nem jelenthet NAS rebuild jogot. Minden nagyobb mozdulat kulon ajto, kulon kulccsal.

## Elkeszult reszek

- 2026-08-18 elso safe slice:
  - `botops_jobs.expected_action` es `botops_jobs.validation_condition` additive contract mezok;
  - approval matching ezekre a mezokre is raellenoriz, ha az approval tartalmazza oket;
  - `/ops preview job_id:<id>` read-only approval scope nezet;
  - `/nas deploy-plan` read-only dry-run preview a `DISCORD_ENABLE_NAS_STATUS` flag alatt;
  - a deploy-plan nem ad at `-Apply` kapcsolot, nem ir NAS share-t, nem rebuildel es nem restartol.
- 2026-08-18 masodik safe-gated slice:
  - `nas.deploy.apply` bekerult a BotOps capability allowlistbe mint approval-required capability;
  - `/nas deploy-apply` csak jobot hoz letre, es nem indit kozvetlen deployt Discordbol;
  - a NAS worker csak approval utan veheti fel;
  - a worker fixed helper lancot futtat: `npm run nas:deploy -- -Apply`, majd kotelezo `npm run nas:deploy:verify`;
  - deploy apply hiba eseten nincs fallback rebuild/restart; ha az apply helper lefut, de a kotelezo post-verify bukik, a job `WaitingManualReview`.
- 2026-08-20 deploy apply manual-review guard:
  - a `nas.deploy.apply` worker ag explicit BotOps `WaitingManualReview` vegallapotot rogzít post-verify bukasnal;
  - apply-before-verify hiba tovabbra is fail-closed `Failed`;
  - nincs automatikus fallback deploy, rebuild, restart, rollback, commit, push vagy cleanup.
- 2026-08-18 harmadik UX/preview slice:
  - `/nas deploy-plan` explicit `will-rebuild=no|yes|unknown` sort mutat a jelenlegi deploy verifier alapjan;
  - `/ops status` `next decision` sort mutat approval, worker recovery, running vagy failed job eseten.
- 2026-08-18 restart validation slice:
  - Windows `service.restart` worker helper csak akkor zar `Completed` allapotban, ha a `win-start.bat` utan a `npm run doctor:local` is sikeres;
  - post-restart doctor hiba eseten a job `Failed`, nincs tovabbi fallback.
- 2026-08-18 rollback preview slice:
  - `/nas rollback-plan` read-only preview keszult;
  - rollback apply tovabbra is tiltott, rollback source Git commit;
  - rollback vegrehajtasi capability meg nem letezik.
- 2026-08-18 jobs visibility slice:
  - `/ops jobs` compact sorban a `WaitingApproval` + `approval=required` jobok `dangerous=yes` jelzest kapnak.
- 2026-08-18 rollback operatori dontes:
  - rollback apply csak ketlepcsos approval modellel tervezheto;
  - rollback verify bukas eseten a vegallapot `WaitingManualReview` legyen;
- 2026-08-20 rollback source operatori dontes:
  - rollback source: Git commit;
  - rollback apply runtime capability meg nem keszult; elotte pontos rollback commit kivalasztas es kulon guardolt apply design kell.
- BotOps job/eveny/heartbeat SQLite alap es public-safe Discord status/log nezetek.
- Lease alapu worker futtatas, stale/expired allapotokkal.
- Explicit approval modell, ahol a worker nem kozvetlenul a Discord parancsbol futtat muveletet.
- Windows worker fixed helper alap:
  - `status.read`
  - `audit.check`
  - `git.commit`
  - `git.push`
  - `service.restart`
- 2026-08-20 Git publication guard:
  - a `git.push` helper approval utan fixed `git fetch --prune` preflightot futtat az ahead/behind osszevetes elott;
  - fetch hiba eseten a push blokkol, es nincs fallback merge, rebase, force push, commit, deploy, restart vagy cleanup.
- 2026-08-20 approval diagnostics slice:
  - `/ops approve` csak akkor ir approvalt, ha az aktualis job meg `approval_state=required`;
  - stale, already-approved vagy not-required jobnal nem allit sikert, hanem public-safe job reszletekkel jelzi, hogy nem tortent jovahagyas;
  - az approval parancs tovabbra sem indit kozvetlen worker executiont.
- 2026-08-20 approval scope fingerprint slice:
  - approval-gated job jovahagyasakor belso fingerprint keszul a `job_id`, target, capability, `expected_action` es `validation_condition` ertekekbol;
  - worker pickup elott az approved job fingerprintje ellenorzodik;
  - scope drift eseten a job `WaitingApproval` + `approval_state=stale` allapotba kerul `approval scope changed` eredmennyel, es nem fut le.
- 2026-08-20 audit repair apply BotOps handoff slice:
  - `/audit repair-apply` mar nem ir kozvetlenul source worktree-be, hanem completed/reviewed/passed-recheck preflight utan `audit.repair.apply` BotOps jobot hoz letre;
  - Windows worker csak approval utan veheti fel, es a meglevo guarded repair apply helpert hasznalja;
  - source validation hiba `WaitingManualReview`, nincs automatikus commit, push, deploy, cleanup, branch merge, arbitrary shell vagy free Codex.
- NAS worker fixed helper alap:
  - `nas.worker.check`
  - `nas.deploy.verify`
- Audit repair source handoff alap:
  - izolalt worktree;
  - reviewed repair execution;
  - isolated recheck;
  - default-off repair apply;
  - guarded cleanup/revert;
  - nincs automatikus commit, push, deploy vagy cleanup.
- NAS deploy tooling mar letezik lokalis helperkent:
  - `npm run nas:deploy` dry-run;
  - `npm run nas:deploy -- -Apply`;
  - `npm run nas:deploy:verify`;
  - `npm run nas:container:status`;
  - `npm run nas:container:rebuild`.
- A valodi NAS deploy apply mar BotOps job capabilitykent engedelyezett, de csak explicit approval utan. A kulon rebuild/source-write/restart/cleanup/rollback muveletek meg nincsenek onallo BotOps capabilitykent engedelyezve.

## Nyitott reszek

- Kulon BotOps approval contract kell a valodi source-write, deploy, rebuild, restart, cleanup es rollback muveletekhez.
- A Discord parancsoknak elobb preview/dry-run eredmenyt kell mutatniuk, es csak utana kerhetnek explicit operatori jovahagyast.
- A NAS oldali deploy/rebuild csak allowlistes helperen keresztul indulhat, nem arbitrary shell parancskent.
- Source write utan a botnak erthetoen jeleznie kell: "a forras mar modositva van, de meg nincs commit/push/deploy".
- Deploy/rebuild utan kotelezo post-verify kell, kulonben az allapot `WaitingManualReview` vagy `Failed` legyen.
- Rollback policyt meg kell hatarozni: mit jelent pontosan a visszaallitas, honnan, milyen helperrel, es mikor szabad futtatni.

## Cel es vart eredmeny

A kovetkezo fejlesztes celja egy olyan BotOps folyamat, amelyben a Discord bot:

- el tudja magyarazni, milyen veszelyes muvelet kovetkezik;
- letrehoz egy pontos jobot es approval-kaput;
- csak allowlistes helperrel futtat;
- nem duplaz, nem talal ki fallback shellt;
- hiba eseten megall es megorzi a bizonyitekokat;
- siker eseten visszajelzi a kovetkezo, kulon jovahagyando lepest.

Vart vegallapot: a felhasznalo Discordrol tudja vezerelni a fo release/deploy lancot, de a bot tovabbra sem tud eszrevetlenul forrast irni, deployolni, ujraepiteni, restartolni, commitolni, pusholni vagy takaritani.

## Nem celok es tiltasok

- Nincs arbitrary shell Discordbol.
- Nincs automatikus deploy sikeres teszt utan.
- Nincs automatikus commit/push repair apply utan.
- Nincs automatikus NAS container rebuild source valtozas utan.
- Nincs automatikus service restart deploy utan.
- Nincs `git reset --hard`, force push, rebase vagy branch merge BotOps workerbol.
- Nincs NAS oldali szabad Codex futtatas.
- Nincs titok, token, `.env`, raw Discord ID, NAS host/IP vagy teljes lokalis path kiirasa Discordra.
- Nincs user-owned dirty worktree felulirasa.
- Nincs cleanup/delete kulon, pontos approval es fail-closed guard nelkul.

## Javasolt mukodesi modell

Minden veszelyesebb muvelet ugyanazt az eletciklust hasznalja:

```text
Requested
  -> Accepted
  -> WaitingApproval
  -> Running
  -> Completed | Failed | WaitingManualReview | Cancelled
```

Minden job tartalmazza:

- `job_id`
- `requested_by`
- `target`
- `capability`
- `expected_action`
- `approval_state`
- `approval_expires_at`
- `lease_owner`
- `lease_expires_at`
- `preflight_result`
- `logs`
- `result`
- `next_safe_action`

Az approval csak akkor ervenyes, ha pontosan egyezik:

- ugyanaz a `job_id`;
- ugyanaz a `capability`;
- ugyanaz a target repo/gep;
- ugyanaz a vart muvelet;
- nem jart le;
- az operator jogosult;
- a preflight az approval utan sem valtozott veszelyesen.

## Capability allowlist kovetkezo szinthez

| Capability | Allapot | Mit csinalhat | Mit nem csinalhat | Kell-e explicit approval |
| --- | --- | --- | --- | --- |
| `audit.repair.apply` | meglevo, szigoritando | reviewed es passing izolalt repair eredmenyt patchkent atvesz a source worktree-be | commit, push, deploy, cleanup | igen |
| `source.write.revert` | meglevo, approval-gated | pontosan egyezo, bot altal atvett source diffet visszafordit | reset hard, mas fajlok erintese | igen |
| `repair.cleanup` | meglevo, approval-gated | izolalt repair worktree non-force takaritasa guardokkal | source worktree modositas | igen |
| `git.commit` | meglevo | mar staged valtozasokat commitol validalt uzenettel | staging, push, deploy | igen |
| `git.push` | meglevo | clean es not-behind branch push | commit, merge, force push | igen |
| `service.restart` | meglevo, szigoritando | fix Windows bot restart helper | deploy, rebuild, env modositas | igen |
| `nas.deploy.plan` | javasolt | NAS deploy dry-run/preview | NAS iras, rebuild | nem vagy soft approval nelkul futtathato read-only |
| `nas.deploy.apply` | javasolt | meglévo `npm run nas:deploy -- -Apply` fixed helper, preflight + post-verify mellett | arbitrary SSH/shell, Codex futtatas, titokkiiras | igen |
| `nas.container.rebuild` | javasolt | meglévo restricted rebuild helper, ha a deploy terv ezt keri | share sync, source write, raw Docker output | igen |
| `nas.rollback.plan` | javasolt kesobbi | rollback lehetosegek public-safe elonezete | visszaallitas | nem vagy read-only |
| `nas.rollback.apply` | javasolt kesobbi | kulon definialt rollback helper | improvizalt torles, reset, kezi SSH shell | igen |

Uj capability csak akkor kerulhet be, ha ebben a tablaban vagy egy kulon, jovahagyott tervben szerepel.

## Tervezett parancsok

### `/ops preview`

Laikus cel: "Mutasd meg, mi tortenne, mielott engedelyezem."

- Read-only.
- Egy adott jobhoz vagy tervezett capabilityhez tartozik.
- Kiirja:
  - mit fog modositani;
  - melyik gepen;
  - milyen helper futna;
  - mi a siker feltetele;
  - milyen log lesz elerheto;
  - mi nem fog tortenni.

### `/ops approve`

Laikus cel: "Igen, ezt az egy lepeset engedem."

- Mar letezo jobot hagy jova.
- Csak akkor ir approvalt, ha a job aktualisan `approval_state=required`.
- Nem indit mas capabilityt.
- Lejart, stale, already-approved, not-required vagy eltero approval fail-closed, es nem allit hamis sikert.

### `/ops cancel`

Laikus cel: "Allj meg ezzel a feladattal."

- Requested, WaitingApproval vagy WaitingWorker jobot torol/cancel allapotba tesz.
- Running jobnal csak stop-requestet rogzít, ha a helper biztonsagosan megszakithato.
- Nem ol meg random processzt.

### `/windows helper-run`

Kovetkezo bovites csak akkor engedelyezett, ha a helper fixed es dokumentalt:

- `repair-apply`
- `repair-revert`
- `repair-cleanup`
- `commit`
- `push`
- `restart`

### `/nas deploy-plan`

Laikus cel: "Nézzük meg, frissíteni kell-e a NAS-t."

- Csak dry-run.
- Megmutatja, hogy a NAS azonos-e a jelenlegi source commit/package version allapottal.
- Nem ir NAS share-re, nem rebuildel.

### `/nas deploy-apply`

Laikus cel: "Most tedd fel a jóváhagyott verziót a NAS-ra."

- Csak approval utan.
- Csak a repo meglévo `nas:deploy -- -Apply` helperet hasznalhatja.
- Kotelezo:
  - source preflight;
  - NAS container preflight;
  - share sync guard;
  - rebuild vagy no-op dontes;
  - final `nas:deploy:verify`.

### `/nas rollback-plan` es `/nas rollback-apply`

Laikus cel: "Ha deploy utan baj van, legyen elore ismert visszaut."

- Eloszor csak terv/preview keszulhet.
- Apply csak kesobbi kulon jovahagyott rollback helperrel.
- A rollback nem talalhat ki parancsot a helyzet kozben.

## Implementacios szakaszok

### Szakasz 0 - Allapotfelvetel es contract review

Feladatok:

- Ellenorizni a jelenlegi BotOps DB schema, job lifecycle, approval es worker helper contractot.
- Osszevetni a jelenlegi capability allowlistet ezzel a tervvel.
- Rögzíteni, melyik capability mar letezik es melyik csak tervezett.
- Nem keszul runtime behavior valtozas.

Validacio:

- `npm run plans:check`
- targeted contract/unit tesztek, ha a review tesztet is igenyel

Stop feltetel:

- Ha a jelenlegi contract nem tudja biztonsagosan tarolni az `expected_action` vagy `validation_condition` mezoket, elobb schema terv kell.

### Szakasz 1 - Approval contract szigoritas

Feladatok:

- Az approval rekord tartalmazza a pontos capabilityt, targetet, vart muveletet es validacios feltetelt.
- `/ops logs` es `/ops preview` mutassa public-safe formaban, hogy mire vonatkozik az approval.
- Stale approval es megvaltozott preflight fail-closed legyen.

Validacio:

- approval matching unit tesztek;
- stale approval rejection;
- wrong capability rejection;
- changed target rejection.

Nem megengedett:

- uj deploy/rebuild futtatas;
- source write;
- live restart.

### Szakasz 2 - Source-write handoff formalizalasa

Allapot:

- `audit.repair.apply` BotOps job/approval es Windows worker execution kesz.
- `source.write.revert` BotOps job/approval es Windows worker execution kesz; csak `applied` repair handoffot fordit vissza a meglevo guarded exact-diff helperrel, source validation hiba `WaitingManualReview`.
- `repair.cleanup` BotOps job/approval es Windows worker execution kesz; normal, applied es reverted repair worktree cleanup a meglevo guarded helpereken keresztul fut, helper hiba `cleanup_failed` + `WaitingManualReview`.

Feladatok:

- Az `audit.repair.apply`, `source.write.revert` es `repair.cleanup` kapjon egyseges BotOps job/approval formát.
- A source write tovabbra is csak pontos, ellenorzott diffre vonatkozhat.
- Apply utan a kovetkezo dontes kulon jelenjen meg: commit, revert vagy manual review.

Validacio:

- synthetic repair apply pass;
- apply conflict fail-closed;
- dirty source worktree block;
- revert exact-diff pass;
- cleanup dirty-worktree retained.

Nem megengedett:

- automatikus commit/push/deploy;
- nem egyezo diff javitgatasa;
- force cleanup.

### Szakasz 3 - Git publication flow egységesitese

Allapot:

- `git.commit` es `git.push` approval-gated worker guardjai keszek: staged-only commit, diff-check, changed-files secret scan, clean/not-behind push, fixed fetch preflight, es no force/rebase/merge.
- `/windows helper-run helper:commit|push` most explicit approval/report blokkot mutat a preflightekkel, validacios feltetelekkel, tiltott akciokkal, es a kovetkezo `/ops preview` -> approve/cancel lepessel.

Feladatok:

- A `git.commit` es `git.push` helper keruljon be az uj preview/approval/report modellbe.
- Commit elott legyen:
  - staged-only ellenorzes;
  - `git diff --check`;
  - targeted secret scan;
  - valid commit message.
- Push elott legyen:
  - clean worktree;
  - upstream letezik;
  - remote tracking ref frissitve fixed `git fetch --prune` preflighttal;
  - branch not-behind;
  - no force push.

Validacio:

- commit missing staged files block;
- commit unstaged/untracked block;
- secret scan fail block;
- push behind block;
- push clean not-behind pass synthetic/fake remote teszttel.

Nem megengedett:

- automatikus staging;
- force push;
- rebase vagy merge.

### Szakasz 4 - NAS deploy plan es apply

Feladatok:

- `/nas deploy-plan` read-only preview.
- `/nas deploy-apply` approval-gated job.
- A worker csak a meglévo fixed helperre hivhat:
  - `npm run nas:deploy -- -Apply`
  - utana `npm run nas:deploy:verify`
- A deploy helper outputja public-safe legyen Discordon.
- A raw log csak helyi logfajlban maradjon.

Preflight:

- source checkout tiszta vagy pontosan dokumentalt allowed dirty allapot;
- package version es Git commit lathato;
- NAS config elerheto;
- restricted SSH status elerheto;
- no duplicate worker;
- nincs lejart lease;
- approval friss.

Post-verify:

- NAS build identity egyezik a source commit/package version parossal;
- snapshot friss;
- worker health megfelelo;
- public worker metadata nem szivarogtat URL-t/titkot;
- verifier zold.

Failure branch:

- Ha a share sync mar megtortent, de rebuild/post-verify bukik, a job `WaitingManualReview` legyen, es a bot irja ki: "a NAS share frissulhetett, de az eles futas nincs igazolt allapotban".

Nem megengedett:

- arbitrary SSH;
- NAS oldali Codex;
- raw Docker output Discordra;
- automatikus rollback.

### Szakasz 5 - NAS container rebuild kulon gate

Feladatok:

- Ha a deploy helper rebuildet igenyel, a bot ezt kulon erthetoen jelezze.
- Lehetoseg legyen csak container status/read-only ellenorzesre.
- Keszites alatt el kell donteni, hogy `nas.deploy.apply` magaban foglalhat-e rebuildet, vagy a rebuild mindig kulon `/nas rebuild-apply` approval legyen.

Javasolt dontes:

- Alapesetben a deploy apply tartalmazhat rebuildet, de a previewban explicit szerepelnie kell: `will rebuild: yes|no`.
- Force rebuild csak kulon opcioval es approval szoveggel.

Validacio:

- no-op deploy nem rebuildel;
- forced rebuild csak explicit flaggel;
- rebuild fail `WaitingManualReview`.

### Szakasz 6 - Service restart flow

Feladatok:

- A Windows bot restart es barmely jovobeli NAS service restart ugyanabba a preview/approval modellbe keruljon.
- Restart utan kotelezo health check es command registration/parancsfelulet ellenorzes kell, ha Discord botrol van szo.

Validacio:

- restart approval hianya block;
- duplicate live process detected block vagy manual review;
- restart utan `doctor`/command surface check pass.

Nem megengedett:

- ismeretlen PID leallitasa;
- unrelated process kill;
- restart deploy helyett.

### Szakasz 7 - Operator UX es dashboard

Feladatok:

- `/ops status` mutassa a legfontosabb kovetkezo dontest.
- `/ops jobs` listaban latszodjon, ha egy job veszelyes approvalra var.
- `/ops logs` adjon rovid, ertheto hibamagyarazatot es lognevet.
- A hibauzenetek laikusul is erthetoek legyenek:
  - "nem tiszta a munkamappa";
  - "lejart a jovahagyas";
  - "a NAS nem igazolta vissza az uj verziot";
  - "nem inditok veszelyes tartalekparancsot".

Validacio:

- snapshot/parancs tesztek;
- public-safe redaction tesztek;
- hosszu hibak roviditesenek tesztje.

### Szakasz 8 - Rollback es recovery terv

Feladatok:

- Eloszor csak read-only rollback preview.
- Meghatarozni, mi a rollback forrasa:
  - elozo Git commit. Dontes: igen, ez a rollback source.
  - elozo NAS build identity?
  - elozo Docker image tag?
  - megorzott staging snapshot?
- Meghatarozni, ki donthet rollbackrol es milyen approval kell hozza.

Kotelezo dontes implementacio elott:

- A rollback legyen-e kulon parancsra indithato a botbol?
- Kell-e ketlepcsos approval rollbackhez? Dontes: igen.
- Mi legyen, ha rollback verify is bukik? Dontes: `WaitingManualReview`.
- Mi legyen a rollback forrasa? Dontes: Git commit. A pontos rollback commitot vegrehajtas elott kulon kell kivalasztani.

## Hibas ágak es fail-closed viselkedes

| Helyzet | Bot valasza |
| --- | --- |
| Worker offline | `WaitingWorker`; kiirja, melyik worker hianyzik |
| Duplicate worker | `FailedDuplicateWorker`; PID/host summary public-safe formaban |
| Dirty source worktree | Iro muvelet blokkol; csak status/log engedett |
| Missing approval | `WaitingApproval`; nem futtat |
| Stale approval | approval elutasitva; uj approval kell |
| Wrong capability approval | elutasitva; nincs ujrafelhasznalas |
| Lease expired | worker nem folytat; recovery/manual review kell |
| Secret scan fail | commit/push/deploy blokkol |
| Test/build fail | repair/deploy flow `WaitingManualReview` |
| Push behind upstream | push blokkol; operatori sync dontes kell |
| NAS unavailable | csak local status/check mehet; NAS write nincs |
| Deploy verify fail | `WaitingManualReview`; nincs automatikus rollback |
| Rebuild fail | `WaitingManualReview`; raw log csak helyben |
| Restart health fail | `Failed` vagy `WaitingManualReview`; nincs loopolo restart |
| Unknown command/capability | hard fail; nincs fallback shell |

## Tesztterv

Unit tesztek:

- job schema validation;
- capability allowlist;
- approval exact matching;
- stale approval rejection;
- lease timeout;
- duplicate job id;
- dirty worktree fail-closed;
- public-safe output redaction.

Integracios tesztek:

- Discord command csak jobot hoz letre, nem futtat kozvetlen shellt;
- Windows worker csak allowed jobot vesz fel;
- NAS worker csak allowed jobot vesz fel;
- missing approval blokkolja az apply/commit/push/deploy/rebuild/restart muveleteket;
- stale approval elutasitva;
- deploy-plan read-only marad;
- deploy-apply csak fixed helperrel fut;
- post-verify fail manual review allapotba visz.

Smoke tesztek:

- `/ops status`
- `/ops jobs`
- `/ops preview`
- `/ops approve`
- `/windows status`
- `/windows helper-run helper:commit`
- `/windows helper-run helper:push`
- `/windows helper-run helper:restart`
- `/nas worker-status`
- `/nas deploy-plan`
- `/nas deploy-apply`
- `/nas worker-deploy-verify`

Release gate:

- `npm run plans:check`
- `npm run check`
- `git diff --check`
- targeted secret scan
- live bot restart csak explicit approval utan
- Discord smoke real command response-okkal
- NAS deploy/rebuild smoke csak explicit operatori approval utan

## Adatvedelem es titokkezeles

- Discordra csak public-safe osszefoglalo kerulhet.
- Raw helper output, teljes path, raw DB sor, token, host/IP, user ID, role ID, `.env` ertek vagy Codex auth state nem jelenhet meg Discordon.
- Logfajl neve kiirhato, de teljes helyi gepi erzekeny utvonal csak akkor, ha a repo policy szerint public-safe.
- Secret scan fail eseten nincs commit, push, deploy vagy restart.

## Döntési pontok neked, laikusan

Mielott kod keszul ebbol, ezeket kell majd jovahagynod:

1. A bot indithat-e approval utan valodi NAS deployt, vagy elobb csak `/nas deploy-plan` keszuljon?
2. A deploy approval tartalmazhat-e container rebuildet, ha a preview ezt elore kiirja?
3. Restart legyen-e automatikus deploy utan, vagy mindig kulon `/windows helper-run helper:restart` / kesobbi NAS restart parancs kelljen?
4. Legyen-e botbol indithato rollback, vagy rollback csak kezi operatori muvelet maradjon?
5. Source write utan a bot kerhet-e commit/push jovahagyast kovetkezo lepeskent, vagy csak jelezze, hogy "most donts"?

Javasolt alapvalasz:

- Elso implementacios korben csak `deploy-plan`, szigorubb approval preview, es jobb status/log UX keszuljon.
- Masodik korben johet `nas.deploy.apply`.
- Rebuild maradhat a deploy apply resze, de csak ha a previewban elore latszik.
- Restart maradjon kulon parancs.
- Rollback eloszor csak read-only plan legyen, apply kesobb.

## Codex vegrehajtasi szabaly

Codex csak a tervben felsorolt szakaszokat implementalhatja.

Codexnek meg kell allnia es engedelyt kell kernie, ha:

- uj capabilityt akar hozzaadni;
- NAS oldali szabad source write-ot vagy Codex futtatast akar bekapcsolni;
- approval kovetelmenyt akar gyengiteni;
- deployt, rebuildet, restartot, cleanupot vagy rollbacket akar elesben futtatni;
- titkot, `.env` erteket vagy privat host adatot kellene olvasnia/mozgatnia;
- user-owned dirty worktree valtozasba utkozik;
- destructive Git muvelet merul fel.

Minden implementacios szakasz vege:

- tesztek;
- `docs/STATE.md` frissites;
- `docs/CHANGELOG.dev.md` frissites;
- munkanaplo frissites;
- pontos kovetkezo lepes;
- commit/push csak explicit operatori jovahagyas utan.

## Elfogadasi kriteriumok

- A bot minden veszelyes muvelet elott ertheto previewt ad.
- Az approval pontosan egy jobra es egy capabilityre ervenyes.
- A worker nem futtat ismeretlen helper parancsot.
- Dirty worktree, stale approval, expired lease, missing worker, failed verify es secret scan hiba fail-closed allapotot ad.
- NAS deploy/rebuild utan kotelezo verifier bizonyitja, hogy az eles NAS allapot tenyleg a vart buildre mutat.
- Nincs automatikus commit, push, deploy, rebuild, restart, cleanup vagy rollback.
- Discord output public-safe marad.
- A live rendszer operator szamara erthetoen jelzi, mi tortent es mi a kovetkezo biztonsagos dontes.

## Elso javasolt kovetkezo implementacios szelet

Ne a deploy apply legyen az elso kodvaltozas.

Elso biztonsagos szelet:

1. `/ops preview` vagy annak megfelelo preview mezok az existing `/ops logs` / `/ops jobs` nezeteiben.
2. Approval contract bovites `expected_action` es `validation_condition` mezokkel.
3. Unit tesztek a wrong capability / stale approval / changed target fail-closed esetekre.
4. Dokumentacio es Discord UX igazitas.

Ez meg nem ir source-t, nem deployol, nem rebuildel es nem restartol, de elokesziti, hogy a kesobbi veszelyesebb muveletek ne homalyos "igen" gombbal induljanak.
