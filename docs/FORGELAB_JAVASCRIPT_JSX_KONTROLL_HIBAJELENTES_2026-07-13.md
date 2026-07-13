# ForgeLab Free mód – JavaScript/JSX kontrollfutás hibajelentése

**Vizsgálat dátuma:** 2026. július 13.
**Vizsgált működés:** Brain + Audit orchestráció, támogatott plain JavaScript/JSX stack
**Teszt jellege:** üres munkaterületről induló, helyi React-alkalmazás
**Eredmény:** sikertelen futás, téves `Complete` minősítéssel
**Javasolt súlyosság:** magas

## Rövid összefoglaló

A kontrollfutás célja egy korábbi teszt két lehetséges zavaró tényezőjének kizárása volt. Ezért teljesen üres munkaterületet, valamint a ForgeLab által támogatott Vite + React + plain JavaScript/JSX technológiát használtunk. TypeScript nem szerepelt a kérésben.

A feladat egy kis, böngészőben működő „Audit Board” alkalmazás elkészítése volt valós tesztekkel, production builddel és szigorú befejezési feltételekkel. A rendszer a futás végén `Complete`, `Project delivered.` és `Final holistic review found no critical issues` eredményt adott. A részletes napló 35/35 sikeres feladatot és 19 elkészült fájlt állított.

A tényleges Files panelen és az exportált ZIP-ben ezzel szemben mindössze három fájl volt:

- `package.json`;
- `README.md`;
- `vite.config.js`.

Hiányzott az `index.html`, a teljes `src` könyvtár, az alkalmazáskód, mindhárom előírt tesztfájl és az eredetileg megkövetelt `package-lock.json`. A Preview nem tudta betölteni a nem létező `src/main.jsx` fájlt. Független ellenőrzésben az `npm ci`, az `npm test` és az `npm run build` is hibával állt le.

A legsúlyosabb probléma nem önmagában a hiányos generálás, hanem az, hogy a ForgeLab a saját 2/10-es önértékelése, hiányjelzései, a futásképtelen Preview és a tényleges fájlállapot ellenére is kész projektként minősítette az eredményt.

## Miért volt szükség erre a kontrollra?

Egy korábbi Audit Board futás TypeScriptet kért, miközben a ForgeLab figyelmeztetése szerint a szolgáltatás akkor még JSX-fájlokat generált, és a teljes TypeScript-támogatás későbbi fejlesztésnek számított. A korábbi munkaterület előzményei szintén befolyásolhatták az eredményt.

Ezért a második tesztet az alábbi korlátozásokkal indítottuk:

- teljesen új, üres munkaterület;
- kizárólag támogatott plain JavaScript és JSX;
- nincs TypeScript;
- nincs korábbi projektmaradvány;
- nincs Redux, backend, adatbázis, hitelesítés vagy külső API;
- nincs deploy vagy GitHub-kapcsolat;
- nincs kép vagy favicon;
- nincs dátum- vagy időmező;
- előre meghatározott fájlstruktúra és mérhető elfogadási feltételek.

Ezzel a teszt kizárta, hogy a kudarc pusztán TypeScript-konverzióból vagy korábbi munkaterületből eredjen.

## A teszt beállítása

A futás Free módban, saját API-kulcs nélkül történt. A fő modell `Free Openrouter Ai` volt, és a Brain szerepei is Free modellre voltak beállítva. A `Brain`, az `Audit` és az `Include workspace context` aktív volt. A rendszer olvashatta, szerkeszthette, létrehozhatta és törölhette a munkaterület fájljait.

A promptot a Codex-Agent 5,6 Sol készítette. A futás után ugyanez az agent ellenőrizte a felület tényleges fájllistáját, a Preview hibáját, az exportált ZIP tartalmát és a megismételhető parancseredményeket.

## Elvárt program

Az Audit Board egy kis, helyi feladatkezelő lett volna. A felhasználónak képesnek kellett volna lennie:

- kötelező címmel feladatot létrehozni;
- a feladatot `Todo`, `In Progress` és `Done` állapot között mozgatni;
- feladatot törölni;
- állapot szerint szűrni;
- állapotonkénti darabszámot látni;
- az adatokat a böngésző `localStorage` tárhelyén megőrizni;
- oldalfrissítés után visszakapni a mentett feladatokat.

Az üres vagy csak szóközt tartalmazó címet hozzáférhető hibaüzenettel kellett volna elutasítani. A megvalósításnak React local state-re, külön task-operation és storage modulra, egyetlen alkalmazásbelépési pontra és plain CSS-re kellett épülnie.

Az elfogadáshoz legalább három tesztfájlt és tíz valódi, engedélyezett tesztet kértünk. Az `npm test` és `npm run build` parancsnak 0 exit code-dal kellett volna befejeződnie, a Preview-nak pedig konzol- és hálózati hiba nélkül kellett volna megjelennie.

## A futás folyamata

### 1. Tervezés

A ForgeLab a jóváhagyásra megjelenített tervben 13 feladatot és körülbelül 13 fájlt jelzett. A terv alapvetően felismerte a React-alkalmazás, a task-operation modul, a storage modul, a tesztek, a build és az audit szükségességét.

A tervben megjelent egy óvatossági megjegyzés is arról, hogy kerülni fogja a `dangerouslySetInnerHTML`, a külső adatbázisok és API-k, a megengedett listán kívüli fájlok, a duplikált implementációk, valamint a placeholder vagy kihagyott tesztek használatát. Ez nem veszélyjelzés volt, hanem a prompt tiltásainak összefoglalása.

A terv jóváhagyása után a rendszer végrehajtotta a Brain-fázisokat. A felület a tervezést, a projektalapot, a frontendmunkát, a review-t, az Audit Loopot és a lezárást külön progressállapotként mutatta.

### 2. Megvalósítás és ismételt javítási kísérletek

A lenyitható részletes napló végül `Tasks (35/35)` állapotot közölt. Zöld pipát kapott mind a 13 előírt fájl létrehozása, köztük:

- `index.html`;
- `src/main.jsx`;
- `src/App.jsx`;
- `src/styles.css`;
- `src/taskOperations.js`;
- `src/storage.js`;
- a három kötelező tesztfájl.

Ugyanebben a naplóban később megjelent az `URGENT: Create missing file: index.html` javítófeladat is, szintén sikeresként megjelölve. Ez azt mutatja, hogy a rendszer egy korábban már sikeresnek minősített fájlművelet után maga is észlelte az `index.html` hiányát. A korábbi sikert azonban nem érvénytelenítette, és a javítás után sem ellenőrizte a tényleges fájlállapotot.

### 3. Audit és végső minősítés

A futás végén a ForgeLab az alábbi állításokat tette:

- `Complete`;
- `Project delivered.`;
- minden fő fázis sikeres;
- `Project complete`;
- `Final holistic review found no critical issues`.

Ezzel egy időben ugyanazon eredménykörnyezetben az alábbi negatív értékelések is megjelentek:

- `Self-evaluation: 2/10 (1 strengths, 5 issues)`;
- `3 thing(s) from your request may be missing`;
- a hiányjelzés külön megnevezte a Vite + React, valamint a Vitest + React Testing Library követelményeket.

A végső sikerállapot tehát nemcsak a tényleges exporttal, hanem a rendszer saját önértékelésével is ellentmondásban állt.

## A részletes fájlösszegzés és a tényleges workspace eltérése

A részletes futási összegzés 19 elkészült fájlt állított. A felsorolásban a megkövetelt fájlok mellett olyan elemek is megjelentek, amelyeket a prompt kifejezetten tiltott vagy amelyek nyilvánvalóan hibás útvonalat képviseltek. A megfigyelt példák:

- `package.js`;
- gyökérszintű `App.jsx`;
- `Sidebar.jsx`;
- `./styles.css`;
- `path/to/file.jsx`;
- `path/to/another-file.jsx`.

Ez sértette a megadott fájllistát, a placeholder útvonalak tilalmát és a duplikált implementációk elkerülésére vonatkozó követelményt.

A jobb oldali tényleges Files panel viszont csak három fájlt tartalmazott:

```text
package.json
README.md
vite.config.js
```

Nem arról volt szó, hogy az alkalmazáskód hibásan jelent meg: az alkalmazáskód egyáltalán nem volt jelen a munkaterületen.

## Preview-eredmény

A Preview az alábbi hibával állt meg:

```text
Failed to load url /src/main.jsx (resolved id: /src/main.jsx). Does the file exist?
```

Ez közvetlenül igazolta, hogy az alkalmazás belépési pontja hiányzik. A prompt szigorú befejezési feltétele szerint már önmagában ez is kizárta volna a `Complete` minősítést.

## Az exportált ZIP független ellenőrzése

Az export mérete 1513 bájt volt. SHA-256 lenyomata:

```text
3594EFE48E10B6E0BC48E1E70CF069DB6AABCD503FFE923128A4138AEDDBF2C7
```

Az archívum pontosan három bejegyzést tartalmazott:

```text
package.json   365 bájt
vite.config.js 202 bájt
README.md      626 bájt
```

Az export tehát megegyezett a Files panel háromfájlos állapotával. Nem egy kizárólag exportáláskor bekövetkezett adatvesztésről volt szó; a workspace és a ZIP ugyanazt a hiányos projektet mutatta.

## A parancsok ellenőrzési eredménye

### `npm ci`

Az eredeti ZIP friss, érintetlen kibontásán:

```text
npm ci -> exit code 1
```

Az ok a hiányzó `package-lock.json` volt. Az npm közölte, hogy a clean install csak meglévő lockfile mellett futtatható.

Fontos módszertani részlet: egy külön validációs másolaton később végrehajtott dependency-telepítés már létrehozott egy helyi lockfile-t. Ez a validációs segédfájl nem volt része az eredeti exportnak. Az `npm ci` elfogadási eredménye ezért az eredeti, frissen kibontott ZIP-en mért exit code 1.

### Dependencyk telepítése kontrollmásolaton

A hiányos projekt dependencyi egy külön ellenőrzési másolaton, install scriptek futtatása nélkül telepíthetők voltak:

```text
npm install --ignore-scripts --no-audit --no-fund -> exit code 0
```

Ezt azért végeztük el, hogy a buildet ne lehessen pusztán a helyileg hiányzó `node_modules` könyvtárral magyarázni. A telepítés nem javította és nem egészítette ki az eredeti export forrásfájljait.

### `npm test`

```text
npm test -> exit code 1
npm error Missing script: "test"
```

A `package.json` egyáltalán nem tartalmazott `test` scriptet. Vitest, React Testing Library és jsdom dependency sem szerepelt benne. Emiatt sem három tesztfájl, sem tíz sikeres teszt nem létezett.

### `npm run build`

```text
npm run build -> exit code 1
Could not resolve entry module "index.html".
```

A dependencyk telepítése után a Vite elindult, de 0 modult tudott feldolgozni, majd a hiányzó `index.html` miatt leállt. Ez bizonyítja, hogy a build nem dependencytelepítési probléma, hanem hiányzó alkalmazásforrás miatt bukott el.

### A `package.json` tényleges tartalma

A fájl csak az alábbi scripteket tartalmazta:

```text
dev
build
preview
```

Nem tartalmazott `test` scriptet. A dependencylista Reactet, React DOM-ot, Vite-ot és a React Vite plugint tartalmazta, de a teszteléshez előírt eszközöket nem.

## A README pontatlansága

A README azt állította, hogy a projekt Vite + React alapú Audit Board, Vitest + React Testing Library tesztekkel, localStorage-perzisztenciával és hozzáférhető vezérlőkkel. Tesztelési és buildparancsokat is ajánlott.

Ezeket az állításokat az export tartalma nem támasztotta alá:

- nem volt React-alkalmazáskód;
- nem volt `index.html` vagy `src/main.jsx`;
- nem volt task-operation vagy storage modul;
- nem voltak tesztfájlok;
- nem volt `test` script vagy tesztdependency;
- a build bizonyíthatóan hibával állt le.

A dokumentáció tehát nem a ténylegesen leszállított projektet írta le.

## Befejezés utáni kezelőfelületi hibák

### Téves másolási visszajelzés

A részletes futási panel alján található másolás ikon használatakor a felület `Copied!` visszajelzést adott, de a vágólap üres maradt. A sikerüzenet nem a másolási művelet igazolt eredményét jelezte.

### Félreérthető környíl

A másolás ikon melletti környíl frissítésnek látszott, de megerősítés nélkül újrapróbálást indított. Új agentválasz jelent meg:

```text
I'll build the Audit Board application from scratch. Let me start by confirming the workspace and creating an implementation plan.
```

Ezután egy `shell` / `cmd` eszközlépés és az `ls -la` parancs jelent meg. A korábbi részletes projektösszegzés eltűnt a beszélgetés fő nézetéből.

### Beragadt újrapróbálási állapot

Az újrapróbálás után a futásjelző tovább forgott, miközben egy külön 10 másodperces megfigyelési időszakban sem a beszélgetés, sem a fájllista, sem a hálózati aktivitás nem változott. A felület belső szerkezetében `Pause` és `Stop` vezérlő szerepelt, de mindkettő 0 × 0 képpontos területű, láthatatlan és használhatatlan volt.

A böngészőnaplóban eközben ismétlődő `has no filesCreated` és `partial ... retry` figyelmeztetések, valamint `newFile is not defined` hiba jelent meg. Ez arra utalt, hogy a retry-állapot és a tényleges workspace nem volt szinkronban.

### Részleges munkamenet-helyreállítás

A böngésző saját újratöltése után a mentett beszélgetés újra megnyitható volt, és a három tényleges fájl ismét megjelent. A korábbi `Complete` kártya, a `Tasks (35/35)` lista, a 19 fájlt állító részletes panel, valamint az audit- és progressinformáció azonban nem állt helyre.

A megmaradt beszélgetés az eredeti promptot és a véletlen újrapróbálás rövid agent- és `ls -la` üzenetét tartalmazta. A futási auditnyom tehát nem volt tartósan rekonstruálható.

## Eredménytábla

| Ellenőrzés | ForgeLab állítása | Független eredmény |
|---|---|---|
| Fő futásállapot | `Complete`, `Project delivered.` | Sikertelen |
| Feladatok | `35/35` sikeres | A szükséges fájlok többsége hiányzott |
| Fájlok | 19 elkészült fájl | 3 tényleges fájl |
| `index.html` | létrehozva, majd javítva | hiányzik |
| `src/main.jsx` | létrehozva | hiányzik |
| Tesztfájlok | létrehozva | mindhárom hiányzik |
| `package-lock.json` | elvárt projektfájl | hiányzik az exportból |
| `npm ci` | nem közölt hiteles eredményt | exit code 1 friss exporton |
| `npm test` | teljesítésre utaló zöld állapotok | exit code 1, nincs `test` script |
| `npm run build` | teljesítésre utaló zöld állapotok | exit code 1, nincs `index.html` |
| Preview | ellenőrzöttnek jelzett | nem tölthető be a hiányzó `src/main.jsx` miatt |
| Önértékelés | `2/10`, 5 probléma | összhangban van a kudarccal |
| Végső review | `no critical issues` | ellentmond a bizonyítékoknak |

## Elfogadási döntés

A kontrollfutás eredménye: **sikertelen**.

A szigorú befejezési kapu egyetlen feltételét sem lehetett igazolni:

- az `npm test` nem adott 0 exit code-ot;
- az `npm run build` nem adott 0 exit code-ot;
- nem volt három tesztfájl;
- nem volt tíz sikeres teszt;
- a `src/main.jsx` hiányzott;
- a Preview nem renderelt;
- a szükséges fájlok és importok nem léteztek;
- a fájlstruktúra nem egyezett a tervvel;
- tiltott placeholder és duplikált fájlnevek jelentek meg a részletes összesítésben.

A prompt előírta, hogy ilyen helyzetben `Validation failed` eredményt, pontos hibás parancsot, exit code-ot és fennmaradó problémalistát kell közölni. A ForgeLab ehelyett `Complete` állapotot adott.

## Miért magas súlyosságú?

A hiba a fejlesztési orchestrator eredményének megbízhatóságát érinti. A felhasználó a zöld fázisok, a 35/35 feladat és a `Project delivered.` üzenet alapján működő projektet feltételezhetne, miközben az exportban nincs alkalmazás.

A probléma több ellenőrzési rétegen is átjutott:

- a fájllétrehozási feladatok sikere nem egyezett a workspace-szel;
- a javítási feladat nem érvénytelenítette a korábbi hibás sikert;
- a Preview hibája nem állította meg a lezárást;
- a teszt- és buildfeltételek teljesülése nem volt bizonyítható;
- a saját 2/10-es önértékelés nem befolyásolta a végső állapotot;
- a futás részletes auditnyoma újratöltés után részben elveszett.

Adatvesztést vagy biztonsági kompromittálást ez a vizsgálat nem igazolt, ezért a kritikus besorolás nem indokolt. A hibás leszállítási és auditállapot miatt azonban a magas súlyosság megfelelő.

## Valószínű hibaterület

A belső implementáció nem állt rendelkezésre, ezért a gyökérok nem állapítható meg bizonyossággal. A külső viselkedés alapján valószínű, hogy a végső success gate nincs fail-closed módon összekötve:

- a tényleges workspace-fájllistával;
- az egyes fájlműveletek utóellenőrzésével;
- a parancsok exit code-jával;
- a Preview és a böngészőkonzol állapotával;
- a tesztfájlok és tesztesetek valós számlálásával;
- az Audit Loop által talált fennmaradó problémákkal.

Ez következtetés, nem forráskóddal igazolt gyökérok.

## Javasolt javítás

1. A fájllétrehozási feladat csak a megadott útvonal tényleges létezése és olvashatósága után lehessen sikeres.
2. A végső fájllista mindig friss workspace-lekérdezésből származzon, ne agent-szövegből vagy tervezett műveletekből.
3. `URGENT: Create missing file` feladat létrejöttekor a korábbi fájlsiker automatikusan váljon érvénytelenné.
4. A `Complete` állapothoz kötelező legyen a név szerint előírt parancsok igazolt 0 exit code-ja.
5. Hiányzó script, hiányzó fájl, Preview-hiba vagy konzolhiba esetén a futás fail-closed módon `Validation failed` állapotba kerüljön.
6. A tesztfájlok és tesztesetek száma a tesztfuttató gépi eredményéből származzon.
7. Az Audit Loop fennmaradó hibái és az önértékelés befolyásolják a végső döntést; 2/10 mellett ne legyen automatikus siker.
8. A részletes riport és a workspace fájlpanel közötti eltérés önálló blokkoló hibának számítson.
9. A retry vezérlő kapjon egyértelmű feliratot és megerősítést, a korábbi auditnyom pedig maradjon változatlanul visszanézhető.
10. A copy visszajelzés csak igazolt vágólapírás után jelezzen sikert.

## Javítás utáni elfogadási feltételek

Ugyanezzel a prompttal megismételve a hibát akkor lehet lezártnak tekinteni, ha:

- a tényleges workspace és a részletes fájlösszegzés azonos fájllistát mutat;
- az összes előírt fájl létezik, a tiltott és placeholder fájlok pedig nem;
- az eredeti export tartalmazza a `package-lock.json` fájlt;
- az `npm ci`, az `npm test` és az `npm run build` 0 exit code-dal zárul;
- legalább három tesztfájlban legalább tíz valódi teszt fut sikeresen;
- a Preview renderel, a konzol és a hálózat hibamentes;
- a feladat létrehozása, mozgatása, szűrése, törlése és perzisztenciája böngészőben működik;
- a `Complete` állapot csak ezek igazolása után jelenik meg;
- szándékosan hiányzó fájl vagy hibás parancs esetén a rendszer `Validation failed` állapotot ad;
- a futási terv, agentszerepek, parancsok, exit code-ok és auditdöntés újratöltés után is visszanézhetők.

## Függelék – a teljes kontrollprompt

```text
Build a small local-only application called “Audit Board”.

This is a clean greenfield project. Start from an empty workspace.

Work autonomously from planning through implementation, testing, browser
validation, and audit.

Do not ask questions unless a requirement is impossible.

SUPPORTED TECHNOLOGY:

- Vite
- React
- plain JavaScript
- JSX
- Vitest
- React Testing Library
- jsdom
- plain CSS

Do not add Redux, Redux Toolkit, a backend, authentication, a database,
an external API, a CSS framework, or a UI component library.

Do not deploy the project.
Do not connect GitHub.
Do not add date or time fields in this first test.
Do not add a favicon or any other image asset.

FUNCTIONAL REQUIREMENTS:

1. Users can create a task with a required title.

2. Every task has exactly one of these states:
- todo
- in-progress
- done

3. Display the states to users as:
- Todo
- In Progress
- Done

4. New tasks must start in the Todo state.

5. Users must be able to move tasks between all three states.

6. Users must be able to delete tasks.

7. Users must be able to filter tasks by:
- All
- Todo
- In Progress
- Done

8. Display the number of tasks in each state.

9. Persist all tasks in browser localStorage.

10. Tasks must remain after the browser page is reloaded.

11. Empty or whitespace-only task titles must be rejected.

12. Title validation must trim leading and trailing whitespace.

13. Validation errors must appear as an accessible error message.

14. All inputs, buttons, filters, status controls, and delete actions must have
accessible names.

15. Do not use dangerouslySetInnerHTML.

16. Do not execute task titles as commands. Task titles are plain user data.

ARCHITECTURE REQUIREMENTS:

Use one consistent task model:

{
id: string,
title: string,
status: "todo" | "in-progress" | "done"
}

Use React local state only.

Keep task operations in:

src/taskOperations.js

This module must contain focused functions for:

- task creation;
- title validation;
- status changes;
- deletion;
- filtering;
- counting tasks by state.

Keep localStorage access in:

src/storage.js

This module must contain focused functions for:

- serialization;
- deserialization;
- loading tasks;
- saving tasks;
- safely handling missing or invalid stored data.

Use one main React application:

src/App.jsx

Use one application entry point:

src/main.jsx

Use one stylesheet:

src/styles.css

Do not create duplicate App, TaskList, storage, task-operation, or test
implementations.

Do not create placeholder paths such as:

- path/to/file
- example/file
- temporary/component

Do not create Redux stores, reducers, slices, or providers.

Do not mutate task arrays or task objects in place.

Use immutable array operations.

Generate task identifiers with crypto.randomUUID() when available, with a safe
local fallback.

EXPECTED PROJECT STRUCTURE:

package.json
package-lock.json
index.html
vite.config.js
README.md
src/main.jsx
src/App.jsx
src/styles.css
src/taskOperations.js
src/storage.js
src/test/setup.js
src/taskOperations.test.js
src/storage.test.js
src/App.test.jsx

Small additional components may be created only when they remove real
duplication. Every created file must be used by the application or tests.

PACKAGE REQUIREMENTS:

The package.json must include working scripts for:

- npm run dev
- npm test
- npm run build

The test script must run Vitest once without watch mode.

Use concrete compatible dependency versions.
Do not use “latest” dependency versions.
Generate and keep package-lock.json.

Install only the dependencies required for:

- React;
- Vite;
- the official React Vite plugin;
- Vitest;
- jsdom;
- React Testing Library;
- jest-dom matchers.

Do not install unrelated packages.

TEST REQUIREMENTS:

Use Vitest APIs.
Do not use Jest globals such as jest.fn().
Do not create placeholder, skipped, or todo tests.

Create real tests for:

1. creating a task with a valid title;

2. trimming a valid title;

3. rejecting an empty title;

4. rejecting a whitespace-only title;

5. changing a task from Todo to In Progress;

6. changing a task from In Progress to Done;

7. deleting a task;

8. filtering by each state;

9. counting tasks in each state;

10. serializing and deserializing tasks;

11. returning an empty task list for invalid stored JSON;

12. saving and loading tasks through localStorage;

13. rendering accessible form controls;

14. showing an accessible validation error;

15. creating, moving, filtering, and deleting a task through the rendered UI.

The test suite must contain at least three test files and at least ten meaningful
tests.

README REQUIREMENTS:

Document only commands that actually exist in package.json.

Include:

- prerequisites;
- installation;
- local development;
- testing;
- production build;
- a short feature description;
- a statement that task data stays in browser localStorage.

Do not include fake clone URLs.
Do not claim that a command passed unless it was actually executed.

IMPLEMENTATION PROCESS:

1. Confirm that the workspace is empty or contains only files created for this
project.

2. Create a concise implementation plan.

3. List the exact files that will be created.

4. Create the project foundation.

5. Implement task operations and storage.

6. Implement the React user interface.

7. Add real tests.

8. Install only the required dependencies.

9. Run:

npm test

10. Run:

npm run build

11. Start the local preview.

12. Verify the application in the browser.

13. Run the Audit Loop.

AUDIT LOOP REQUIREMENTS:

Check all of the following:

- src/main.jsx exists;
- index.html references src/main.jsx;
- every local import resolves to a real file;
- there are no duplicate application implementations;
- there are no unused alternative task models;
- status values are consistent in every file;
- task operations do not mutate their inputs;
- localStorage loading handles invalid data safely;
- all required npm scripts exist;
- all tests are real and enabled;
- there are no Jest-only APIs;
- the browser preview renders;
- there are no browser console errors;
- there are no failed document, script, or stylesheet requests;
- all required accessible names exist.

Fix discovered problems and rerun every affected validation command.

STRICT COMPLETION GATE:

Report “Complete” only if all of the following are true:

- npm test exits with code 0;
- npm run build exits with code 0;
- at least three test files pass;
- at least ten meaningful tests pass;
- no test is skipped;
- src/main.jsx exists;
- every local import resolves;
- the browser preview renders successfully;
- the browser console contains no errors;
- no required network request fails;
- no duplicate implementation remains.

If any condition fails:

- do not report “Complete”;
- report “Validation failed”;
- identify the exact failed command;
- include its exit code;
- list every remaining known problem;
- do not claim that there are no critical issues.

FINAL REPORT:

At the end provide:

1. the implementation plan;

2. the agent responsible for each phase;

3. every file created or changed;

4. every command actually executed;

5. the exit code of every validation command;

6. the number of test files passed;

7. the number of tests passed;

8. the issues discovered by the Audit Loop;

9. the fixes made by the Audit Loop;

10. the final test, build, browser-preview, console, and network results.
```

## Végkövetkeztetés

A támogatott JavaScript/JSX kontrollfutás nem igazolta, hogy a ForgeLab Free módja képes egy kis fejlesztési feladatot megbízhatóan végigvinni és ellenőrizni. Az eredményből nem hiányzott néhány kisebb részlet: maga az alkalmazás, a belépési pont és a teljes tesztkészlet hiányzott.

A teszt legfontosabb tanulsága, hogy a végső `Complete` állapot nem származhat kizárólag agentjelentésekből. Csak a tényleges fájlállapot, a név szerint előírt parancsok exit code-ja, a tesztfuttató eredménye és a böngészővalidáció együtt adhat megbízható lezárást.
