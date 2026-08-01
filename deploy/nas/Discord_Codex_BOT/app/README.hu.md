# app

Ide kerul a kesobb kontenerbe epitheto alkalmazasforras, amikor a staging script `-IncludeSource` kapcsoloval fut.

Alapertelmezesben a staging csak a NAS mappaszerkezetet es deploy-sablonokat kesziti el. Forraskodot csak tiszta, ellenorzott checkoutbol erdemes a stagingbe masolni.

A Dockerfile jelenlegi `CMD` parancsa csak a `npm run nas:status` dry-run allapotot futtatja. Nem indit Discord botot es nem futtat Codexet a NAS-on.

A Dockerfile szandekosan telepit `python3`, `make` es `g++` csomagokat is, mert a `better-sqlite3` nativ Node modulnak szuksege lehet build eszkozokre. Ez az ARM-korszakos archive-bol atmentett, tovabbra is relevans Docker tapasztalat.
