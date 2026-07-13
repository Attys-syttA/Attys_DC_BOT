# ForgeLab Free mód – kontrollált orchestrator-audit

**Vizsgálat dátuma:** 2026. július 13.

**Vizsgált felület:** a bejelentkezés után elérhető ForgeLab béta workspace

**Fiók és modellhasználat:** Free csomag, saját API-kulcs nélkül

## Miért csináltuk ezt a próbát?

A ForgeLab bemutatkozása alapján elég megadni egy feladatot, a rendszer pedig szerepekre bontja a munkát, elkészíti a projektet, ellenőrzi a saját eredményét, majd szükség esetén javítási köröket futtat. Ezt nem egy nagy vagy értékes projekten akartuk először kipróbálni, hanem egy kicsi, könnyen ellenőrizhető React alkalmazáson. Így a végeredményről néhány egyértelmű parancs és kézi ellenőrzés alapján el lehet dönteni, hogy valóban elkészült-e.

Fontos határ: ez nem a ForgeLab belső kódjának biztonsági auditja. A zárt orchestrator működését kívülről, a felületen látható állapotok, az exportált projekt és a ténylegesen futtatható ellenőrzések alapján vizsgáltuk.

## A Free mód beállítása

A bétafiók `FREE` csomagban működött. Saját OpenRouter API-kulcsot nem adtunk meg, és a BYOK próbaverziót sem indítottuk el. A beállítási oldal egy saját OpenRouter-kulcs csatlakoztatását kínálta fel hét napos próbaidővel, majd havi díjjal, de ezt a kontrollteszthez szándékosan nem használtuk.

Az első indítások `Access Restricted` választ adtak, mert a konfigurációban még fizetős modellek maradtak. Ezután minden elérhető szerepet a Free modellre állítottunk:

- Architect: `Free Openrouter Ai`
- Senior Developer: `Free Openrouter Ai`
- Bug Hunter – Deep: `Free Openrouter Ai`
- Bug Hunter – Fast: `Free Openrouter Ai`
- Conductor: `Free Openrouter Ai`

A fő beszélgetési modellt is `Free Openrouter Ai` értékre állítottuk; előtte még MiniMax-modell volt kiválasztva, ezért önmagában az agentek átállítása nem volt elég. A tényleges orchestrált futásnál a `Brain` és az `Audit` kapcsoló is aktív volt, az `Include workspace context` pedig be volt kapcsolva. A rendszer olyan jogosultsággal futott, amely lehetővé tette a workspace fájljainak létrehozását és módosítását. GitHub-kapcsolatot, adatbázist, külső API-t és deployt nem engedélyeztünk.

## A megadott tesztprompt

Az alábbi promptot azért írtuk ilyen részletesre, hogy a végén ne lehessen pusztán egy látványos képernyőre vagy általános szöveges összefoglalóra hivatkozni. A TypeScript-ellenőrzés, a tesztek és a production build mind objektív elfogadási feltétel volt.

```text
Build a small local-only application called “Audit Board”.

Work autonomously from planning through implementation and audit.
Do not ask questions unless a requirement is impossible.
Do not deploy the project and do not connect GitHub, a database, authentication, or any external API.

Technology:
- Vite
- React
- TypeScript
- Vitest
- plain CSS

Functional requirements:
1. Users can create a task with a required title.
2. Each task has one of three states: Todo, In Progress, Done.
3. Users can move tasks between states and delete tasks.
4. Tasks persist in localStorage after page reload.
5. The UI can filter tasks by state.
6. Show the number of tasks in each state.
7. Empty or whitespace-only task titles must be rejected with an accessible error message.
8. All buttons and inputs must have accessible names.
9. Do not use dangerouslySetInnerHTML.

Architecture requirements:
- Keep task state operations in a separate TypeScript module.
- Keep localStorage access in a separate module.
- Add real unit tests for task creation, validation, status changes, deletion, filtering, and persistence serialization.
- Add a README with setup, test, and build instructions.
- Do not create placeholder tests.

Validation requirements:
- Run the TypeScript check.
- Run all unit tests.
- Run the production build.
- Use the Audit Loop to inspect cross-file consistency, imports, types, and test results.
- Fix discovered problems until all checks pass or the audit iteration limit is reached.

At the end, report:
- the plan,
- which agent performed each phase,
- all created files,
- commands that were actually executed,
- problems found by the Audit Loop,
- changes made by the Audit Loop,
- final test and build results.
```

## Hogyan zajlott a futás?

Az első próbálkozások a még fizetősre állított modellek miatt nem indultak el. A Free konfiguráció beállítása után egyszer véletlenül Single Chat módban indult el ugyanaz a kérés. Ez a futás több hibás és egymásnak ellentmondó fájlt hagyott a workspace-ben. Leállítottuk, majd ugyanabban a workspace-ben elindítottuk a tényleges Brain + Audit futást.

Ez a körülmény gyengíti a teszt „tiszta lapos” jellegét: a Brain nem üres projektből indult, hanem egy rossz előzményt is örökölt. Ugyanakkor éppen egy orchestrator audit- és javítóképességének kellene felismernie az ilyen állapotot. Ha ezt nem tudja helyrehozni, legalább nem volna szabad sikeresnek minősítenie a projektet.

A felületen valóban látszott több munkafázis, különböző agentszerepekhez rendelt feladatok, review, javítás és két Audit Loop iteráció. Vagyis nem pusztán egyetlen hosszú chatválasz érkezett: a rendszer ténylegesen orchestrált munkafolyamat látszatát és részletes állapotkövetését adta.

## Mit állított a ForgeLab a végén?

A fő eredménykártya egyszerre mutatta az alábbiakat:

- `Complete`
- `Project delivered.`
- `⚠ 4 failed`
- `Tasks (64/68)`
- `Frontend UI 17/19`
- `Tests 4/6`
- `Documentation — requested, not started`
- `Review & fixes` kész
- `Audit loop` kész
- `Finalize` kész

A „Recent decisions” részben ennél is határozottabb kijelentések szerepeltek:

- `Project complete`
- `Final holistic review found no critical issues`
- `Audit loop done, 30 issue(s) fixed in 2 iteration(s)`

Ez önmagában is ellentmondásos. A felület négy sikertelen tételt, befejezetlen frontend- és tesztfeladatokat, valamint el sem kezdett dokumentációt mutatott, mégis leszállítottnak és kritikus hibától mentesnek nevezte az eredményt.

A beépített `Project Config Check` közben négy konkrét problémát is jelzett:

1. hiányzik a `src/main.jsx` belépési pont;
2. a `src/taskOperations.ts` egy nem létező `./constants` fájlt importál;
3. a `src/TaskList.jsx` valószínűleg nem deklarált `DashboardTask` típust használ;
4. az egyik generált `TaskList.test` komponenst halott vagy nem használt kódként jelölte.

A ForgeLab saját terminálján a Vite ismételten ezt írta:

```text
Failed to load url /src/main.jsx (resolved id: /src/main.jsx). Does the file exist?
```

Ennek ellenére a végső állapot nem `failed` vagy `needs review`, hanem `Complete` lett.

## A független ellenőrzés menete

Nem a képernyőn látható összegzésből indultunk ki. A projektet a ForgeLab `Export Project as ZIP` funkciójával kiexportáltuk, külön ideiglenes mappába bontottuk ki, majd az exportált fájlokon végeztük el az ellenőrzést.

A ZIP 19 egyedi fájlt tartalmazott. A ForgeLab részletes nézete eközben `Files 36 ✓` értéket mutatott; ez feltehetően fájlműveleteket vagy generálási eseményeket számolt, nem 36 egyedi exportált fájlt. A felület ezt nem tette egyértelművé.

Nem futtattunk `npm install` parancsot. Erre az alapvető ellenőrzéshez nem is volt szükség: a belépési pont hiányzott, a kötelező npm scriptek nem léteztek, és a forrásban több közvetlen import- és szintaktikai probléma volt. Az exportban lockfile sem szerepelt.

### A `package.json` eredménye

A projekt egyetlen npm scriptet tartalmazott:

```json
"scripts": {
  "dev": "vite --host"
}
```

Nem volt `typecheck`, `test` vagy `build` script. A dependency-listában sem szerepelt a promptban kért `vitest` és `typescript`, miközben több tesztfájl és TypeScript-fájl készült. A csomag több helyen `latest` verziót használt, ami reprodukálható build helyett időben változó dependency-feloldást eredményezne.

### Belépési pont és futtathatóság

Az `index.html` ezt a fájlt töltené be:

```html
<script type="module" src="/src/main.jsx"></script>
```

Az exportban azonban nem volt `src/main.jsx`. Emiatt a preview nem indulhatott el, és az alkalmazás funkcionális követelményeit böngészőben nem lehetett kipróbálni.

### Forráskódhibák

A statikus átnézés több, már fordítás előtt is látható hibát talált:

- A `src/localStorageModule.ts` használja a `TaskState` típust, de nem importálja.
- A `src/taskOperations.ts` használja a `Task` és `TaskState` típusokat, de nem importálja őket.
- Ugyanez a modul egy hiányzó `./constants` fájlból próbál importálni.
- A kód `tasks.findState(...)` és `tasks.copy()` metódusokat hív, holott a `TaskState` egyszerű objektumtípus, ilyen metódusai nincsenek.
- Az állapotnevek sem egységesek: van `Todo`, `In Progress`, `Done`, máshol pedig `todos`, `inProgress`, `progress` és `done` kulcsok jelennek meg.
- Több `.jsx` fájl TypeScript típusannotációkat tartalmaz, amelyeket a JavaScript/JSX parser nem fogad el.
- A `TaskList` a `redux` csomagból importál `useAppSelector` és `useAppDispatch` hookokat, pedig ezeket a Redux nem exportálja.
- Több, egymással versengő `TaskList.jsx` és `TaskList.test.tsx` készült különböző könyvtárakban.
- A tesztek több helyen `jest.fn()` használatára épülnek, miközben a kérés Vitest volt, és sem Vitest-konfiguráció, sem megfelelő import nem készült.

Pozitívumként elmondható, hogy külön localStorage- és task-operation modul valóban létrejött, és a keresés nem talált `dangerouslySetInnerHTML` használatot. Ezek azonban csak részleges szerkezeti találatok; a modulok a jelen formájukban nem alkotnak működő alkalmazást.

### A három kötelező parancs tényleges eredménye

Az exportált projekt gyökerében lefuttattuk pontosan azokat az ellenőrzéseket, amelyeket a prompt kötelezővé tett:

```text
npm run typecheck  -> exit code 1, Missing script: "typecheck"
npm test -- --run  -> exit code 1, Missing script: "test"
npm run build      -> exit code 1, Missing script: "build"
```

Tehát nem arról van szó, hogy néhány teszt piros lett egy egyébként működő projektben. A rendszer még a kért ellenőrzési parancsokat sem hozta létre, ezért hiteles sikeres typecheck-, teszt- vagy build-eredmény nem létezhetett.

A README ezzel szemben azt állította, hogy az összes követelmény elkészült, a TypeScript-típusok, a local storage modul, a task operations modul és a tesztlefedettség rendben van. Ugyanez a README olyan `npm test` és `npm run build` parancsokat ajánlott, amelyekhez nem készültek scriptek. Ez nem egyszerű dokumentációs pontatlanság, hanem a végső önellenőrzés hiányának újabb jele.

## Értékelés

A próba alapján a ForgeLab valóban rendelkezik egy többfázisú orchestrációs felülettel: tud tervet készíteni, agentszerepeket megjeleníteni, feladatokat kiosztani, review- és auditkört futtatni, valamint fájlokat kezelni. Ez több egy egyszerű chatablaknál.

A Free módban, ebben a bétafutásban viszont nem bizonyította, hogy a teljes fejlesztési feladatot megbízhatóan és felügyelet nélkül végre tudja hajtani. A legsúlyosabb probléma nem önmagában a hibás kód. AI által generált kódban lehetnek javítandó hibák. A döntő probléma az, hogy a rendszer a saját terminálhibája, a saját négyes hibalistája, a hiányzó fájlok és a nem létező ellenőrző scriptek ellenére `Complete` állapotot és „no critical issues” minősítést adott.

Ezért a kontrollteszt végeredménye: **nem teljesítette az elfogadási feltételeket**.

Egyetlen Free-mode futásból nem lehet a fizetős modellek minőségéről vagy a szolgáltatás minden használati módjáról általános következtetést levonni. A véletlen Single Chat előzmény miatt egy következő próbát érdemes teljesen üres workspace-ben megismételni. A mostani eredményt azonban ez a körülmény nem teszi elfogadhatóvá: egy audit-orchestratornak vagy helyre kell állítania a projektet, vagy őszintén sikertelennek kell minősítenie.

## Mit viszünk tovább ebből az Attys tervezésébe?

Ez a teszt megerősíti, hogy az `Attys_DC_BOT` későbbi auditfunkciójában a „kész” állapotot nem szabad egy modell szöveges önértékelésére bízni. A validatornak fix, név szerint engedélyezett ellenőrzéseket kell futtatnia, és csak a tényleges exit code-okból, fájlellenőrzésekből és strukturált eredményekből szabad döntést hoznia.

Gyakorlati minimumként:

- hiányzó vagy nem támogatott check esetén nincs sikeres állapot;
- piros typecheck, test vagy build mellett nincs `completed`;
- az audit iteráció száma önmagában nem bizonyít minőséget;
- a végső összefoglalónak külön kell választania a modell állítását és a géppel ellenőrzött tényeket;
- stagnálás vagy romlás esetén a rendszer álljon meg, és kérjen emberi felülvizsgálatot.

Pontosan ezért marad az Attys tervezett első lépése read-only, named-check alapú és korlátozott: előbb legyen megbízható a mérés és az állapotgép, és csak utána jöhet bármilyen automatikus javítás.
