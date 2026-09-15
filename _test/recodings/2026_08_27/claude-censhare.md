# Claude a Censhare csapatnál — mit beszéltek (2026-08-27)

Forrás: `LiveTranslate_Transcript_8-27-2026.md` (15:46–15:54) és
`LiveTranslate_Transcript_8-27-2026 (1).md` (15:57–16:02). A kettő **ugyanannak a
meetingnek átfedő felvétele**: a (1)-es a korábbi szakaszt fogta el, és épp abban van a
Claude-ról szóló érdemi rész; az első felvétel csak a végét (az Oracle-sztori zárását)
ismétli meg.

---

## ⚠️ Előbb egy átirat-figyelmeztetés

A beszédfelismerés két szót következetesen elront, enélkül a szöveg olvashatatlan:

| Amit az átirat ír | Amit valójában mondtak | Miből derül ki |
|---|---|---|
| **„CAD”** | **Claude Code** | „shouting at CAD”, „jump into CAD”, „a CAD instance set up for dev and UAT” — és ugyanez a dolog egy helyen a saját nevén szerepel: „**Code** was complaining that »that's not in your master data XML«”. |
| **„cloud”** (a 3:52–3:53-as blokkban) | **Claude** | „that **cloud** conversation you guys were having in the beginning” — a meeting eleje épp Claude Code-ról szólt; és „I like to connect **cloud** with my Docker Desktop” csak Claude-ként értelmes. |
| „Coals” / „Cole's” | **Kohl's** (az ügyfél) | ez a projektben már ismert ASR-hiba |
| „Share” / „Synchr” | **Censhare** | |

Vagyis: **a meeting jó része arról szólt, hogy ki hogyan használja a Claude Code-ot a
Censhare-munkában** — az átiratból ez elsőre nem látszik.

---

## Rövid válasz a kérdésedre

Igen, **aktívan és napi szinten használják**, méghozzá nem chat-ablakból, hanem
**a szerverekre / környezetekre rákötött Claude Code példányokból**, szkriptekkel
körbeépítve. Két fő felhasználás rajzolódik ki:

1. **UI-testreszabás generálása** a Censhare customization fájlokból (screenshot + fájlútvonal alapján).
2. **Hibakeresés logokban** — ez az, amit a legtöbbre tartanak: egy Oracle-incidenst
   találtak meg vele, amit kézzel „soha nem találtak volna meg”.

---

## 1. Claude Code mint Censhare UI-fejlesztő

**A kérdés, amivel a téma indult (3:57):**
> „Eljutottunk-e már arra a pontra, hogy beugorhatunk a Claude Code-ba, rámutathatunk a
> két customization fájlra, és azt mondhatjuk: »itt van, csinálj nekem erre egy patch-et«?
> Mennyire jönne közel?”

**A válasz (3:59) — valaki már pont ezt tesztelte:**

- Odaadta neki **a fájlútvonalat**, plusz **egy képernyőképet arról, hogy most hogy néz ki
  a felület, és egyet arról, hogy milyennek szeretné**.
- Az eredmény „elég közel volt”, de **több iteráció kellett**: a mezőket át kellett
  rendeztetni vele, „addig ordibáltam vele, amíg a helyükre nem tette a dolgokat”.
- **A leképezés (mapping) viszont tökéletes lett** — és ezt kifejezetten annak
  tulajdonítja, hogy valaki korábban **feature key-eket tett be az UI-ba**.
  A másik fél erre: *„hát ez volt a lényeg — ha be akartam dobni Claude Code-ba, ez volt a
  legegyszerűbb módja a leképezésnek.”* → **Tudatosan Claude-barátra alakították az UI-t.**
- Ami elromlott: nem adta meg neki a **dátummezők vs. szövegmezők** különbségét, ezért az
  időzítéses mezőt elszúrta.
- **A master data XML a kódbázisban van**, és külön rászól, hogy azt nézze meg.
  Egy korábbi esetnél a Claude Code panaszkodott, hogy „ez nincs benne a master data
  XML-ben” — mire kiderült, hogy csak a *managed* rész volt bent, nem az egész.
  Tanulság, ahogy ő mondta: *„talán az egészet oda kéne adnom neki.”*

**A gazdaságossági megjegyzés (szerintem ez a legőszintébb mondat az egészben):**
> „Volt pár dolog, hogy »ezt megcsinálom két másodperc alatt, vagy inkább tovább ordibálok
> a Claude Code-dal, csak hogy legyen egy alapja, amivel dolgozhat«. És ez eddig
> kifizetődőnek tűnik.”

Vagyis tudatosan **fektetnek bele időt a kontextus felépítésébe**, akkor is, ha az adott
feladatot gyorsabb lenne kézzel megcsinálni.

---

## 2. Claude Code mint log-elemző / incidensnyomozó — ez a „killer feature”

**A setup (4:00):**

- **Külön Claude Code példány van beállítva dev-re és UAT-ra.**
- A napokban hozzáadott **egy prod replikációs útvonalat a QA könyvtárához**.
- Van egy **szkript**, ami:
  - frissíti az éles (prod) kódot a saját másolatában,
  - **lehúzza a két legfrissebb activity logot**,
  - **lehúzza az összes GCP logot**,
  - és mindezt beteszi a munkakönyvtárba.
- Ezután egyszerűen **kérdez egy hibáról**, és a Claude Code végigbogarássza a logokat,
  megtalálja és pontosan beméri a problémát, megnézi hozzá a kódot, majd
  **segít megírni a javítást / patch-et a QA-ban**, amit aztán visszatol dev-be.

> „Annyira király.”

**A konkrét siker-sztori (4:01) — kétszer is elmesélik, ez volt a meeting csúcspontja:**

Az Oracle „kiakadt”. A kollégának sikerült kézzel helyrehoznia, de utána azt mondta:
*„mi a fene, hadd próbálja meg a Claude Code kideríteni, mi történt.”*

A Claude Code átfésülte az összes activity logot, és megtalálta a valódi okot:

1. **elírás (typo) az LDAP-szinkronizáció konfigurációjában**,
2. emiatt egy **ritka peremesetben**, amikor egy webes felhasználó egy bizonyos csoporttal
   jelentkezett be, **nem talált egyezést**,
3. **végtelen ciklusba futott**, és **újra meg újra teljesen lecserélte a party táblát**,
4. ez **hatalmas redo logokat** generált, ami **teleszemetelte az FRA területet**.

> „Ezt soha nem találtam volna meg. Ezt soha, a büdös életben nem találtam volna meg.”
> — „Ez szuper menő.” — „Az őrület.”

---

## 3. Hol futtatják — szerver, felhő, Docker

- **Van, aki csak a felhős éles (cloud production) szerveren tud dolgozni** egy adott
  feladaton (SATS 91, letöltési sebesség kártya) — tesztelés és kódírás is ott folyik.
- Az egyik kolléga a **Claude-ot a saját Docker Desktopjához köti be, a lokális Censhare
  Docker-példányához** (3:52). Indoklás: *jó olyan dolgok tesztelésére, amik nem igényelnek
  harmadik féltől származó API-szolgáltatásokat* — ezért **a Kohl's-nál kevésbé hasznos**,
  mert ott sok minden külső API-kra épül. De arra jó, hogy egy olyan lokális környezetben,
  ahol „nem érdekel, ha elromlik”, **elméleteket és kódot igazoljon vissza**.
- A másik kolléga inkább **szkriptekkel tolja fel-le az anyagot** (3:53):
  > „Annyira megszoktam a szkripteket, hogy folyamatosan tolom fel meg le a dolgokat.
  > Futtatok egy szkriptet, az szinkronizálja a repót, felteszek neki egy csomó kérdést,
  > végrehajt egy csomó módosítást, aztán egy másik szkript visszatolja és alkalmazza.”

  Egyetért viszont abban, hogy **jó lenne külön tartani** a környezeteket — a Docker-es
  megoldást „jól jönne”-ként nyugtázza.

---

## 4. Licenc / fiókok — érdemes lehet figyelni

Rákérdeznek Brianre (3:53), hogy a sajátján van-e még, vagy megkapta-e már a céges fiókot:

> „Ó, nem. Még mindig a személyesen vagyok. Szóval: a személyes chatem, **a személyes
> Claude-om**, a személyes Geminim.” — „A személyes oxigénem. A személyes X1-em.” *(vicc)*

Tehát **legalább egy fejlesztő a saját, személyes Claude-előfizetéséről dolgozik a
Censhare-projekten**, mert a céges hozzáférést még nem kapta meg. Ez egyszerre licenc- és
adatkezelési kérdés, ha valaki fel akarja hozni.

---

## 5. Ami a meetingből még kontextus (nem Claude, de idekapcsolódik)

- **Örökölt UI-adósság a Kohl'snál:** a rendszer egy **2012-es, MSP által épített
  telepítés klónjából** indult (a retail modul telepítése annyira bonyolult volt, hogy egy
  másik ügyfélnek már felépített rendszert klónoztak). Ez még az előtt volt, hogy a
  Censhare a customization fájlt csak az egyedi módosításokra szűkítette volna — ezért
  **hatalmas mennyiségű régi UI van bemásolva teljes kóddal a customization fájlba**.
  Épp ezt a takarítást akarják Kohl's-jóváhagyással elvégezni. → Pont ez az a fajta nagy,
  mechanikus refaktor, amire a Claude Code-ot bemelegítik.
- **SATS 91** (letöltési sebesség): az ötlet, hogy a temp download asset kerüljön saját
  domainre, hogy ahhoz külön fájlrendszert lehessen konfigurálni, plusz többszálas letöltés.
- **Provisioning-hiba a Kohl'snál:** emberek folyamatosan elvesztik a jogosultságaikat,
  hármat kézzel kellett visszaállítani.

---

## Összegzés — mire használják a Claude-ot

| Terület | Hogyan | Mennyire vált be |
|---|---|---|
| Censhare UI-customization | fájlútvonal + screenshot (jelenlegi + kívánt állapot), feature key-ekkel felcímkézett UI, master data XML a kontextusban | jó, de több iterációt igényel; a mapping tökéletes |
| Log- és incidenselemzés | dev/UAT/QA Claude Code példányok + szkript, ami behúzza a prod kódot, az activity logokat és a GCP logokat | **kiemelkedő** — LDAP-typo → végtelen ciklus → FRA telítődés láncot találta meg |
| Javítás írása | QA-ban patch, majd visszatolás dev-be | működő workflow |
| Lokális kísérletezés | Claude ↔ Docker Desktop, lokális Censhare példány | jó, ahol nem kell külső API (Kohl'snál korlátozott) |
| Fiókhelyzet | legalább egy fejlesztő személyes Claude-előfizetésről | nyitott kérdés |
