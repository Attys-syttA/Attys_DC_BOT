# Codex Task Rend

Ez a mappa a fejlesztesi tervek es taskok allapotkoveto helye.

## Fobb szabaly

- Aktiv vagy meg nem valositott terv maradjon a `pending` alatt.
- Lezart terv vagy befejezett task keruljon a `done` ala.
- Az aktiv tervfajlok elejen legyen rovid allapotblokk `Elkeszult reszek` es `Nyitott reszek` felsorolassal.
- Az aktiv tervfajlok statuszblokkja geppel is ellenorzott: futtasd a `npm run plans:check` parancsot, ha ilyen fajlhoz nyultal.

## Mappak

- `plans/pending/active/`: aktiv vagy reszben megvalositott foiranyok
- `plans/pending/not-started/`: meg el nem kezdett tervek
- `plans/pending/reference/`: hatteranyagok, osszehasonlitasok, kutatasi jegyzetek
- `plans/done/`: lezart vagy torteneti tervek

## Lezarasi fegyelem

- Ha egy tervbol tenylegesen keszult implementacio, frissitsd az allapotblokkot.
- Ha egy aktiv terv lezarult, mozgasd at a `done` ala.
- Ha uj fajl jelenik meg a tervtarban, roviden dontsd el rola: aktiv, meg nem indult, referencia, vagy lezart.
