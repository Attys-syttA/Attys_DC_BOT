# ForgeLab béta Free mód – átfogó teszt- és megbízhatósági értékelés

**Vizsgálat dátuma:** 2026. július 13.
**Vizsgált szolgáltatás:** ForgeLab béta, Free mód
**Teszt jellege:** kontrollált, több lépcsős külső működésvizsgálat
**A tesztpromptokat készítette és az exportokat validálta:** Codex-Agent 5,6 Sol
**Összesített eredmény:** az orchestráció létezése látható, de a többfájlos fejlesztési feladatok lezárása és sikerességi ellenőrzése nem bizonyult megbízhatónak
**Javasolt összesített súlyosság:** magas

Hangsúlyozom, hogy nem vagyok programozó. A felülettel a teszt során ismerkkedtem meg. A teszthez az OpenAI Codex-agent volt segítségemre, az 5,6 Sol motorral. A teszt nyers szövegezése is ezért olyan amilyen. Bár próbáltam emberi hangnemre állítani.
Remélem azért hasznos lesz számodra!

## Vezetői összefoglaló

A teszt során A vizsgálat arra a gyakorlati kérdésre kereste a választ, hogy a ForgeLab valóban képes-e egy fejlesztési feladatot önállóan felbontani, több agentszereppel végrehajtani, ellenőrizni, kijavítani és csak akkor késznek minősíteni, amikor a leszállított program ténylegesen működik.

A tesztsorozat alapján a válasz két részre bontható.

Az első rész kedvező: a felületen valóban látható tervezés, agentszerepekre bontott munka, végrehajtási fázisok, review, Audit Loop, újrapróbálás és végső értékelés. Egy megfelelően kiválasztott Conductor persona egy nagyon egyszerű, egyfájlos HTML-feladatot körülbelül 15 másodperc alatt helyesen is elkészített. Ez arra utal, hogy a szolgáltatás nem pusztán egy hagyományos chatválaszt jelenít meg orchestrációs díszítéssel.

A második rész azonban súlyos problémát mutatott. A többfájlos React-feladatoknál, valamint több korábbi egyszerű kontrollnál a rendszer olyan fájlokat és sikeres feladatokat jelentett, amelyek a tényleges munkaterületen és az exportált ZIP-ben nem léteztek. A Preview és a terminál hibái, a hiányzó forrásfájlok, a hiányzó tesztek, a nem nulla parancskilépési kódok, sőt a rendszer saját 2/10 vagy 4/10 önértékelése sem akadályozta meg a `Complete`, `Project delivered.` és `Final holistic review found no critical issues` állapotot.

A fő következtetés ezért nem az, hogy a Free modell időnként gyenge kódot ír. A központi hiba az, hogy a végső sikerállapot nincs megbízhatóan összekötve a tényleges fájlrendszerrel, a parancsok exit code-jával, a tesztfuttató eredményével és a működő böngésző-előnézettel. A rendszer több esetben felismerte a hibákat, de ez a felismerés nem jutott el a lezárási döntésig.

## Mit állítottunk be a Free módhoz?

A vizsgálat saját API-kulcs nélkül történt. Nem adtunk meg OpenRouter BYOK-kulcsot, nem használtunk fizetős modellt, külön Forge Tokent, adatbázist, deployt vagy GitHub-kapcsolatot.

A Free konfigurációhoz a fő modellt és az öt agentszerepet is `Free Openrouter Ai` értékre állítottuk:

- Architect;
- Senior Developer;
- Bug Hunter – Deep;
- Bug Hunter – Fast;
- Conductor.

A futásoktól függően a következő kapcsolókat használtuk:

- `Include workspace context`;
- `Brain`;
- `Audit`;
- `Conductor (Orchestrator)` persona.

A teszt során kiderült, hogy a Brain szerepbeállításai megmaradtak, a fő beszélgetési modell viszont új beszélgetésnél vissza tudott állni, ezért azt többször manuálisan újra Free értékre kellett tenni. A Conductor persona sem volt minden esetben alapértelmezett; kézzel kellett kiválasztani.

## A vizsgálat módszere

Nem a felület zöld pipáit tekintettük önmagukban eredménynek. Minden érvényes futásnál különválasztottuk:

1. mit állított a ForgeLab;
2. mi látszott a tényleges Files panelen;
3. mi került az exportált ZIP-be;
4. milyen eredményt adott a Preview és a Terminal;
5. lefuthattak-e a promptban előírt ellenőrző parancsok;
6. összhangban volt-e a végső `Complete` állapot a bizonyítékokkal.

A ZIP-eket a Codex-Agent 5,6 Sol külön ellenőrzési könyvtárban bontotta ki és validálta. Ahol a projektcsomag ezt lehetővé tette, ténylegesen lefutott az `npm ci`, az `npm test`, illetve az `npm run build`. A parancsok sikerességét az exit code alapján értékeltük, nem a README állításai vagy az agentek szöveges összefoglalói alapján.

A véletlenül elindított, azonnal leállított vagy más futás állapotával összekeveredett próbálkozásokat nem tekintettük önálló kontrolleredménynek.

## A tesztsorozat áttekintése

| Futás | Beállítás és feladat | ForgeLab lezárása | Tényleges eredmény | Döntés |
|---|---|---|---|---|
| 1. Audit Board, TypeScript | Free modellek, Brain + Audit; a munkaterületet korábbi Single Chat fájlok szennyezték | `Complete`, 30 javított hiba, 2 auditkör | 19 exportált fájl, de nincs működő belépési pont, hiányzó scriptek és súlyos forráskódhibák | Sikertelen; módszertani korlátozással |
| 2. Audit Board, JavaScript/JSX | üres workspace, támogatott stack, Brain + Audit | `35/35`, 19 fájl, `Project delivered.` | 3 fájl; nincs `index.html`, nincs `src`, nincs teszt | Sikertelen |
| 3. Counter Check | pontosan egy önálló `index.html`, Brain + Audit | `6/6`, `DONE · 1`, `Complete` | csak `README.md`; npm `ENOENT` hibák | Sikertelen |
| 4. Counter Check, tiszta Conductor-kontroll | Conductor persona, egyszerű egyfájlos feladat, Brain nélkül | sikeres befejezés | működő `index.html`, a számláló viselkedése ellenőrizhető; körülbelül 15 másodperc | Sikeres |
| 5. Audit Board, TypeScript, Conductor | Conductor + Brain + Audit | `44/44`, 21 fájl, `Complete` | 3 fájl; a 16 alapfájlból 13 hiányzott; Preview-hiba | Sikertelen |
| 6. Audit Board, JavaScript/JSX, Conductor | üres workspace, támogatott stack, Conductor + Brain + Audit | `26/26`, 18 fájl, `Complete` | 3 fájl; minden fájlgeneráló feladat `filesCreated: []`; üres Preview | Sikertelen |

Az eredménytábla fontos része a negyedik futás. Ez mutatja, hogy a Conductor kiválasztása és a feladat egyszerűsége valóban számít. Ugyanakkor azt is megmutatja, hogy az egyszerű sikerből nem következik a többfájlos Brain-workflow megbízhatósága.

## 1. futás – TypeScript Audit Board

Az első összetett feladat egy kis, böngészőben futó feladatkezelő volt. A felhasználó feladatot hozhatott volna létre, azt `Todo`, `In Progress` és `Done` állapotok között mozgathatta volna, törölhette és szűrhette volna. Az állapotot `localStorage` tárhelyen kellett megőrizni. A prompt külön TypeScript-modult kért a feladatműveletekhez, külön storage-modult, valós Vitest-teszteket, README-t, valamint typecheck-, teszt- és buildellenőrzést.

Ennél a futásnál két korlátozást már a vizsgálat során ismertünk:

- a ForgeLab figyelmeztetett, hogy teljes TypeScript-támogatás még nincs, és JSX-generálás történhet;
- a helyes Brain-futás előtt ugyanaz a kérés véletlenül Single Chat módban elindult, így a munkaterület nem volt teljesen tiszta.

Ezeket nem hallgattuk el, ezért önmagában ez a futás nem lett volna elegendő messzemenő következtetéshez. Az Audit Loopnak azonban ilyen helyzetben is vagy ki kellett volna javítania a projektet, vagy sikertelen állapotot kellett volna adnia.

A ForgeLab a végén a következőket közölte:

- `Complete`;
- `Project delivered.`;
- `Project complete`;
- `Final holistic review found no critical issues`;
- `Audit loop done, 30 issue(s) fixed in 2 iteration(s)`.

Ugyanazon az eredményen belül viszont `⚠ 4 failed`, `Tasks (64/68)`, `Frontend UI 17/19`, `Tests 4/6` és el sem kezdett dokumentáció is látszott. A Vite ismételten jelezte, hogy a `/src/main.jsx` nem található.

Az exportált projektben közvetlenül látható volt több hiányzó import, kevert állapotmodell, JSX-fájlba került TypeScript-szintaxis, hibás Redux-import és egymással versengő implementáció. A `package.json` nem tartalmazott `typecheck`, `test` vagy `build` scriptet. A három kötelező ellenőrzés ezért egyaránt exit code 1 eredménnyel állt le.

Ez a futás sikertelen volt, de a TypeScript-korlátozás és a szennyezett kezdőállapot miatt szükség volt tisztább kontrollokra.

## 2. futás – támogatott JavaScript/JSX Audit Board

A második Audit Board teljesen üres workspace-ből indult, és kizárólag a ForgeLab által támogatott technológiákat kérte:

- Vite;
- React;
- plain JavaScript és JSX;
- Vitest;
- React Testing Library;
- jsdom;
- plain CSS;
- böngésző `localStorage`.

A prompt előre meghatározta a szükséges fájlstruktúrát, megtiltotta a TypeScriptet, a Reduxot, a backendet, a külső API-t, a duplikált implementációkat, a placeholder útvonalakat és a kihagyott teszteket. Legalább három tesztfájlt és tíz valódi tesztet kért. `Complete` eredményt csak sikeres teszt, build, Preview, konzol- és hálózati ellenőrzés után engedett volna.

A ForgeLab 13 feladatból álló tervet készített. A futás végén mégis 35/35 sikeres feladatot és 19 elkészült fájlt jelentett. Az összes fő fázis zöld lett, és megjelent a `Project delivered.` üzenet.

A részletes fájllista olyan elemeket is sikeresnek jelölt, amelyeket a prompt kifejezetten tiltott:

- `package.js`;
- gyökérszintű `App.jsx`;
- `Sidebar.jsx`;
- `path/to/file.jsx`;
- `path/to/another-file.jsx`.

A tényleges Files panelen és az exportált ZIP-ben azonban pontosan három fájl volt:

```text
package.json
README.md
vite.config.js
```

Az archívum 1513 bájtos volt, SHA-256 lenyomata:

```text
3594EFE48E10B6E0BC48E1E70CF069DB6AABCD503FFE923128A4138AEDDBF2C7
```

A független validálás eredménye:

```text
npm ci        -> exit code 1, nincs package-lock.json
npm test      -> exit code 1, Missing script: "test"
npm run build -> exit code 1, Could not resolve entry module "index.html"
```

A dependencyk külön kontrollmásolaton, install scriptek nélkül telepíthetők voltak, így a buildkudarcot nem lehetett pusztán a hiányzó `node_modules` könyvtárral magyarázni. Maga az alkalmazás, a belépési pont és a tesztkészlet hiányzott.

A ForgeLab ugyanakkor 2/10-es önértékelést és hiányzó követelményeket is jelzett. Ez a 2/10 közelebb állt a valósághoz, mint a végső `Complete`, de a leszállított program szempontjából még ez is nagyvonalú: működő alkalmazás és futó teszt nélkül legfeljebb az alapkonfiguráció és a terv értékelhető részleges eredményként.

## 3. futás – minimális Counter Check

A következő kontroll már nem React-projekt volt. Pontosan egyetlen önálló `index.html` fájlt kértünk, amely minden HTML-, CSS- és JavaScript-kódot magában tartalmaz. A számlálónak három hozzáférhető gombbal kellett végrehajtania a 0 → 2 → 1 → 0 műveletsort. A prompt külön megtiltotta a csomagokat, frameworköt, külső fájlokat, URL-eket, API-kat és buildeszközöket.

A ForgeLab ezt a feladatot `medium` komplexitásúnak és körülbelül `47K FLT` költségűnek becsülte. A futás végén `Tasks (6/6)`, `DONE · 1`, `index.html`, `Complete` és `Project delivered.` állapotot mutatott.

A tényleges Files panelen ezzel szemben csak egy `README.md` létezett. A hat sikeresnek jelölt feladat közül három már `URGENT: Create missing file: index.html` szöveggel szerepelt. A rendszer tehát többször észlelte a hiányt, de minden javítást sikeresnek jelölt anélkül, hogy a fájl valóban létrejött volna.

A Preview a statikus oldal helyett szükségtelenül ezt próbálta futtatni:

```text
npm install --legacy-peer-deps && npm run dev
```

Mivel `package.json` sem volt, a Terminal kétszer `ENOENT` hibával állt le. A hiba és az `Error detected` jelzés nem került be a végső összegzésbe, és nem érvénytelenítette a `Complete` állapotot.

Ez a kontroll kizárta, hogy a kudarc oka kizárólag a többfájlos integráció, a React, a TypeScript vagy egy bonyolult dependency-fa volna.

## 4. futás – sikeres, tiszta Conductor Counter-kontroll

A persona szerepének ellenőrzésére a minimális egyfájlos feladatot tiszta új beszélgetésben, `Conductor (Orchestrator)` personával is megismételtük. A Brain nem volt bekapcsolva. Ez a futás körülbelül 15 másodperc alatt létrehozta a kért `index.html` fájlt, és a számláló működőképes volt.

Ez a siker fontos, mert két dolgot mutat:

1. a ForgeLab Free módja képes lehet helyes, gyors eredményt adni egy kellően egyszerű feladatra;
2. a persona kiválasztása érdemben befolyásolja a működést.

Ugyanakkor ez a próba nem igazolta a Brain többagentű, többfájlos munkafolyamatát. Éppen ellenkezőleg: a későbbi Conductor + Brain futások ismét ugyanabba a fájlállapot- és success-gate hibába ütköztek.

## 5. futás – TypeScript Audit Board Conductor + Brain + Audit módban

A TypeScript Audit Boardot később Conductor personával is megismételtük. A ForgeLab előzetesen helyesen figyelmeztetett arra, hogy a teljes TypeScript-támogatás nem áll rendelkezésre. Ezt a korlátozást az értékelésnél figyelembe vettük: a hiányzó TypeScript-modulok önmagukban nem ugyanolyan súlyúak, mint egy deklaráltan támogatott stack hibái.

A futás azonban nem csak TypeScript-fájlokat veszített el. A ForgeLab `44/44` feladatot és 21 fájlt jelzett, miközben a tényleges Files panel és az export ismét csak ezt a három fájlt tartalmazta:

```text
package.json
README.md
vite.config.js
```

Az archívum 1489 bájtos volt, SHA-256 lenyomata:

```text
8463CB178197F99704292AE02B61DB46022EF604C6082A00FBC2CCF8D34D8C04
```

A 16 alapvető elvárt fájlból 13 hiányzott. Nem volt `index.html`, `src/main.jsx`, `src/App`, alkalmazáslogika, stílus vagy teszt. A `package.json` nem tartalmazott TypeScript- és Vitest-függőségeket, valamint test/typecheck scriptet sem. A Preview ismét a hiányzó `/src/main.jsx` miatt állt le.

A rendszer 4/10-es önértékelést adott, mégis kritikus probléma nélküli, leszállított projektként zárt. A TypeScript-figyelmeztetés magyarázhatott bizonyos formátumhibákat, de nem magyarázta az `index.html`, a JSX-, CSS-, JavaScript- és tesztfájlok teljes hiányát.

## 6. futás – JavaScript/JSX Audit Board Conductor + Brain + Audit módban

Az utolsó kontroll ugyanazt a részletes Audit Board feladatot kérte teljesen TypeScript-mentesen, üres workspace-ben, Conductor personával, bekapcsolt Brain és Audit mellett.

### Már a terv feldolgozásakor megjelent az eltérés

A jóváhagyásra megjelenített emberi terv 13 feladatot és a lényegében helyes fájllistát tartalmazta. A háttérben létrejött tényleges task queue azonban már a futás előtt eltért ettől:

- `package.json` helyett `package.js` került a feladatlistába;
- gyökérszintű `storage.js` és `taskOperations.js` duplikátumok jelentek meg;
- a `vite.config.js` és a `README.md` nem szerepelt megfelelő önálló taskként;
- a rendszer a prompt tiltása ellenére azt jelezte, hogy Backend és API lett kérve.

Ez arra utal, hogy a tervező szöveges eredménye és a végrehajtónak átadott feladatlista között külön konverziós vagy állapotszinkronizációs hiba van.

A tervmodal azt is jelezte, hogy a körülbelül `611K FLT` becslés meghaladja a 0 FLT egyenleget. Free béta környezetben a futás ennek ellenére elindult. Ebből nem lehet biztos számlázási következtetést levonni, de a felület nem tette egyértelművé, hogy az egyenlegjelzés csak tájékoztató, valós korlátozás vagy várható megszakítás.

Már a terv jóváhagyása előtt megjelent a Files panelen a `package.json` és a `vite.config.js`. Egy jóváhagyás előtti tervnézetben ez szintén állapotkezelési kérdést vet fel: a felület nem teszi világossá, hogy mikor kezdődik ténylegesen a fájlmódosítás.

### A futás közben

Az eredeti 13 taskból 28 belső task lett. A rendszer sorban `URGENT: Create missing file` pótfeladatokat hozott létre, de mindegyik fájlgeneráló task `filesCreated: []` értékkel zárult. Ennek ellenére valamennyi `completed` állapotot kapott.

A böngésző konzoljában 85 figyelmeztetés szerepelt. A visszatérő minta minden tervezett forrásfájlnál ez volt:

```text
Task task_N has no filesCreated, checking VFS...
Task task_N partial (...), retry 1/2
Task task_N partial (...), retry 2/2
```

Megjelent továbbá körkörös taskfüggőségre utaló figyelmeztetés, egy HTTP 500 hiba és a `newFile is not defined` jellegű fájlkezelési hiba is.

A felhasználói Terminal a futás elején és jelentős részében gyakorlatilag üres volt. Később hibaüzenetek is megjelentek benne. A helyes megállapítás tehát nem az, hogy a Terminal egyáltalán nem naplózott, hanem az, hogy a hibanapló késve és következetlenül vált láthatóvá. A végső ellenőrzéskor a panel már csak `Refreshed` szöveget mutatott, miközben a böngészőkonzol megőrizte a sikertelen fájlgenerálás nyomait.

### A végső állapot

A ForgeLab a következőket mutatta:

- `Complete`;
- `Project delivered.`;
- `Tasks (26/26)`;
- `DONE · 18` fájl;
- sikeres Frontend UI, Review & fixes, Audit loop és Finalize;
- `Project complete`;
- `Final holistic review found no critical issues`.

Ugyanott azonban ez is látható volt:

- hiányzó `src` könyvtár és forráskód;
- hiányzó task creation komponens;
- `Self-evaluation: 2/10 (3 strengths, 6 issues)`;
- a Tests és Documentation állapot `requested, not started`;
- téves Backend és API `requested, not started` jelzés.

A részletes panel 18 fájlt állított, köztük tiltott placeholder és duplikált útvonalakat. A tényleges Files panelen továbbra is csak három fájl volt, a Preview pedig üres maradt.

Az exportált ZIP 1462 bájtos volt, SHA-256 lenyomata:

```text
8A7D07C9D1A6A6B2AE31A7B84C41622BB224F53C2979EDAE54B20589A699B658
```

Tartalma:

```text
package.json   365 bájt
vite.config.js 202 bájt
README.md      575 bájt
```

A `package.json` csak `dev`, `build` és `preview` scriptet tartalmazott. Nem volt `test` script, Vitest, React Testing Library vagy jsdom. Az `npm test` exit code 1 eredménnyel, `Missing script: "test"` hibával állt le. A frissen kibontott exportban az `npm run build` szintén exit code 1 lett, mert a dependencyk nem voltak telepítve; ettől független, közvetlen blokkoló tény, hogy az exportból az `index.html` és a teljes alkalmazáskód is hiányzott.

A futás belső kezdő- és befejezési időpontja alapján a végrehajtás körülbelül 7 perc 25 másodpercig tartott. Ezalatt a rendszer több tucat újrapróbálást végzett, de a háromfájlos munkaterületet nem tudta működő alkalmazássá alakítani.

## A legfontosabb rendszerszintű problémák

### 1. A task sikerállapota nem bizonyít fájllétrehozást

Több futásban zöld pipát kapott az `index.html`, a `src/main.jsx`, a tesztfájlok és más források létrehozása úgy, hogy ezek az útvonalak nem léteztek. Az utolsó futás belső állapotában minden fájltask `filesCreated: []` értékkel lett `completed`.

Ez a legközvetlenebb bizonyíték arra, hogy a task státusza jelenleg nem a fájlművelet utóellenőrzéséből származik.

### 2. A javítási kísérlet nem érvényteleníti a korábbi hibás sikert

Az `URGENT: Create missing file` task önmagában elismeri, hogy egy korábban sikeresnek jelölt fájl hiányzik. A rendszer mégsem vonta vissza az eredeti sikert, és a pótlási próbát is automatikusan sikeresnek minősítette.

Így a tasklista idővel egyre több zöld pipát gyűjtött, miközben a projekt nem lett teljesebb.

### 3. A success gate nem fail-closed

A `Complete` állapot megjelent:

- hiányzó belépési pont mellett;
- hiányzó `src` könyvtár mellett;
- hiányzó tesztek és test script mellett;
- nem nulla parancs-exit-code mellett;
- Preview-hiba mellett;
- 2/10 és 4/10 önértékelés mellett;
- fennmaradó hiányjelzések mellett.

Egy megbízható orchestratornak ilyen esetben `Validation failed`, `Incomplete` vagy `Needs review` állapotot kellene adnia.

### 4. Az Audit Loop felismerései nem befolyásolják a lezárást

A rendszer több hibát maga is észlelt: hiányzó fájlokat, hiányzó követelményeket, rossz önértékelést és sikertelen Preview-t. A hiba tehát nem kizárólag felismerési probléma. A felismerés és a végső állapotgép között hiányzik a kötelező blokkoló kapcsolat.

### 5. A terv és a végrehajtási task queue eltérhet

Az utolsó JavaScript/JSX futásnál az embernek mutatott terv megfelelő `package.json`, `vite.config.js`, `src` és README struktúrát írt le, a háttérben létrejött task queue viszont `package.js`, gyökérszintű duplikátumok és hiányzó dokumentációs taskok felé torzult.

Ez külön problémakör a modell kódminőségétől: a helyes terv még a végrehajtás megkezdése előtt hibás feladatlistává alakult.

### 6. A végső riport nem a tényleges workspace-ből származik

A részletes összesítések 18, 19 vagy 21 fájlt közöltek, miközben a Files panel és az exportált ZIP három fájlt tartalmazott. Másik futásnál az összegzés egy `index.html` fájlt állított, a workspace-ben pedig csak `README.md` volt.

A végső fájllistát friss, közvetlen workspace-lekérdezésből kellene előállítani, nem az agentek tervezett műveleteinek összesítéséből.

### 7. A Preview és a Terminal nincs megbízhatóan bekötve a döntésbe

A Preview többször jelezte a hiányzó `/src/main.jsx` fájlt. Az egyfájlos HTML-kontrollnál a Terminal két `ENOENT` hibát adott. Ezek a hibák nem tették sikertelenné a futást.

A Terminal naplója ráadásul késve vagy részlegesen jelent meg, ezért az operátor a futás közben sokáig nem látta ugyanazokat a problémákat, amelyeket a böngészőkonzol már rögzített.

## Felületi és kezelhetőségi problémák

Ezek nem mind azonos súlyúak a hibás `Complete` állapottal, de együtt jelentősen rontják az auditálhatóságot.

### Téves Backend/API figyelmeztetés

A prompt kifejezetten megtiltotta a backendet és a külső API-t. A terv és a végső státusz mégis úgy kezelte ezeket, mintha kért, de el nem kezdett részek lennének. Valószínű, hogy a követelményfelismerés a kulcsszavakat érzékeli, a tagadást azonban nem mindenhol viszi tovább helyesen.

### Másolás ikon hamis sikerjelzése

A részletek melletti másolás ikon `Copied!` visszajelzést adott, miközben a vágólap üres maradt. A felület csak a vágólapművelet igazolt sikere után jelezhetne pozitív eredményt.

### Frissítésnek látszó Retry/Regenerate művelet

A környíl egyszerű frissítésnek tűnt, de megerősítés nélkül új agentfutást indított. A korábbi részletes eredmény eltűnt a fő nézetből. Az ikonnak egyértelmű `Retry` vagy `Regenerate` feliratot, hatásleírást és megerősítést kellene kapnia.

### Beragadt futásjelző és elérhetetlen Stop

Az újrapróbálás után a futásjelző aktív maradt látható munka nélkül. A lap szerkezetében létezett Pause és Stop vezérlő, de 0 × 0 képpontos mérettel nem volt használható. Egy orchestratornál az aktív munka és a leállítás lehetősége mindig egyértelmű kell legyen.

### Részleges munkamenet-helyreállítás

Újratöltés után a beszélgetés és a három tényleges fájl visszatért, a részletes Brain-futás, tasklista, auditkör és korábbi döntés azonban részben elveszett. Ez megnehezíti egy hiba későbbi rekonstruálását és a szolgáltató felé történő bizonyítását.

### ZIP-import és képfeltöltés

Egy külön importpróbánál a helyi ZIP bizonyíthatóan tartalmazott `public/favicon.svg` fájlt, a ForgeLab által kibontott workspace-ből viszont a teljes `public` mappa hiányzott. A manuális SVG-, PNG- és ICO-feltöltés `Not supported file format` választ adott. Ez külön import- és fájlformátum-kezelési hiba, nem az agent által írt alkalmazáskód hibája.

### Apró betűméret

A futási részletek több fontos felirata 100%-os Chrome-nagyításon 10–11 CSS-pixeles volt. Nagy felbontású kijelzőn ez nehezen olvasható, éppen ott, ahol az operátornak taskokat, fájlokat és hibákat kellene összevetnie.

### Akadozó Brain-animáció

A Brain futásjelzője nem folyamatos forgásnak, hanem ugráló, újrakezdődő animációnak látszott. A megfigyelt működés alapján valószínű, hogy a gyakori UI-frissítés újraindítja az egy másodperces CSS-animációt, ezért annak csak bizonyos fázisai jelennek meg. Ez felületi hiba, de a futás bizonytalan állapotérzetét erősíti.

### Redundáns állapotjelzés

A `User stopped` környezetében az állapot a kártya felett és alatt is megjelent anélkül, hogy világos lett volna, melyik a korábbi esemény és melyik az aktuális futásállapot.

## Mi működött értékelhetően?

A teszt nem azt mutatta, hogy a ForgeLab minden eleme használhatatlan.

Pozitívumként értékelhető:

- a rendszer képes strukturált tervet készíteni;
- láthatóan elkülöníti a tervezés, megvalósítás, review, audit és lezárás fázisait;
- több agentszerepet és modellt képes kezelni;
- felismer bizonyos hiányzó fájlokat és követelményeket;
- exportálható munkaterületet biztosít;
- a tiszta Conductor persona egyszerű, egyfájlos feladatnál gyors és helyes eredményt adott;
- a TypeScript-korlátozásra előzetesen figyelmeztetett.

Ezek valós termékirányt és részben működő orchestrációt mutatnak. A gond az, hogy a hibafelismerés, az agentjelentések és a tényleges leszállítás között még nincs megbízható, géppel ellenőrzött lezárási kapu.

## Igaz lehet-e az az állítás, hogy elég kiadni a parancsot?

Korlátozott értelemben igen. A felhasználó kiadhat egy összetett parancsot, a rendszer pedig tervet készít, szerepeket rendel hozzá és több fázison keresztül dolgozik. A Conductor egyszerű kontrollja azt is megmutatta, hogy bizonyos kis feladatoknál valóban létrejöhet működő eredmény kevés emberi beavatkozással.

A vizsgált Free béta állapotban azonban nem igazolódott az erősebb állítás: hogy a felhasználó egy többfájlos fejlesztési feladatot kiad, majd megbízhatóan kész, tesztelt és auditált programot kap vissza. A rendszer többször késznek nevezett bizonyíthatóan hiányos vagy nem létező alkalmazást.

A jelenlegi helyzetet ezért így lehet pontosan megfogalmazni:

> A ForgeLab képes automatikus orchestrációs folyamatot indítani és részfeladatokat kezelni, de a vizsgált Free béta környezetben a többfájlos eredmény tényleges elkészülte és a `Complete` állapot megbízhatósága nem volt igazolt.

## Súlyossági értékelés

A fő hibát magas súlyosságúnak tartjuk.

Nem áll rendelkezésre bizonyíték adatvesztésre, jogosultságkikerülésre, titokszivárgásra vagy más biztonsági kompromittálásra, ezért a kritikus besorolás túlzó lenne.

A magas besorolást viszont indokolja, hogy:

- a rendszer nem létező fájlokat és teszteket jelent sikeresnek;
- a hibás siker több, egymástól független kontrollban megismétlődött;
- a Preview és a terminál hibái nem blokkolják a lezárást;
- az Audit Loop saját negatív felismerései sem állítják meg a sikert;
- a felhasználó a zöld státuszok alapján működő projektet feltételezhet;
- az export és a részletes riport jelentősen eltérhet egymástól.

## Valószínű hibaterületek

A ForgeLab belső, fizetős kódja nem állt rendelkezésre, ezért a következők külső viselkedésből levont következtetések, nem forráskóddal igazolt gyökérokok.

Valószínű hibaterületek:

1. a planner kimenetének task queue-vá alakítása;
2. a fájllétrehozási agentválaszok parserelése;
3. a task sikerállapot és a virtuális fájlrendszer közötti kapcsolat;
4. az újrapróbálás utáni státuszérvénytelenítés;
5. a Preview és Terminal eredmények becsatornázása;
6. az Audit Loop megállapításainak hatása a végső állapotgépre;
7. a végső fájllista és riport adatforrása;
8. a beszélgetés és az auditnyom tartós mentése;
9. a tagadó követelmények értelmezése;
10. a főmodell- és persona-beállítások perzisztenciája.

## Javasolt javítási sorrend

### 1. Fail-closed `Complete` állapot

A futás csak akkor lehessen `Complete`, ha minden kötelező validáció bizonyíthatóan teljesült. Hiányzó adat vagy ismeretlen állapot ne számítson sikernek.

### 2. Fájlműveletek utóellenőrzése

Fájllétrehozási task csak akkor legyen sikeres, ha a megadott útvonal a művelet után ténylegesen létezik, olvasható és – ahol értelmezhető – nem üres. A végső fájllista közvetlen, friss workspace-lekérdezésből származzon.

### 3. Kötelező parancseredmények

A promptban vagy tervben név szerint előírt parancsokhoz rögzíteni kell:

- a pontos parancsot;
- a munkakönyvtárat;
- a kezdési és befejezési időt;
- az exit code-ot;
- a rövidített stdout/stderr eredményt.

Nem nulla exit code mellett ne legyen automatikus siker.

### 4. Audit- és retry-állapot érvénytelenítése

Ha létrejön egy `URGENT: Create missing file` feladat, az eredeti fájltask sikere automatikusan váljon érvénytelenné. A pótlási task csak friss fájlellenőrzés után kaphasson zöld állapotot.

### 5. Terv és task queue összehasonlítása

A jóváhagyás előtt a rendszer géppel hasonlítsa össze az embernek mutatott fájllistát a végrehajtási task queue-val. Eltérés, duplikált útvonal, `package.js`/`package.json` névcsere vagy tiltott placeholder esetén ne induljon el a build.

### 6. Preview- és böngészőkapu

A Preview csak akkor legyen sikeres, ha a fő dokumentum betöltődött, a szükséges script- és stylesheet-kérések nem hibáztak, a böngészőkonzolban nincs új error, és az előírt interakciós ellenőrzések lefutottak.

### 7. Őszinte végső állapot

A `Complete`, `Validation failed`, `Incomplete`, `Stopped` és `Needs review` állapot legyen egyértelműen elkülönítve. A 2/10-es önértékelés és hiányzó forráskód mellett a rendszer ne használhassa a `Project delivered.` kifejezést.

### 8. Tartós auditnyom

A terv, task queue, agentszerepek, fájlműveletek, parancseredmények, audititerációk és végső döntés újratöltés után is változatlanul legyen visszanézhető és szövegesen exportálható.

### 9. UI-műveletek egyértelműsítése

- a környíl kapjon `Retry` vagy `Regenerate` feliratot és megerősítést;
- a Stop mindig látható és használható legyen aktív futásnál;
- a copy csak igazolt másolás után jelezzen sikert;
- az állapotjelzés ne legyen duplikált;
- a fontos auditfeliratok legyenek legalább normál olvasási méretűek;
- a Brain-animáció ne induljon újra minden állapotfrissítésnél.

## Javítás utáni elfogadási feltételek

A fő hibát akkor tekintenénk lezárhatónak, ha ugyanazon kontrollok megismétlésekor az alábbiak teljesülnek.

### Counter Check

- pontosan egy `index.html` létezik;
- a részletes riport és a Files panel ugyanazt mutatja;
- a Preview csomagtelepítés nélkül megnyílik;
- a 0 → 2 → 1 → 0 műveletsor működik;
- nincs konzol- vagy terminálhiba;
- szándékosan hiányzó fájlnál `Validation failed` jelenik meg.

### JavaScript/JSX Audit Board

- az előírt fájlstruktúra ténylegesen létezik;
- nincs placeholder vagy duplikált implementáció;
- az eredeti export tartalmaz lockfile-t;
- az `npm ci`, az `npm test` és az `npm run build` exit code 0 eredményt ad;
- legalább három tesztfájlban legalább tíz valódi teszt fut le;
- a Preview renderel;
- a feladat létrehozása, mozgatása, szűrése, törlése és perzisztenciája működik;
- a konzol és a szükséges hálózati kérések hibamentesek;
- a `Complete` csak ezek után jelenik meg.

### Negatív kontroll

A rendszerrel szándékosan hiányzó fájlt, hibás importot és exit code 1 parancsot is tesztelni kell. Mindhárom esetben kötelezően sikertelen végállapotot várunk. Ez bizonyítaná, hogy a javítás nemcsak a happy pathot tette zölddé, hanem a lezárási kapu valóban fail-closed lett.

## Módszertani korlátok

A teszt a Free béta környezetet vizsgálta. Ebből nem lehet biztos következtetést levonni minden fizetős modell, jövőbeli verzió vagy eltérő konfiguráció minőségére.

Az első TypeScript-futás kezdőállapota nem volt tiszta, és a ForgeLab maga is jelezte a TypeScript-támogatás korlátozását. Emiatt ezt a futást nem kezeltük önmagában döntő bizonyítékként. A későbbi, üres workspace-ből induló plain JavaScript/JSX tesztek és az egyfájlos HTML-kontroll azonban ezeket a zavaró tényezőket kizárták.

A szolgáltatás belső forráskódja nem volt elérhető. A gyökérokokra vonatkozó megállapítások ezért következtetések. A fájllisták, ZIP-tartalmak, hash-ek, parancseredmények és látható állapotok viszont közvetlenül ellenőrzött bizonyítékok.

## Reprodukcióhoz javasolt minimális prompt

Az alábbi prompt a legsúlyosabb success-gate hibát framework, dependency és többfájlos integráció nélkül képes ellenőrizni:

```text
Build a tiny local-only web page called "Counter Check" as exactly one self-contained file: index.html.

Put all HTML, CSS, and JavaScript inside index.html. Create no other files.

Requirements:
- Show the heading "Counter Check".
- Show a clearly visible number starting at 0.
- Add three accessible buttons named "Increase", "Decrease", and "Reset".
- "Increase" adds 1.
- "Decrease" subtracts 1.
- "Reset" sets the number back to 0.
- Use a clean, responsive layout.
- Do not use packages, frameworks, external files, external URLs, APIs, images, or build tools.

Validation:
1. Confirm that exactly one file exists: index.html.
2. Open the preview and confirm the initial value is 0.
3. Click Increase twice and confirm the value is 2.
4. Click Decrease once and confirm the value is 1.
5. Click Reset and confirm the value is 0.
6. Confirm that the browser console has no errors.

Report "Complete" only if index.html exists, exactly one file was created, the preview works, every interaction check passes, and no console error remains. Otherwise report "Validation failed" and state the exact failure.
```

Javítás után ezt legalább két personával érdemes lefuttatni: az alapértelmezett beállítással és a `Conductor (Orchestrator)` personával. A két eredménynek azonos fájl- és validációs igazságot kell mutatnia.

## Végső következtetés

A ForgeLab Free béta felületén valódi orchestrációs elemek láthatók, és egy egyszerű Conductor-kontrollban működő program is létrejött. Ezért nem volna pontos azt állítani, hogy a rendszer semmire sem képes vagy csak látszatmunkát végez.

A vizsgálat ugyanakkor ismételten megmutatta, hogy a többfájlos Brain-workflow és a végső `Complete` állapot jelenleg nem tekinthető önmagában megbízható bizonyítéknak. A rendszer olyan projekteket nevezett leszállítottnak, amelyekből hiányzott maga az alkalmazás, a belépési pont és a tesztkészlet. Az Audit Loop részben felismerte ezeket a hibákat, de nem tudta vagy nem volt jogosult megakadályozni a hamis sikeres lezárást.

A szolgáltatás jelen állapotában használható lehet kísérleti prototípus-készítésre és ember által folyamatosan ellenőrzött munkára. Olyan folyamatban azonban, ahol a felhasználó egyetlen parancs után felügyelet nélkül kész és validált programot vár, a vizsgált Free béta még nem bizonyult megbízhatónak.

## Rendelkezésre álló kiegészítő bizonyítékok

A jelentésben szereplő szöveges adatokon túl szükség esetén átadhatók:

- a tesztfutásokból exportált projekt-ZIP archívumok;
- a ZIP-ek fájllistái, méretei és SHA-256 lenyomatai;
- a teljes kontrollpromptokat és részletes parancseredményeket tartalmazó külön szöveges riportok;
- néhány képernyőkép a ForgeLab kezelőfelületéről, a futási állapotokról és a fájllisták eltéréséről;
- néhány képernyőkép a Terminal és a böngészőkonzol hibaüzeneteiről;
- egy rövid képernyőfelvétel az akadozó Brain-animációról és kapcsolódó GUI-viselkedésről.

Ezeket nem csatoltuk automatikusan a szöveges hibajelentéshez, de a szolgáltatás tulajdonosának vagy fejlesztőinek kérésére külön rendelkezésre tudnak állni.
