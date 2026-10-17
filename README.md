# Családi programötletek

Egyszerű magyar webalkalmazás HTML, CSS és JavaScript használatával, keretrendszer és telepítési/build lépés nélkül. A programok helyben, IndexedDB-ben tárolódnak. Az opcionális Google-belépés Supabase Auth-ot és egy böngészőben betöltődő Supabase-könyvtárat használ. A helyi programfunkciók belépés nélkül is elérhetők.

## Google-fiókos belépés – egyelőre szinkronizálás nélkül

A fejléc **Belépés Google-fiókkal** gombja Google-azonosítást indít a Supabase Auth szolgáltatáson keresztül. Belépve a neved (ennek hiányában az e-mail-címed) és a **Kijelentkezés** gomb látható. A Supabase klienskönyvtára külön böngészős munkamenetet őriz meg és frissít; így normál böngészőben oldalfrissítés után is felismerhető a belépés. A böngésző tárolási korlátozásai vagy a munkamenet lejárata miatt új belépésre lehet szükség.

**Ez a lépés még nem közös adatbázis:** a programok, képek és kedvencek ugyanúgy az adott böngészőben maradnak. Másik eszközön belépve még nem jelennek meg automatikusan. A belépés nem zárja el a helyi programokat: kijelentkezve is elérhetők ugyanabban a böngészőben. Sem belépés, sem kijelentkezés nem töröl programot vagy képet. A kijelentkezés csak az ezen böngészőben használt Supabase-munkamenetre vonatkozik.

### Kapcsolati adatok

Az `auth-config.js` már tartalmazza a megadott Supabase projektcímet és publishable kulcsot. A `NEXT_PUBLIC_SUPABASE_URL` értéke a `supabaseUrl`, a `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` értéke a `supabasePublishableKey` mezőbe került. A `NEXT_PUBLIC_` elnevezés miatt nem szükséges Next.js: ez egy hagyományos böngészős konfigurációs fájl.

Ezek a kapcsolati adatok nyilvános használatra valók. Google Client secret, Supabase secret/service_role kulcs és adatbázisjelszó soha ne kerüljön ebbe a fájlba, a GitHub-forrásba vagy a beszélgetésbe. Az alkalmazás csak `sb_publishable_` kezdetű kulcsot fogad el. Nincs szükség adatbázistábla, Storage-tároló vagy családi jogosultságrendszer létrehozására ehhez a belépési lépéshez.

A klienskönyvtár rögzített verziója **@supabase/supabase-js 2.118.0**, a jsDelivr CDN-ről töltődik be. Nincs npm-telepítés és build. Ha a könyvtár hálózati vagy blokkolási hiba miatt nem töltődik be, magyar üzenet jelenik meg, a helyi programfunkciók pedig tovább működnek. Ha bármelyik kapcsolati adat hiányzik, a belépés letiltva marad, de a többi funkció használható.

### Supabase és Google beállítások

A saját szolgáltatói kezelőfelületeiden ellenőrizd az alábbiakat:

1. Supabase **Authentication → Providers / Sign In → Google**: a Google szolgáltató legyen engedélyezve, és a saját Google OAuth-kliensed adatai legyenek beállítva. A kliens titka kizárólag itt, a szolgáltatói beállításban maradjon.
2. Supabase **Authentication → URL Configuration**:
   - **Site URL:** `https://sandorkov.github.io/csaladi-programok/`
   - **Redirect URLs:** külön engedélyezd ugyanezt a pontos címet: `https://sandorkov.github.io/csaladi-programok/` (a projekt útvonalával és a záró perjellel).
3. Google Auth Platform / Google Cloud OAuth-kliens, **Web application**:
   - **Authorized JavaScript origins:** `https://sandorkov.github.io` (ide nem kerül projektútvonal).
   - **Authorized redirect URIs:** `https://qcmbapyuwezbkakwkuuc.supabase.co/auth/v1/callback` (a Supabase Google-provider felületén mutatott callback-címmel egyezzen).
4. Ha a Google-alkalmazás tesztelési módban van, a próbához használt Google-fiókok legyenek engedélyezett tesztfelhasználók.

A Google először a Supabase-hez tér vissza, a Supabase pedig a fenti GitHub Pages-címre. A böngészős modul PKCE-kódcserét használ, majd eltávolítja az egyszer használatos kódot és a szolgáltatói hibaadatokat a címsorból.

Hivatalos útmutatók: [Google-belépés](https://supabase.com/docs/guides/auth/social-login/auth-google), [visszatérési címek](https://supabase.com/docs/guides/auth/redirect-urls), [Auth állapotváltozásai](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).

### Kipróbálás közzététel után

1. Töltsd fel a lent felsorolt fájlokat a meglévő GitHub-repozitórium megfelelő helyére. Várd meg a GitHub Pages frissülését, majd normál böngészőlapon nyisd meg a `https://sandorkov.github.io/csaladi-programok/` címet. Szükség esetén frissíts Ctrl+F5-tel.
2. Jegyezd meg a meglévő programok és képek állapotát; a biztonsági mentésedet őrizd meg.
3. Nyomd meg a **Belépés Google-fiókkal** gombot, és végezd el a Google-belépést. Ugyanerre a Pages-címre kell visszaérkezned; a neved vagy e-mail-címed és a **Kijelentkezés** gomb jelenjen meg.
4. Frissíts Ctrl+R-rel: a belépett állapotnak helyre kell állnia. Nézd meg a kedvenceket, keresést, rendezést, képeket és adatmentést is.
5. Jelentkezz ki: a belépési gomb visszatér, a programok és képek megmaradnak. A kijelentkezés nem jelent ki a Google-fiókodból a Google más szolgáltatásaiban.
6. Indíts új belépést, majd szakítsd meg, vagy használd a böngésző Vissza gombját. Visszatéréskor magyar üzenetnek kell jeleznie, hogy a belépés nem fejeződött be; újra próbálható. Ha a Google-oldal külön visszatérési lehetőség nélkül marad nyitva, a Vissza gombbal térj vissza: az alkalmazás csak visszatéréskor tud jelezni a megszakításról.
7. Hibás beállítás vagy hálózati hiba esetén magyar hibaüzenet jelenik meg. Javítás után frissítsd az oldalt. A részletes szolgáltatói hiba és a tokenek nem jelennek meg a felületen vagy a naplóban.

A belépés ebben a változatban kizárólag a megadott GitHub Pages-címről indítható. Közvetlen `file://` vagy helyi HTTP-cím alatt a programlista használható, a belépésnél viszont a Pages-címre irányító tájékoztatás jelenik meg. Ennek oka, hogy a PKCE-belépésnek ugyanarra a böngészős eredetre kell visszatérnie, ahonnan indult; másik eredeten tárolódik a szükséges ellenőrző adat. A helyi és a Pages-címen tárolt programadatok továbbra is különböznek.

### Feltöltendő fájlok – ezt a közzétételt te végzed

A meglévő repozitóriumban frissítsd az alábbiakat; a többi meglévő fájlt tartsd meg:

- `index.html` – fejléc, belépési vezérlők és új szkriptek.
- `style.css` – a belépési rész telefonhoz is igazodó megjelenése.
- `app.js` és `backup.js` – a helyi műveletek csak a fő tartalom gombjait zárolják, a külön kezelt belépési gombokat nem.
- `auth-config.js` – új, csak nyilvános Supabase-konfiguráció.
- `auth.js` – új belépési modul.
- `README.md` – frissített útmutató.
- `tests/auth.test.cjs` – új automatikus teszt; a webalkalmazás futásához nem szükséges, a forrásokkal együtt érdemes feltölteni.

Nem készítettem commitot vagy GitHub-közzétételt. Helyi JSON-mentést, jelszót vagy titkos kulcsot ne tölts fel.

### A belépési lépés elvégzett ellenőrzései

- Sikeres: `node --check auth-config.js`, `node --check auth.js`, `node --check app.js`, `node --check backup.js`.
- Sikeres: `node tests/auth.test.cjs`. Szimulált Supabase-válaszokkal ellenőriztük a pontos Google-visszatérési címet, PKCE-beállításokat, tárolt munkamenet felismerését a felületen, név/e-mail megjelenítését, kijelentkezést, állapotváltozásokat, megszakítást és Vissza gombos visszatérést, hibás/lejárt callback kezelését és a címsor tisztítását, SDK-/hálózati-/konfigurációs hibákat. A teszt megtiltja, hogy a belépési modul közvetlenül az IndexedDB-hez nyúljon, illetve az SDK-t megkerülve localStorage-műveletet végezzen. A munkamenet tárolását az SDK kezeli.
- A meglévő `node tests/backup.test.cjs` teljes tesztsorozata is sikeres.
- A rögzített SDK-cím HTTP 200 választ adott, és a csomag tartalmazza a `createClient` belépési pontot.
- **Valódi Google-belépést, valódi tokenmegőrzést/-frissítést, Supabase projektbeállításokat és böngészős/mobilos vizuális megjelenést nem teszteltünk.** A mocktesztek nem helyettesítik a közzététel utáni fenti próbát. A tesztek nem jelentkeznek be Google-fiókba, és nem módosítanak programadatot.

## Indítás a saját gépeden

1. Nyisd meg ezt a projektmappát a Windows Fájlkezelőben.
2. Kattints duplán az `index.html` fájlra. Ha szükséges, a jobb gombos **Társítás** menüben válaszd a Microsoft Edge vagy Google Chrome böngészőt.
3. A **Programok** oldalon három „Mintaadat” jelölésű ötlet fogad. Ezek helyszínei és költségei szemléltető példák.
4. Az **Új program** alatt töltsd ki a mezőket, és kattints a **Program mentése** gombra. A költség egész szám, forint/fő; ingyenes programhoz írj 0-t. Képet is választhatsz (JPG, PNG, WebP, GIF, legfeljebb 8 MB).
5. Próbáld ki a kártyán a **Szerkesztés**, **Kedvenc** és **Törlés** gombokat. A törlés előtt megerősítést kérünk; a Mégse megőrzi a programot.
6. Nézd meg a **Kedvencek** menüt, majd zárd be és nyisd meg újra ugyanazt az `index.html` fájlt ugyanabban a böngészőben és böngészőprofilban. Az ötleteknek és képeknek meg kell maradniuk.

## Keresés és kategóriaszűrés

A **Programok** és a **Kedvencek** listája fölött ugyanaz a két szűrő érhető el:

- **Keresés név vagy helyszín alapján**: gépelés közben azonnal keres a program nevében és helyszínében. A kis- és nagybetűk nem számítanak; például a „BUDAPEST” és a „budapest” ugyanazokat a találatokat adja. A leírásban nem keres.
- **Kategória**: választható az Összes kategória, Kirándulás, Bringázás és Családi program. A kiválasztott kategória és a keresőszöveg együtt szűr.

A Kedvencek menüben csak a kedvencnek jelölt programok között keresünk. A szűrők menüváltáskor megmaradnak, az oldal újranyitásakor üresek. A találatszám mindig az aktuális listát mutatja. Ha a szűrők mellett nincs találat, magyar üzenet és **Szűrők törlése** gomb jelenik meg. Ez a gomb csak a keresőszöveget és a kategóriaválasztást törli; programot vagy képet nem töröl. Telefonon a mezők egymás alatt jelennek meg.

### Rendezés ár szerint

A lista fölötti **Rendezés ár szerint** választóban a **Legolcsóbb elöl** és a **Legdrágább elöl** lehetőség közül választhatsz. A becsült Ft/fő költség alapján, számszerűen rendezzük az aktuális találatokat. Alapértelmezésben a legolcsóbb program az első; az ingyenes program költsége 0 Ft. Egyenlő költségnél az eredeti egymáshoz viszonyított sorrend marad meg.

A rendezés a kereséssel és kategóriaszűréssel együtt, a Kedvencek között is működik. A választás menüváltáskor megmarad, újranyitáskor visszaáll a legolcsóbb sorrendre. A **Szűrők törlése** gomb a rendezési irányt megőrzi. Csak a megjelenített sorrend változik; a mentett adatok, képek és az adatbázis változatlanok.

Kipróbálás: frissítsd a megszokott oldalt (Ctrl+R, szükség esetén Ctrl+F5), majd válts a két rendezési irány között, és nézd meg a kártyák Ft/fő értékeit. Próbáld kereséssel, kiválasztott kategóriával és a Kedvencek menüben is. Több különböző költségű találattal látszik jól a sorrend változása.

### A bővítés kipróbálása

1. Frissítsd a már használt oldalt (Ctrl+R) ugyanabban a böngészőben, ugyanazon az elérési úton. Ha az új mezők nem látszanak, használj Ctrl+F5-öt. A böngészőadatokat ne töröld.
2. Írd be egy meglévő program nevének részletét, majd egy helyszín részletét. Próbáld nagybetűkkel is: a találatoknak egyezniük kell.
3. Válassz közben kategóriát. Csak a szövegnek és a kategóriának egyaránt megfelelő programok maradnak láthatók.
4. Válts a Kedvencek menüre: ugyanazok a szűrők most csak a kedvenceidre vonatkoznak.
5. Írj be biztosan nem létező szöveget, például „nincsilyenprogram123”. Próbáld ki a **Szűrők törlése** gombot: az aktuális menü teljes listája visszatér.
6. Próbáld ki keskeny ablakban vagy telefonon is a mezőket. Ellenőrizd, hogy a korábbi programok és képek továbbra is elérhetők.

## Adatmentés: biztonsági mentés és visszaállítás

Az új **Adatmentés** menüpontban az adatok helyben, külső szolgáltatás nélkül menthetők és visszaállíthatók.

### Biztonsági mentés letöltése

1. Nyisd meg az **Adatmentés** menüt.
2. Kattints a **Biztonsági mentés letöltése** gombra.
3. A böngésző letöltései között keresd például a `csaladi-programok-2026-10-16_14-34-56.json` nevű fájlt. A név a gép helyi dátumát és időpontját tartalmazza. A böngésző beállításától függően választhatsz mentési helyet is.

Egyetlen fájlba kerül **minden program**, minden mezőjével, azonosítójával, mintaadat-jelölésével, kedvencjelölésével és feltöltött képével. A kereső, kategóriaszűrő, ár szerinti rendezés és az aktuális menü nem korlátozza a mentést. Az üres lista is menthető. A letöltés elindítása után ellenőrizd, hogy a fájl valóban megjelent-e a letöltések között.

A JSON-fájl `format` azonosítót, `version: 1` formátumverziót, `createdAt` mentési időpontot (UTC, ISO-formátum) és `programs` listát tartalmaz. A képek önállóan hordozható base64-adatokként szerepelnek benne; nincs szükség mellékelt képfájlokra. A fájl a programok szövegét és képeit olvasható formában tartalmazza, titkosítás nélkül: őrizd olyan helyen, ahol szeretnéd tárolni őket. Másik böngészőben is visszaállítható ugyanebbe az alkalmazásba.

### Visszaállítás

1. Az **Adatmentés** nézetben válassz egy korábban letöltött JSON-mentést.
2. Várd meg a teljes fájl, minden program és minden kép ellenőrzését. A rendszer legfeljebb 150 MB-os mentést és képenként 8 MB-ot fogad el. A JSON base64-kódolása miatt nagyobb lehet, mint az eredeti képek együtt. A letöltés is jelzi, ha a mentés meghaladná a visszaállítható méretet.
3. Az ellenőrzés után megjelenik a **beolvasott fájl neve**, a mentés időpontja helyi idő szerint és a programok száma. A fájlválasztó is megőrzi a kiválasztott fájlt. **Ekkor még semmi nem változott az adatbázisban.**
4. Ha nem szeretnéd a cserét, válaszd a **Mégse – visszaállítás megszakítása** gombot. Ez az ellenőrzés közben is használható; a folyamatban lévő fájlolvasás vagy képellenőrzés befejeződhet, de az eredményét már nem használjuk fel.
5. Csak a **Megerősítem: teljes lista cseréje** gomb indítja el a tényleges visszaállítást. A jelenlegi teljes lista és képei a mentés tartalmára cserélődnek. **Nem összefűzés történik.** Üres mentés visszaállításakor üres lesz a lista. Előtte mentsd le a jelenlegi állapotot, ha később vissza szeretnéd kapni.

A fájlválasztó újbóli megnyitásakor a korábbi ellenőrzés és megerősítési lehetőség azonnal megszűnik. Ugyanaz a fájl ismét kiválasztható, és újra ellenőrizzük. Másik fájlnál is csak a sikeres új ellenőrzés után jelenik meg a megerősítés. Hibás fájl vagy a választóablak megszakítása után a korábbi mentés nem állítható vissza véletlenül; válassz újra érvényes fájlt. A külön Mégse gomb és a sikeres visszaállítás kiüríti a fájlmezőt.

A fájlnév-kijelzés javításának próbája: válassz érvényes mentést, és ellenőrizd, hogy a fájlmező és az összesítés ugyanazt a nevet mutatja. Nyisd meg újra a választót: a régi megerősítés tűnjön el. Válaszd ugyanazt a fájlt újra, majd válassz hibás fájlt: csak az érvényes fájl sikeres ellenőrzése után lehessen megerősíteni. Ehhez nem szükséges tényleges visszaállítást indítanod.

A megerősített adatbázis-művelet idejére a vezérlők zárolva vannak; ekkor már nem lehet megszakítást kérni. A csere egyetlen IndexedDB-tranzakció: a lista törlése, az összes program beírása és az egyszeri mintalétrehozás jelzője együtt kerül mentésre. Bármely írási hiba esetén az egész tranzakció visszagördül, a korábbi adatok megmaradnak. A hibás JSON, nem támogatott verzió, hibás mező, ismétlődő azonosító, hibás képkódolás, eltérő képformátum vagy nem dekódolható kép már a megerősítés előtt hibát jelez, adatbázis-írás nélkül.

Siker után az alkalmazás azonnal a Programok nézetre vált, törli a kereső- és kategóriaszűrőt, és megmutatja a visszaállított listát. A rendezési irány megmarad. Ismételt visszaállítás sem hoz létre duplikátumokat, és üres mentés után sem kerülnek vissza a mintaprogramok.

### Biztonságos kipróbálás

1. Frissítsd a megszokott alkalmazást Ctrl+R-rel (szükség esetén Ctrl+F5), majd tölts le egy mentést a jelenlegi adataidról. Ellenőrizd a fájl meglétét.
2. Kapcsolj be szűrőket, majd készíts újabb mentést: a JSON `programs` listájának továbbra is minden programot tartalmaznia kell.
3. Válaszd ki az eredeti mentést. Ellenőrizd az időpontot és a programszámot, majd nyomj Mégsét: a lista maradjon változatlan.
4. A teljes csere próbájához lehetőleg egy másik böngészőben vagy külön tesztprofilban nyisd meg az alkalmazást. Ott válaszd ki a mentést, ellenőrizd az összesítést és erősítsd meg. Nézd meg a képeket, költségeket, kedvenceket, majd nyisd újra az oldalt. Ugyanazt a mentést ismét visszaállítva ne növekedjen a programszám.
5. A mentés **másolatában** módosítsd a `version` értékét 99-re, vagy próbálj beolvasni egy hibás szövegfájlt. Magyar hibaüzenetet kell kapnod, miközben a jelenlegi lista változatlan marad. Az eredeti mentési fájlt ne írd felül.

## Adattárolás

A programok, a kedvenc jelölések és a feltöltött képek a böngésző **IndexedDB** adatbázisába kerülnek, nem a projektmappa fájljaiba. A három mintát külön jelzővel, egyetlen tranzakcióban hozzuk létre az első induláskor: törlésük után nem térnek vissza. Az adatbázis teljes törlése viszont új első indításnak számít.

Az adatok nem szinkronizálódnak automatikusan más böngészőbe vagy telefonra. Böngészőadatok törlése, privát mód vagy tárhelyfelszabadítás adatvesztést okozhat. Az **Adatmentés** menü JSON-mentésével kézzel átvihetők és megőrizhetők. A mappa másolása önmagában nem másolja át a rögzített adatokat.

A közvetlen `file://` megnyitás helyi tárolását a böngésző szabályozza. Mindig ugyanarról az elérési útról nyisd meg; átnevezés vagy költöztetés után a böngésző más tárhelyet használhat. Ha nem működik, vagy stabil helyi HTTP-címet szeretnél, és **már telepítve van Python**, nyiss terminált ebben a mappában, és futtasd:

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

Ezután nyisd meg: <http://127.0.0.1:8000>. A leállításhoz a terminálban nyomj Ctrl+C-t. Ez opcionális, nem szükséges hozzá csomagtelepítés. A fájlként és HTTP-címen megnyitott alkalmazás külön tárhelyet használ. HTTP esetén később is ugyanazt a címet és portot használd.

## Mit hol módosíthatsz?

- `index.html`: feliratok, menü és űrlapmezők.
- `style.css`: színek, méretek és telefonos elrendezés. A fő zöld színt a `--green` változó adja meg.
- `app.js`: mentés, betöltés, kártyák, kedvencek, keresés, kategóriaszűrés és az első indítás mintái. A szűrés a `filteredPrograms()` függvényben történik. A minták átírása nem módosítja a már létező adatbázist.
- `backup.js`: JSON-export, fájl- és képellenőrzés, előnézeti összesítés, megszakítás és teljes, tranzakciós visszaállítás.
- `tests/backup.test.cjs`: elkülönített mentési tesztek Node.js-hez; az alkalmazás használatához nem szükséges. Futtatása, ha Node.js már rendelkezésre áll: `node tests/backup.test.cjs`.

A forrás módosítása után mentsd a fájlt, majd frissítsd a böngészőt (Ctrl+R). Az alkalmazás hálózati kapcsolat nélkül is használható.

## Elvégzett ellenőrzések

- A fájlnév-kijelzés javításakor a `node --check backup.js` és a teljes `node tests/backup.test.cjs` sikeres. A kibővített szimulált fájlmező az ürítéskor már a kiválasztott fájlokat is törli, a böngésző viselkedését követve. Ellenőriztük a fájlnév és kiválasztás megőrzését, az új beolvasás előtti érvénytelenítést, érvényes után hibás fájlt, azonos fájl ismételt kiválasztását, a választóablak megszakítását és a siker utáni ürítést. Valódi böngészős fájlválasztóval vizuális próba nem készült; a meglévő felhasználói adatbázishoz nem nyúltunk.
- Az Adatmentés bővítésnél a `node --check app.js`, `node --check backup.js` és `node tests/backup.test.cjs` sikeres. A teszt valódi JSON/base64/Blob átalakítással ellenőrzi a kép bájtjainak és a programmezőknek az oda-vissza egyezését. Ellenőrzi a dátumos fájlnevet, a formátumverziót, hibás JSON-t/mezőket/azonosítókat/képeket, az előnézet írásmentességét, megszakítást, méretkorlátot, a szűrőktől független teljes exportot, a megerősítést és az azonnali listafrissítést. A szimulált tranzakció közbeni és szinkron hibánál a korábbi állapot megmarad; ismételt és üres visszaállítást is teszteltünk.
- A mentési tesztek DOM-ja, FileReader-je, képdekódolója és IndexedDB-tranzakciói szimuláltak. Valódi böngészős letöltés, a böngésző tényleges képdekódolója, valódi IndexedDB-visszagörgetés, tárhelyhiány és mobilos vizuális próba nem volt tesztelhető. A fejlesztői tesztek nem nyitják meg és nem változtatják a felhasználó adatbázisát.
- Az ár szerinti rendezés szintaktikai és szimulált DOM-ellenőrzése sikeres: növekvő/csökkenő számszerű sorrend, 0 Ft, azonos árak, ténylegesen előállított kártyasorrend, kombinált keresés és kategóriaszűrés, Kedvencek, üres lista és menüváltás. A szűrőtörlés megőrizte a rendezési irányt, az eredeti rekordok és képhivatkozások változatlanok maradtak. Valódi böngészős és mobilos vizuális próba nem készült a rendezésről.
- A `node --check app.js` szintaktikai ellenőrzés sikeres.
- Ellenőriztük a JavaScript által hivatkozott HTML-azonosítókat, az űrlap mezőit és a hivatkozott fájlok meglétét.
- Szimulált tranzakcióval ellenőriztük: három jelölt minta jön létre, ismételt indításkor nem duplázódnak, és törlés után sem keletkeznek újra. Ez logikai teszt, nem valódi IndexedDB-teszt.
- A felhasználó saját böngészőjében visszaigazolta a programfelvétel, képfeltöltés, kedvencjelölés és az újranyitás utáni adatmegőrzés működését.
- A keresési bővítésnél sikeres szimulált DOM-ellenőrzés készült: név- és helyszínkeresés, kis- és nagybetűk, szóközök a keresés elején/végén, kategóriák, kombinált szűrés, kedvencek, üres találati lista, találatszám, szűrőtörlő gomb és az eredeti programadatok változatlansága. A gépelési és kategóriaváltási eseménykezelőket is meghívtuk.
- Ezek kódalapú ellenőrzések; a keresési bővítés valódi böngészős és mobilos vizuális próbája még hátravan. A korábbi automatizált böngészős próbát a helyi `file://` cím tiltása blokkolta.
- Az IndexedDB neve és verziója továbbra is változatlan. A szűrők és a rendezés csak a megjelenítést érintik. A teljes tárolt listát kizárólag a felhasználó által külön megerősített visszaállítás cseréli le; a fejlesztés közben nem töröltük vagy állítottuk alaphelyzetbe a meglévő adatokat.
