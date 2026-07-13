# ForgeLab Free mód – hibajelentés a „Counter Check” kontrollfutásról

**Vizsgálat dátuma:** 2026. július 13.
**Érintett felület:** ForgeLab Brain mód, Free modell, Audit bekapcsolva
**Eredmény:** sikertelen futás, téves `Complete` minősítéssel
**Javasolt súlyosság:** magas

## Rövid összefoglaló

A ForgeLab egy szándékosan minimális feladatot kapott: hozzon létre pontosan egy önálló `index.html` fájlt, benne egy egyszerű számlálóval. A feladathoz nem kellett framework, csomagkezelő, buildeszköz, külső fájl vagy API.

A rendszer a futás végén `Complete` és `Project delivered.` állapotot közölt, minden fő fázist sikeresnek jelölt, és a részletes eredmény szerint létrehozta az `index.html` fájlt. A tényleges fájlpanelen azonban kizárólag egy `README.md` jelent meg. Az elvárt `index.html` nem létezett, ezért a kért weboldal sem készülhetett el.

A Preview megnyitásakor a rendszer ennek ellenére npm-alapú fejlesztői környezetet próbált indítani. A terminál kétszer `ENOENT` hibával állt le a hiányzó `package.json` miatt. Ezek a hibák nem jelentek meg a végső futási összesítésben, és nem akadályozták meg a sikeres minősítést.

Ez nem egyszerűen gyenge kódgenerálási eredmény. A fő hiba az, hogy a futás végső állapota ellentmondott a tényleges fájllistának és a terminál bizonyítható hibáinak.

## A teszt környezete

A vizsgálat Free módban, saját API-kulcs megadása nélkül történt. A fő beszélgetési modell `Free Openrouter Ai` volt. A `Brain`, az `Audit` és az `Include workspace context` beállítás aktív volt, a rendszer pedig jogosultságot kapott projektfájl létrehozására.

A munkaterület a futás kezdetén üres volt. Nem importáltunk korábbi projektet, nem adtunk át képet vagy más csatolmányt, és nem kértünk adatbázist, deployt, GitHub-kapcsolatot vagy külső szolgáltatást.

A kontrollfeladat promptját a Codex-Agent 5,6 Sol készítette. A futás után ugyanez az agent vetette össze a ForgeLab részletes sikerjelzéseit a tényleges fájlpanellel és a terminál kimenetével.

## A teljes prompt

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

## Elvárt eredmény

A feladat akkor lett volna elfogadható, ha:

- pontosan egy fájl, az `index.html` jön létre;
- a fájl tartalmazza a teljes HTML-, CSS- és JavaScript-megvalósítást;
- a Preview közvetlenül megnyitja az oldalt, csomagtelepítés nélkül;
- a számláló kezdeti értéke 0;
- két növelés után 2, egy csökkentés után 1, majd reset után ismét 0 látható;
- nem jelenik meg böngészőkonzol- vagy terminálhiba;
- a rendszer csak ezek igazolása után ad `Complete` eredményt.

## A ForgeLab által közölt eredmény

A befejezési kártyán az alábbi pozitív állapotok jelentek meg:

- `Complete`;
- `Project delivered.`;
- `Plan created`;
- `Frontend UI`;
- `Review & fixes`;
- `Audit loop`;
- `Finalize`;
- `Project complete`;
- `Code generation done, reviewing the build`.

A részletes panel `Tasks (6/6)` eredményt mutatott. Mind a hat feladat zöld pipát kapott. Három feladat a számlálóoldal létrehozását állította, további három pedig már kifejezetten így szólt:

```text
URGENT: Create missing file: index.html
```

A részletes fájlösszegzés szintén egy sikeresen elkészített fájlt jelzett:

```text
DONE · 1
index.html
```

## A tényleges eredmény

A ForgeLab Files paneljén ezzel szemben egyetlen fájl volt látható:

```text
README.md
```

Az `index.html` nem szerepelt a munkaterületen. Emiatt a kért számlálóoldal nem volt megnyitható, és a promptban előírt interakciós ellenőrzéseket sem lehetett végrehajtani.

Különösen fontos ellentmondás, hogy a rendszer legalább háromszor maga is „missing file” problémaként azonosította az `index.html` hiányát. Ennek ellenére minden javítási feladatot sikeresnek jelölt, majd ugyanazt a továbbra is hiányzó fájlt kész eredményként tüntette fel.

## A Preview és a terminál hibája

A Preview megnyitásakor a ForgeLab nem egyszerű statikus HTML-oldalként próbálta kezelni a projektet, hanem automatikusan az alábbi parancsot indította:

```text
npm install --legacy-peer-deps && npm run dev
```

Ez ellentétes volt a prompttal, amely kifejezetten tiltotta a csomagokat és a buildeszközöket. A munkaterületen nem volt `package.json`, ezért a parancs két egymást követő próbálkozásnál is hibával állt le. A terminál lényegi kimenete:

```text
npm error code ENOENT
npm error syscall open
npm error enoent Could not read package.json
npm error enoent This is related to npm not being able to find a file.
```

A terminál külön `Error detected` jelzést is megjelenített. A futás részletes összesítése azonban nem közölte ezt a hibát, és a sikertelen parancs nem változtatta meg a `Complete` állapotot.

## Reprodukció

1. Indítsunk új, üres beszélgetést és üres munkaterületet.
2. Válasszuk a Free főmodellt.
3. Kapcsoljuk be a Brain és Audit módot.
4. Adjuk meg a jelentésben szereplő promptot.
5. Hagyjuk jóvá az egy feladatból és körülbelül egy fájlból álló tervet.
6. Várjuk meg a `Complete` állapotot.
7. Nyissuk le a `Details`, majd a `Tasks` és `Files` részt.
8. Hasonlítsuk össze az ott jelzett `index.html` fájlt a jobb oldali tényleges Files panellel.
9. Nyissuk meg a Preview-t, majd ellenőrizzük a Terminal lap kimenetét.

## Miért magas súlyosságú?

A kért program nem készült el, de a rendszer leszállított projektként mutatta be. Egy fejlesztési orchestrator esetében ez bizalmi és integritási probléma: az operátor a zöld állapotok alapján joggal hihetné, hogy a fájlműveletek, a javítás és az audit valóban sikerült.

A téves sikerjelzés azért különösen kockázatos, mert:

- a részletes agentfeladatok és a tényleges workspace eltérnek egymástól;
- a rendszer a saját maga által felismert hiányt sem tudta megbízhatóan kijavítani;
- a nem nulla hibával leálló terminálparancs nem jutott el a végső állapotgéphez;
- a futási összesítésből kimaradt egy, az operátor számára látható hiba;
- a Preview a projekt típusát is helytelenül azonosította.

Adatvesztést vagy biztonsági incidenst ez a kontrollfutás nem igazolt, ezért a „kritikus” besorolás nem lenne kellően alátámasztott. A hibás leszállítási állapot miatt azonban a „magas” súlyosság indokolt.

## Valószínű hibaterület

A ForgeLab belső kódja nem állt rendelkezésre, ezért a gyökérok nem állapítható meg bizonyossággal. A külsőleg megfigyelhető viselkedés alapján valószínű, hogy a feladatok sikerállapota nincs fail-closed módon összekötve:

- a fájl tényleges létrejöttével;
- a futás utáni workspace-fájllistával;
- a Preview által indított parancs exit code-jával;
- a promptban előírt interakciós ellenőrzések eredményével.

Ez következtetés, nem forráskóddal igazolt gyökérok.

## Javasolt javítás

1. Fájllétrehozási feladat csak akkor kaphasson sikerállapotot, ha a megadott útvonal a művelet után ténylegesen létezik és olvasható.
2. Az `URGENT: Create missing file` javítás előtt a korábbi sikerállapotot érvényteleníteni kell.
3. A végső ellenőrzés hasonlítsa össze a tervezett fájlokat a workspace tényleges, frissen lekért fájllistájával.
4. Nem nulla parancs-exit-code vagy `Error detected` terminálállapot mellett a futás ne lehessen `Complete`.
5. A végső összesítés tartalmazza a sikertelen parancsot, annak exit code-ját és rövid hibáját.
6. Egyetlen statikus `index.html` esetén a Preview ne indítson npm-telepítést; közvetlen statikus előnézetet használjon.
7. A prompt által előírt interakciós ellenőrzések kapjanak külön, bizonyítható eredményt. Kihagyott ellenőrzés ne számítson sikeresnek.

## Javítás utáni elfogadási feltételek

A hibát akkor lehet lezártnak tekinteni, ha ugyanennek a kontrollpromptnak az ismétlésekor:

- a tényleges Files panel pontosan egy `index.html` fájlt mutat;
- a részletes fájlösszegzés ugyanazt a fájllistát közli;
- a Preview npm vagy más buildfolyamat nélkül megnyílik;
- a számláló végrehajtja a 0 → 2 → 1 → 0 ellenőrzési sort;
- nincs konzol- vagy terminálhiba;
- a `Complete` állapot csak az összes ellenőrzés sikeres befejezése után jelenik meg;
- szándékosan előidézett hiányzó fájl vagy hibás parancs esetén a rendszer `Validation failed` állapotot ad.

## Kapcsolódó, de külön kezelendő felületi megfigyelések

A futás előtt a főmodellt ismét manuálisan Free értékre kellett állítani, miközben a Brain szerepbeállításai megmaradtak. A terv az egyetlen HTML-fájlt `medium` komplexitásúnak és körülbelül `47K FLT` költségűnek becsülte. Emellett a futási részletek több felirata 100%-os Chrome-nagyítás mellett csak 10–11 CSS-pixeles volt.

Ezek használhatósági és beállítás-megőrzési problémák, de nem részei a téves `Complete` állapot elsődleges hibájának. Érdemes őket külön hibajegyekben kezelni, hogy ne vesszenek el a súlyosabb végrehajtási probléma mellett.

## Végkövetkeztetés

A kontrollfutás azt mutatta, hogy a ForgeLab Free módja egy rendkívül egyszerű, egyfájlos feladatnál sem kapcsolta össze megbízhatóan az agentfeladatok állapotát, a tényleges projektfájlokat, a Preview működését és a terminál eredményét. A rendszer nem csupán hibás kimenetet készített: a hiányzó kimenetet és a látható terminálhibát sikeres projektként minősítette.

A hiba javításának legfontosabb feltétele, hogy a `Complete` állapot kizárólag ellenőrizhető fájlállapotból és sikeres, név szerint rögzített validációkból származhasson.
