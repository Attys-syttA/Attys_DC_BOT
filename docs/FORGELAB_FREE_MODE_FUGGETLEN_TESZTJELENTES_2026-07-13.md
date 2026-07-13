# ForgeLab Free mód – független tesztjelentés

**A vizsgálat dátuma:** 2026. július 13.

**Tesztelt szolgáltatás:** ForgeLab béta, Free csomag

**A tesztben közreműködött:** Codex-Agent 5,6 Sol

## Rövid összefoglaló

A ForgeLab azt ígéri, hogy egy összetettebb fejlesztési feladatot képes szerepekre bontani, megtervezni, elkészíteni, ellenőrizni és szükség esetén több körben kijavítani. Ennek kipróbálására egy szándékosan kicsi, jól körülhatárolt React alkalmazást kértünk tőle.

A kontrollpromptot a Codex-Agent 5,6 Sol készítette el. A ForgeLab futása után ugyanez az agent bontotta ki és validálta az exportált projekt ZIP-fájlját, majd ténylegesen megpróbálta elindítani a promptban előírt TypeScript-, teszt- és buildellenőrzéseket.

A teszt végeredménye **sikertelen**. A ForgeLab többfázisú munkát és két auditkört hajtott végre, végül mégis késznek minősített egy olyan projektet, amely nem indult el, nem tartalmazta a szükséges ellenőrző parancsokat, és több közvetlen forráskódhibát is tartalmazott.

## A Free mód beállítása

A vizsgálat Free csomagban, saját API-kulcs felhasználása nélkül zajlott. OpenRouter BYOK-kulcsot nem adtunk meg, fizetős modellt és külön Forge Tokent nem használtunk.

Az első indítási kísérletek `Access Restricted` választ adtak, mert a konfigurációban még fizetős modellek maradtak. Ezután minden agentszerepet a Free modellre állítottunk:

- Architect: `Free Openrouter Ai`
- Senior Developer: `Free Openrouter Ai`
- Bug Hunter – Deep: `Free Openrouter Ai`
- Bug Hunter – Fast: `Free Openrouter Ai`
- Conductor: `Free Openrouter Ai`

A fő beszélgetési modell szintén `Free Openrouter Ai` lett. A tényleges orchestrált futásnál a `Brain` és az `Audit` mód is aktív volt, az `Include workspace context` pedig be volt kapcsolva. A rendszer létrehozhatott és módosíthatott projektfájlokat, de nem kapott feladatot deployra, GitHub-kapcsolatra, adatbázisra, hitelesítésre vagy külső API használatára.

## A teszthez készített prompt

A promptot úgy állítottuk össze, hogy a végeredményt ne szubjektív benyomás, hanem három egyszerű és megismételhető műszaki ellenőrzés döntse el: TypeScript-ellenőrzés, unit tesztek és production build.

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

## Milyen programnak kellett volna elkészülnie?

Az Audit Board egy kisméretű, böngészőben futó feladatkezelő lett volna. A felhasználó létrehozhatott volna feladatokat, majd `Todo`, `In Progress` és `Done` állapotok között mozgathatta volna őket. Az alkalmazásnak kezelnie kellett volna a törlést, az állapot szerinti szűrést, az oszloponkénti darabszámot és a böngésző `localStorage` tárhelyére történő mentést.

Az üres címeket hozzáférhető hibaüzenettel kellett volna elutasítania. Minden gombnak és beviteli mezőnek hozzáférhető nevet kellett kapnia. A feladatműveletek és a localStorage-kezelés külön TypeScript-modulba került volna, a fő működést pedig valódi Vitest-teszteknek kellett volna igazolniuk.

Szándékosan nem egy bonyolult rendszer volt a cél. Egy kicsi, de teljesen működő alkalmazást kértünk, amelynél a siker vagy a kudarc könnyen megállapítható.

## A futás fontos körülménye

A helyes Brain + Audit futás előtt ugyanaz a kérés egyszer véletlenül Single Chat módban indult el, és hibás fájlokat hagyott maga után. A Brain futás ezért nem teljesen üres projektből kezdett dolgozni.

Ez fontos korlátozása a tesztnek, ezért nem volna korrekt elhallgatni. Ugyanakkor egy audit- és javítófolyamat feladata éppen az, hogy felismerje a projekt aktuális hibáit. Ha az örökölt állapotot nem tudja helyrehozni, a helyes eredmény nem a sikeres leszállítás, hanem a sikertelen vagy emberi felülvizsgálatot igénylő állapot lett volna.

## A ForgeLab által közölt eredmény

A futás végén a ForgeLab az alábbi összegzést adta:

- `Complete`
- `Project delivered.`
- `Project complete`
- `Final holistic review found no critical issues`
- `Audit loop done, 30 issue(s) fixed in 2 iteration(s)`

Ugyanebben az eredményben azonban befejezetlen és sikertelen tételek is szerepeltek:

- `⚠ 4 failed`
- `Tasks (64/68)`
- `Frontend UI 17/19`
- `Tests 4/6`
- `Documentation — requested, not started`

A konfigurációs ellenőrzés négy konkrét problémát sorolt fel:

1. hiányzott a `src/main.jsx` belépési pont;
2. a `src/taskOperations.ts` egy nem létező `./constants` fájlt importált;
3. a `src/TaskList.jsx` valószínűleg nem deklarált `DashboardTask` típust használt;
4. az egyik generált `TaskList.test` fájlt halott vagy nem használt kódként jelezte.

A futási naplóban a Vite ismételten ezt a hibát adta:

```text
Failed to load url /src/main.jsx (resolved id: /src/main.jsx). Does the file exist?
```

A `Complete` minősítés tehát már a ForgeLab saját összegzésével és hibalistájával sem volt összhangban.

## Az exportált ZIP validálása

A ForgeLab által létrehozott projektet ZIP formátumban exportáltuk. A Codex-Agent 5,6 Sol ezt külön ideiglenes könyvtárba bontotta ki, ellenőrizte a fájlszerkezetet, átnézte a kulcsfontosságú konfigurációs és forrásfájlokat, majd lefuttatta a promptban előírt ellenőrző parancsokat.

A ZIP 19 egyedi fájlt tartalmazott. A futási összegzés `Files 36 ✓` értéket közölt, ami valószínűleg nem az egyedi exportált fájlok számát, hanem fájlműveleteket vagy generálási eseményeket jelölt. Ennek jelentése nem volt egyértelműen feltüntetve.

Az ellenőrzéshez nem telepítettünk dependencyket. Az alapvető hibák már telepítés nélkül bizonyíthatók voltak: hiányzott a belépési pont, nem léteztek a kötelező npm scriptek, és több import- illetve típushiba közvetlenül látszott a forrásban. Lockfile sem volt az exportban.

### A `package.json` problémái

A projekt mindössze egyetlen npm scriptet tartalmazott:

```json
"scripts": {
  "dev": "vite --host"
}
```

Nem készült `typecheck`, `test` vagy `build` script. A dependency-listából hiányzott a promptban kért `vitest` és `typescript` is, miközben a projekt több TypeScript- és tesztfájlt tartalmazott. Több csomag verziója `latest` volt, ami megismételhető build helyett időben változó dependency-feloldást eredményezhet.

### Hiányzó belépési pont

Az `index.html` az alábbi fájlt próbálta betölteni:

```html
<script type="module" src="/src/main.jsx"></script>
```

Az exportban azonban nem volt `src/main.jsx`. Emiatt az alkalmazás nem indulhatott el, így a felhasználói funkciók működése sem volt kipróbálható.

### Közvetlenül látható forráskódhibák

A statikus ellenőrzés több alapvető problémát talált:

- A `src/localStorageModule.ts` használta a `TaskState` típust, de nem importálta.
- A `src/taskOperations.ts` használta a `Task` és `TaskState` típusokat, de nem importálta őket.
- Ugyanez a modul egy hiányzó `./constants` fájlból próbált importálni.
- A kód `tasks.findState(...)` és `tasks.copy()` metódusokat hívott, holott a `TaskState` egyszerű objektumtípus, ilyen metódusai nincsenek.
- Az állapotnevek nem voltak egységesek: `Todo`, `In Progress`, `Done`, illetve `todos`, `inProgress`, `progress` és `done` változatok keveredtek.
- Több `.jsx` fájl TypeScript típusannotációkat tartalmazott, amelyeket a JavaScript/JSX parser nem fogad el.
- A `TaskList` a `redux` csomagból importált `useAppSelector` és `useAppDispatch` hookokat, amelyeket a csomag nem exportál.
- Több, egymással versengő `TaskList.jsx` és `TaskList.test.tsx` készült különböző könyvtárakban.
- A tesztek több helyen `jest.fn()` használatára épültek, miközben a követelmény Vitest volt, és megfelelő Vitest-konfiguráció vagy import nem készült.

Részleges pozitívum, hogy külön localStorage- és task-operation modul létrejött, és a forrásban nem találtunk `dangerouslySetInnerHTML` használatot. Ezek azonban nem ellensúlyozták a projekt futását megakadályozó hibákat.

### A kötelező parancsok eredménye

Az exportált projekt gyökerében a következő ellenőrzések futottak le:

```text
npm run typecheck  -> exit code 1, Missing script: "typecheck"
npm test -- --run  -> exit code 1, Missing script: "test"
npm run build      -> exit code 1, Missing script: "build"
```

Nem néhány sikertelen unit tesztről volt szó. A projekt még az ellenőrzések futtatásához szükséges scripteket sem tartalmazta, ezért sikeres typecheck-, teszt- vagy build-eredmény nem állhatott rendelkezésre.

A README ennek ellenére azt állította, hogy minden követelmény elkészült, és `npm test`, illetve `npm run build` parancsokat ajánlott. Ezek a parancsok a tényleges `package.json` alapján nem léteztek.

## Végső értékelés

A ForgeLab a vizsgált futásban valóban több munkafázist, agentszerepeket, review-t és két audititerációt kezelt. Ez arra utal, hogy a szolgáltatás mögött van orchestrációs munkafolyamat, nem csupán egyetlen hagyományos chatválasz készül.

A Free módban lefutott kontrollteszt azonban nem igazolta, hogy a rendszer egy kisebb fejlesztési feladatot megbízhatóan és önállóan végig tud vinni. A legsúlyosabb probléma nem pusztán a hibás generált kód volt, hanem a hibás végső minősítés: a rendszer saját hibalistája és futási hibája ellenére késznek, leszállítottnak és kritikus problémától mentesnek nevezte a projektet.

Egyetlen Free-mode futásból nem lehet a fizetős modellek vagy a szolgáltatás minden lehetséges konfigurációjának minőségére következtetni. Az első futás értékelését ráadásul gyengítette a Single Chat előzmény, valamint az, hogy a ForgeLab saját figyelmeztetése szerint a rendszer jelenleg JSX-fájlokat generál, és a teljes TypeScript-támogatás még nem érhető el. Emiatt egy második tesztet is elvégeztünk teljesen üres workspace-ben, kifejezetten támogatott plain JavaScript/JSX technológiával. Ennek eredménye külön fejezetben szerepel.

## Utólag feltárt ZIP-import és fájlfeltöltési hiba

A következő kontrollfutás előkészítésekor egy külön ForgeLab importhibát is találtunk. A helyileg validált forrás-ZIP bizonyíthatóan tartalmazta a `public/favicon.svg` fájlt, a ForgeLab által kibontott workspace fájllistájából azonban a teljes `public` mappa hiányzott. A fájllista frissítése után sem jelent meg.

A hiányzó fájlt ezután manuálisan próbáltuk pótolni. A ForgeLab az SVG formátumot `Not supported file format` üzenettel elutasította. Ugyanez történt PNG és ICO változattal is, ezért a képi asset a felületen keresztül sem volt visszatölthető.

Ez a megfigyelés **ZIP-import- és fájlformátum-kezelési hibának** minősül, nem az AI által generált alkalmazáskód hibájának. A feladatkezelő fő működését nem akadályozza, de az `index.html` favicon-hivatkozása miatt a böngésző egy 404-es assetkérést adhat mindaddig, amíg a hivatkozást el nem távolítják vagy szöveges data URI megoldással ki nem váltják.

Az esetet a következő futás értékelésében külön kell kezelni: nem szabad az agent implementációs hibájaként elszámolni, ugyanakkor a ForgeLab importált projektje nem tekinthető teljesen azonosnak a feltöltött ZIP tartalmával.

## Redundáns futásállapot-jelzés

Az újabb kontrollfutás közben egy kezelőfelületi következetlenség is láthatóvá vált. A `User stopped` esemény környezetében a ForgeLab az állapotot az esemény fölött és alatta is jelzi. A két kijelzés nem ad egyértelműen elkülönülő információt, ezért felesleges ismétlésnek hat, és bizonytalanná teheti, hogy melyik mutatja a futás tényleges, aktuális állapotát.

Ez önmagában nem bizonyít végrehajtási hibát, ezért nem az orchestráció működési eredményéhez, hanem **felhasználói felületi és állapotkommunikációs problémaként** került feljegyzésre. Célszerű lenne egyetlen elsődleges állapotjelzést használni, vagy világosan megkülönböztetni az eseményhez tartozó korábbi állapotot a jelenlegi futásállapottól.

### Téves vágólap-visszajelzés

A részletes futási panel alján található másolás ikon használatakor a felület pozitív `Copied!` visszajelzést adott, az operátor vágólapja azonban üres maradt. A sikerüzenet tehát nem a vágólapra írás igazolt eredményét jelezte.

Ez külön **vágólap-kezelési és hibás siker-visszajelzési problémának** minősül. A felületnek csak a másolási művelet sikeres befejezése után lenne szabad pozitív üzenetet adnia; böngészőengedély, API-hiba vagy más sikertelenség esetén egyértelmű hibaüzenetet és manuális másolási lehetőséget kellene biztosítania.

### Félreérthető környíl és megerősítés nélküli újrafuttatás

A másolás ikon melletti környíl használatakor a felület nem egyszerűen frissítette a megjelenített adatokat. Új agentválasz jelent meg azzal, hogy az Audit Board alkalmazást elölről kezdi felépíteni, majd megjelent egy `shell` / `cmd` eszközhívás az `ls -la` paranccsal. Ezzel egy időben a korábbi projektfutás részletes összegzése eltűnt a beszélgetés fő nézetéből.

A környíl ezért valójában újrapróbálási vagy újragenerálási műveletként viselkedett, miközben a megjelenése egyszerű adatfrissítést sugallt. A felület nem adott előzetes tájékoztatást arról, hogy új végrehajtást indít, és nem kért megerősítést a korábbi eredménynézet lecserélése előtt. A `View last run` vezérlő továbbra is elérhető maradt, ezért a korábbi Brain-futás feltehetően visszanézhető, de ez nem teszi egyértelművé vagy biztonságossá az ikon működését.

Ez **navigációs, állapotmegőrzési és művelet-megerősítési hibának** minősül. Az ikont `Retry` vagy `Regenerate` felirattal kellene ellátni, jelezni kellene a várható hatását, és új shell- vagy agentfutás indítása előtt megerősítést kellene kérnie.

### Beragadt futásjelző az újrapróbálás után

A környíllal véletlenül elindított újrapróbálás után tartósan forgó állapotjelző maradt látható, miközben új eredmény vagy fájlváltozás nem jelent meg. Egy külön 10 másodperces kontrollidőszak alatt sem a beszélgetés tartalma, sem a háromfájlos workspace, sem a hálózati kéréslista nem változott.

A lap belső HTML-struktúrájában a `Pause` és `Stop` gomb továbbra is engedélyezett elemként szerepelt, de mindkettő `0 × 0` képpontos területet foglalt el, nem jelent meg a képernyőn, és az operátor számára nem volt használható. A felület tehát aktív vagy beragadt futást jelzett anélkül, hogy ténylegesen elérhető leállítási vezérlőt biztosított volna.

A böngészőnapló eközben ismételten `has no filesCreated` és `partial ... retry` figyelmeztetéseket tartalmazott a hiányzó projektfájlokra, valamint megjelent a `newFile is not defined` hiba. Ezek együtt arra utalnak, hogy a végrehajtási vagy retry-állapot beragadt, illetve a felület nem szinkronizálta a futás tényleges végét.

Ez **beragadt végrehajtási állapotnak, stale státuszjelzésnek és elérhetetlen leállítási vezérlőnek** minősül. A rendszernek timeout vagy aktivitáshiány után egyértelmű hibát kellene jeleznie, meg kellene szüntetnie a forgó állapotot, és biztonságos egyszeri leállítási vagy helyreállítási lehetőséget kellene adnia.

### Részleges munkamenet-helyreállítás és elvesző auditnyom

A böngésző saját újratöltése után a ForgeLab főablaka jelent meg üres workspace-nézettel. A korábbi beszélgetés a `Recent Conversations` listából újra megnyitható volt. Megnyitás után a három tényleges projektfájl (`package.json`, `README.md`, `vite.config.js`) ismét láthatóvá vált, és nem indult új futás.

A korábbi Brain-futás részletes összegzése azonban nem állt helyre. Nem volt újra elérhető a `Complete` eredménykártya, a `Tasks (35/35)` lista, a 19 fájlt állító részletes panel vagy az audit- és progressinformáció. A beszélgetésből csak az eredeti prompt, valamint a környíllal véletlenül indított újrapróbálás rövid agent- és `ls -la` eszközüzenete maradt látható.

Ez **részleges munkamenet-helyreállítási és auditnyom-megőrzési hibának** minősül. Egy orchestratornak a projektfájlok mellett a futási tervet, agentszerepeket, feladatállapotokat, ellenőrzési eredményeket és végső döntést is tartósan és változatlanul visszanézhetővé kellene tennie. Enélkül egy későbbi felülvizsgálat nem tudja a felület saját állításaiból rekonstruálni, mi történt.

## Második kontrollfutás támogatott JavaScript/JSX stackkel

A TypeScript-korlátozás és a korábbi workspace-előzmény kizárására új, üres projektben megismételtük a tesztet. A prompt ezúttal kizárólag Vite, React, plain JavaScript/JSX, Vitest, React Testing Library, jsdom, plain CSS és böngésző `localStorage` használatát engedte. Kifejezetten tiltotta a TypeScriptet, a külső API-kat, a duplikált megvalósításokat, a placeholder útvonalakat, a kihagyott teszteket és a megadott fájllistán kívüli fájlokat.

A terv jóváhagyása előtt a ForgeLab 13 feladatot és körülbelül 13 fájlt jelzett. A futás végén azonban egymásnak ellentmondó állapotok jelentek meg:

- `Complete`;
- `Project delivered.`;
- minden fő fázis zöld pipát kapott, beleértve a tesztelést és az Audit Loopot;
- `Project complete`;
- `Final holistic review found no critical issues`;
- ezzel egy időben `Self-evaluation: 2/10 (1 strengths, 5 issues)`;
- valamint `3 thing(s) from your request may be missing`, amely a Vite/React és Vitest/React Testing Library követelményeket is megnevezte.

A részletes futási összegzés 19 elkészült fájlt állított. Ebben a kért fájlok mellett olyan, kifejezetten tiltott vagy hibás elemek is szerepeltek, mint a `package.js`, a gyökérszintű `App.jsx`, a `Sidebar.jsx`, a `path/to/file.jsx` és a `path/to/another-file.jsx`. Ez már önmagában megsértette az engedélyezett fájllistát és a placeholder útvonalak tilalmát.

A lenyitható progressnapló `Tasks (35/35)` állapotot mutatott. Zöld pipát kapott mind a 13 előírt fájl létrehozási feladata, köztük az `index.html`, a `src/main.jsx`, a `src/App.jsx` és mindhárom tesztfájl. Ugyanebben a naplóban később az `URGENT: Create missing file: index.html` javítófeladat is megjelent, szintén sikeresnek jelölve. Ez azt mutatja, hogy a rendszer egy korábban sikeresnek minősített fájlművelet után maga is észlelte a fájl hiányát, de a korábbi sikert nem érvénytelenítette, és a javítás eredményét sem ellenőrizte a tényleges workspace-állapot alapján.

A ForgeLab tényleges Files paneljén ugyanakkor csak három fájl volt látható:

- `package.json`;
- `README.md`;
- `vite.config.js`.

Ezt a kezelőfelületet használó operátor is megerősítette. A preview eközben az alábbi hibával állt meg:

```text
Failed to load url /src/main.jsx (resolved id: /src/main.jsx). Does the file exist?
```

Az exportált ZIP szintén pontosan ezt a három fájlt tartalmazta. Mérete 1513 bájt, SHA-256 lenyomata:

```text
3594EFE48E10B6E0BC48E1E70CF069DB6AABCD503FFE923128A4138AEDDBF2C7
```

Nem exportálási csonkolásról volt tehát szó: a workspace fájlpanelje és a ZIP azonos hiányos projektállapotot mutatott, miközben a futási összegzés 19 elkészült fájlt állított.

### A második export független validálása

A ZIP-et a Codex-Agent 5,6 Sol külön könyvtárba bontotta ki, ellenőrizte az archívumbejegyzéseket, majd lefuttatta a szükséges parancsokat. Az eredmény:

```text
npm ci        -> exit code 1, nincs package-lock.json
npm test      -> exit code 1, Missing script: "test"
npm run build -> exit code 1, Could not resolve entry module "index.html"
```

A dependencyk egy külön validációs másolaton, install scriptek futtatása nélkül sikeresen telepíthetők voltak, így a build eredménye nem hiányzó helyi csomagok miatt lett sikertelen. A `package.json` nem tartalmazott `test` scriptet, Vitestet, React Testing Libraryt vagy jsdomot. Az exportból hiányzott az `index.html`, a teljes `src` könyvtár, mindhárom előírt tesztfájl és az eredetileg megkövetelt `package-lock.json`.

A README ezzel szemben felsorolta a Vite + React, Vitest + React Testing Library, localStorage és akadálymentes vezérlők használatát, noha az ezeket megvalósító fájlok és tesztdependencyk nem voltak jelen. A dokumentáció tehát nem a tényleges exportált projektet írta le.

A második kontrollfutás elfogadási eredménye: **sikertelen**. Mivel ez a futás üres workspace-ben és a ForgeLab által támogatott JavaScript/JSX stackkel készült, az eredmény nem magyarázható sem korábbi projektmaradvánnyal, sem a TypeScript-támogatás hiányával.

## Harmadik kontrollfutás: minimális, egyfájlos HTML-oldal

A korábbi eredmények után egy szándékosan nagyon egyszerű feladattal is megismételtük a vizsgálatot. A cél annak eldöntése volt, hogy a rendszer képes-e csomagkezelő, framework, buildfolyamat és többfájlos projekt nélkül létrehozni egyetlen működő HTML-fájlt.

A harmadik kontrollprompt lényegi tartalma a következő volt:

```text
Build a tiny local-only web page called "Counter Check" as exactly one self-contained file: index.html.

Put all HTML, CSS, and JavaScript inside index.html. Create no other files.

Show a heading, a number starting at 0, and accessible Increase, Decrease and Reset buttons. Increase must add 1, Decrease must subtract 1, and Reset must restore 0. Use no packages, frameworks, external files, external URLs, APIs, images or build tools.

Confirm that exactly one file exists, open the preview, test the 0 -> 2 -> 1 -> 0 interaction sequence, and confirm that the browser console has no errors. Report Complete only if every check passes; otherwise report Validation failed with the exact reason.
```

A terv helyesen egy feladatot és körülbelül egy fájlt jelzett, mégis `medium` komplexitásúnak minősítette az egyfájlos oldalt, és körülbelül `47K FLT` költséget becsült hozzá. A fő beszélgetési modellt az új beszélgetés előtt ismét manuálisan `Free Openrouter Ai` értékre kellett állítani, miközben a Brain szerepkonfigurációja megmaradt. Ez arra utal, hogy a két beállítás tartóssága nem egységes.

A futás végén a ForgeLab ismét `Complete` és `Project delivered.` állapotot mutatott. A `Plan created`, `Frontend UI`, `Review & fixes`, `Audit loop` és `Finalize` fázis mind zöld pipát kapott. A részletes panel `Tasks (6/6)` eredményt közölt, és hatszor minősítette sikeresnek az `index.html` létrehozását. Ezek közül három feladat már kifejezetten `URGENT: Create missing file: index.html` megfogalmazással szerepelt. A rendszer tehát többször felismerte, hogy a fájl hiányzik, de minden javítási kísérletet sikeresnek jelölt anélkül, hogy a tényleges fájlállapotot ellenőrizte volna.

A részletes összegzés egy elkészült `index.html` fájlt állított. A tényleges Files panelen ezzel szemben kizárólag egy `README.md` volt látható; `index.html` nem létezett. A kért számlálóalkalmazás ezért nem volt megnyitható vagy funkcionálisan tesztelhető.

A Preview megnyitásakor a felület a feladat jellegével ellentétesen automatikusan az alábbi parancsot próbálta futtatni:

```text
npm install --legacy-peer-deps && npm run dev
```

A terminál két egymást követő próbálkozásnál is `ENOENT` hibát adott, mert a workspace-ben nem volt `package.json`:

```text
npm error code ENOENT
npm error syscall open
npm error enoent Could not read package.json
```

A terminál láthatóan `Error detected` állapotba került, ezek a hibák azonban nem jelentek meg a futás részletes eredményében, nem érvénytelenítették a zöld feladatállapotokat, és nem akadályozták meg a `Complete` minősítést. A rendszer ráadásul szükségtelen npm-alapú indítást választott egy kifejezetten csomag- és buildeszköz nélküli, önálló HTML-oldalhoz.

A harmadik kontrollfutás elfogadási eredménye: **sikertelen**. Ez a próba már olyan kis terjedelmű volt, hogy a kudarc nem magyarázható projektkomplexitással, TypeScript-korlátozással, dependency-problémával vagy többfájlos integrációval. A futás ismét azt bizonyította, hogy a ForgeLab végső success gate-je nincs megbízhatóan összekötve sem a tényleges workspace-fájllistával, sem a terminál eredményével.

### Olvashatóság 100%-os böngészőnagyításon

A kezelőfelület több fontos felirata 100%-os Chrome-nagyítás mellett 10–11 CSS-pixeles betűmérettel jelent meg; a `Details` és `Files` környezetében 11 pixeles érték volt mérhető. Ez nagy felbontású kijelzőn, rendszeroldali skálázás mellett is nehezen olvasható. A probléma nem érinti közvetlenül a generált projekt helyességét, de rontja az auditálhatóságot, mert éppen a futási részletek és fájlállapotok áttekintését nehezíti.

## Általános tanulság

Egy fejlesztési orchestrator végső sikerállapotát nem lenne szabad kizárólag a generáló modell szöveges önértékelésére építeni. A `completed` állapotnak tényleges, megismételhető ellenőrzésekből kellene következnie.

Ennek minimális feltételei:

- hiányzó ellenőrző script esetén nincs sikeres állapot;
- sikertelen typecheck, teszt vagy build mellett nincs `completed`;
- az audititerációk száma önmagában nem bizonyítja a projekt minőségét;
- a modell állításait és a géppel ellenőrzött tényeket külön kell megjeleníteni;
- stagnálás vagy romlás esetén a rendszer álljon meg, és kérjen emberi felülvizsgálatot.

A teszt legfontosabb eredménye tehát nem az, hogy a Free modell hibázott, hanem az, hogy a végső success gate nem tudta megkülönböztetni a működő projektet a bizonyíthatóan hibástól.
