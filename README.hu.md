<p align="center">
  <img src=".github/readme/banner.svg" alt="LiveTranslate — valós idejű beszédtolmács" width="100%">
</p>

<p align="center">
  <b>Beszélj, vagy oszd meg egy meeting böngészőfülét. A fordítást egy pillanattal később hallod.</b><br>
  Utána megmarad a kétnyelvű átirat, egy AI-összefoglaló és egy Obsidian-jegyzet.
</p>

<p align="center">
  <img alt="Gemini Live" src="https://img.shields.io/badge/Gemini_Live-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white">
  <img alt="OpenAI Realtime" src="https://img.shields.io/badge/OpenAI_Realtime-412991?style=for-the-badge&logo=openai&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white">
  <img alt="Tailwind CSS v4" src="https://img.shields.io/badge/Tailwind_v4-0F172A?style=for-the-badge&logo=tailwindcss&logoColor=38BDF8">
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white">
</p>

<p align="center">
  <img alt="27 nyelv" src="https://img.shields.io/badge/nyelv-27-0f766e?style=flat-square">
  <img alt="3 élő modell" src="https://img.shields.io/badge/%C3%A9l%C5%91_modell-3-0f766e?style=flat-square">
  <img alt="Node 20+" src="https://img.shields.io/badge/node-20%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="Obsidian export" src="https://img.shields.io/badge/export-Obsidian-7C3AED?style=flat-square&logo=obsidian&logoColor=white">
  <img alt="Felület angolul és magyarul" src="https://img.shields.io/badge/fel%C3%BClet-EN_%7C_HU-f59e0b?style=flat-square">
</p>

<p align="center">
  <a href="#gyors-kezdés"><b>Gyors kezdés</b></a> &nbsp;·&nbsp;
  <a href="#funkciók"><b>Funkciók</b></a> &nbsp;·&nbsp;
  <a href="#hogyan-működik"><b>Hogyan működik</b></a> &nbsp;·&nbsp;
  <a href="#beállítások"><b>Beállítások</b></a> &nbsp;·&nbsp;
  <a href="README.md"><b>English</b></a>
</p>

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme/screenshot-dark.png">
  <img alt="A LiveTranslate egy felvett magyar–angol meetinggel: eredeti szöveg és fordítás egymás mellett, beszélőnevek, időbélyegek és egy csatolt jegyzet" src=".github/readme/screenshot-light.png" width="100%">
</picture>

<p align="center"><sub>Egy felvett meeting: minden szakasznál látszik a beszélő, a magyar eredeti és az angol fordítás, az utolsónál egy csatolt jegyzettel.</sub></p>

## Áttekintés

Fárasztó egy olyan meeting, amelynek a nyelvét csak félig érted. A LiveTranslate a mikrofonodat vagy egy böngészőfület hallgat, és egyszerre három dolgot csinál:

- **Hangosan tolmácsol.** A lefordított beszédet hallod.
- **Mindent leír.** Az eredeti és a fordítás egymás mellett, időbélyeggel, a természetes szüneteknél szakaszokra bontva.
- **Utána összefoglal.** AI-összefoglaló angolul és magyarul, generált cím, és egy jegyzet az Obsidian-tárolódba.

A felvétel menet közben lemezre mentődik. Egy oldalfrissítés, egy összeomlás vagy egy megszakadt kapcsolat nem viszi el a meetinget.

## Gyors kezdés

> [!IMPORTANT]
> Kell hozzá **Node.js 20+** és egy **Gemini API-kulcs**. Az OpenAI-kulcs opcionális.

```bash
npm install
cp .env.example .env      # írd bele a GEMINI_API_KEY-t
npm run dev               # http://localhost:3000
```

Nyisd meg az oldalt, válassz nyelvpárt, és nyomd meg a **Start** gombot.

<details>
<summary><b>Futtatás a háttérben</b></summary>

<br>

```bash
./start.sh    # buildel, majd a háttérben futtatja a dist/server.cjs-t
./stop.sh     # leállítja
```

A PID és a napló a `.run/` mappába kerül (`.run/live-translate.log`). Állapot-ellenőrzés: `GET /api/health`. A portot a `PORT` változóval lehet átállítani.

</details>

<details>
<summary><b>Hibaelhárítás</b></summary>

<br>

- **Hiányzik a `.env`:** hozd létre a `.env.example` alapján.
- **Hiányzik a `node_modules`:** futtasd az `npm install` parancsot.
- **Nem indul a szerver:** nézd meg a naplót: `tail -f .run/live-translate.log`.
- **Megmaradt a PID-fájl, de a folyamat már nem fut:** a `stop.sh` ezt magától eltakarítja.

</details>

## Funkciók

<table>
<tr>
<td width="50%" valign="top">

### Élő tolmácsolás
- **Bármely nyelvpár** a 27 nyelvből, menet közben is felcserélhető
- **Kétirányú mód**: mindkét fél beszél, mindegyikük a másik nyelvére fordítódik
- **Mikrofon vagy böngészőfül hangja**, így egy Teams-, Meet- vagy Zoom-fül közvetlenül használható
- **Szünetalapú szakaszolás**: a hosszú monológokból olvasható kártyák lesznek

</td>
<td width="50%" valign="top">

### Felvételtár
- **Automatikus mentés** lemezre néhány másodpercenként, hiba esetén újrapróbálva
- **Folytatás**: bármelyik felvétel később folytatható, akár más módban is
- **Nevek és címkék**, AI által javasolt címmel az elhangzottak alapján
- **Teams-import**: egy lezajlott meeting átiratát beillesztve minden funkció működik rajta

</td>
</tr>
<tr>
<td width="50%" valign="top">

### AI-eszközök
- **Összefoglaló** angolul és magyarul egyetlen kérésben, hosszabb meetingnél hosszabb
- **Jegyzetek** a hívás közben, önállóan vagy egy szakaszhoz csatolva
- **Javítások**: tanítsd meg neki, hogy a „Cooper Netties” valójában „Kubernetes”; javítja az átiratot és irányítja a fordítást
- **Választható szolgáltató**: Gemini, OpenAI vagy helyi Ollama

</td>
<td width="50%" valign="top">

### Export
- **TXT, Markdown vagy PDF**, teljes Unicode-támogatással (`ő` és `ű` is)
- **Kétnyelvű SRT** felirat, helyes sorrendű időzítéssel
- **Mentés Obsidianba**: dátumozott jegyzet frontmatterrel és címkékkel, újramentéskor frissül
- **Világos és sötét téma**, angol és magyar felület

</td>
</tr>
</table>

### Három mód

| | Mód | Mit kapsz | Költség |
|:---:|---|---|---|
| <img alt="fordít és beszél" src="https://img.shields.io/badge/-ford%C3%ADt_%2B_besz%C3%A9l-0f766e?style=flat-square"> | **Tolmács** | Hangos fordítás és kétnyelvű átirat | Legmagasabb |
| <img alt="fordít" src="https://img.shields.io/badge/-ford%C3%ADt-14b8a6?style=flat-square"> | **Fordított átirat** | Néma; minden lezárt szakasz szövegként fordítódik | Alacsonyabb |
| <img alt="rögzít" src="https://img.shields.io/badge/-r%C3%B6gz%C3%ADt-64748b?style=flat-square"> | **Sima felvétel** | Átirat csak az elhangzott nyelven | Legalacsonyabb |

## Hogyan működik

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme/architecture-dark.svg">
  <img alt="A hang a mikrofonból vagy egy böngészőfülből a böngészőn át a Node-szerverhez jut, amely az API-kulcsokat tárolja és az élő modellel beszél; a lefordított beszéd és szöveg visszajön a böngészőbe; a szerver a felvételeket is tárolja és Obsidian-jegyzetet ír." src=".github/readme/architecture-light.svg" width="100%">
</picture>

### Hosszú meetingek

Egy 40 perces meetingen olyan gondok jönnek elő, amelyeket egy rövid teszt sosem mutat meg. Ezeket az app kezeli:

| Probléma | Megoldás |
|---|---|
| A Gemini Live session 7–10 perc után megszűnik | A szerver még a régi megszűnése előtt nyit egy újat, és átvált rá; a kliens semmit nem vesz észre |
| A kapcsolat mégis megszakad | Magától újracsatlakozik, ugyanazzal a hangfolyammal, új engedélykérés nélkül |
| A szövegmodell óránként többször `503 high demand` hibát ad | Növekvő várakozással újrapróbálkozik, kimerült kvótánál pedig annyit vár, amennyit a szolgáltató kér |
| Az automatikus nyelvfelismerés elcsúszik (angol beszédből spanyol átirat lesz) | A beszédfelismerő megkapja, milyen nyelveken beszélnek |
| Oldalfrissítés meeting közben | A felvétel már a lemezen van; a felvételtárból újra megnyitható |

## Modellek

| Modell | Szolgáltató | Nyelvek | Kétirányú | Mire jó |
|---|:---:|---|:---:|---|
| `gemini-3.5-live-translate-preview` | <img alt="Google" src="https://img.shields.io/badge/-Google-4285F4?style=flat-square&logo=google&logoColor=white"> | Mind a 27 | – | Kifejezetten beszédről beszédre fordít |
| `gemini-3.1-flash-live-preview` | <img alt="Google" src="https://img.shields.io/badge/-Google-4285F4?style=flat-square&logo=google&logoColor=white"> | Mind a 27 | ✓ | Kétirányú beszélgetések; ez futtatja a néma módokat is |
| `gpt-realtime-translate` | <img alt="OpenAI" src="https://img.shields.io/badge/-OpenAI-412991?style=flat-square&logo=openai&logoColor=white"> | 14 be, 13 ki | – | Alternatív hang; érti a magyart, de magyarul nem tud beszélni |

A nyelvkatalógus és az egyes modellek szabályai a [`shared/languages.ts`](shared/languages.ts) fájlban vannak.

## Beállítások

Másold a `.env.example` fájlt `.env` néven. Ha egy kulcs hiányzik, csak az azt igénylő funkciók nem működnek; a szerver fut tovább.

| Változó | Szerepe |
|---|---|
| `GEMINI_API_KEY` | A Gemini Live modellek és az alapértelmezett összefoglaló-szolgáltató |
| `OPENAI_API_KEY` | `gpt-realtime-translate` |
| `SUMMARY_PROVIDER` | `gemini` (alapértelmezett), `openai` vagy `ollama`: összefoglalók, címek és szakaszfordítás |
| `SUMMARY_MODEL` | Alapértelmezések: `gemini-flash-latest`, `gpt-4o-mini`, `llama3.1` |
| `SUMMARY_API_KEY`, `SUMMARY_BASE_URL` | Szolgáltatónkénti kulcs és végpont felülírása |
| `OBSIDIAN_VAULT_DIR` | Ide mentődnek a jegyzetek (alapértelmezés: `./data/vault/meetings`) |
| `SESSIONS_DIR` | Ide mentődnek a felvételek (alapértelmezés: `./data/sessions`) |
| `PORT` | HTTP- és WebSocket-port (alapértelmezés: `3000`) |

> [!NOTE]
> Az ingyenes Gemini-kulcsoknak csak a `*-latest` aliasokra van kvótájuk. A rögzített azonosítók, például a `gemini-2.0-flash`, `429 limit: 0` hibát adnak.

> [!TIP]
> Az összefoglaló-szolgáltató független az élő tolmácsolásétól: egy helyi Ollama is adhat címet és összefoglalót, miközben a Gemini tolmácsol.

## Fejlesztés

```bash
npm run dev     # Express + Vite middleware a :3000 porton
npm run lint    # típusellenőrzés (tsc --noEmit)
npm test        # Vitest egységtesztek
npm run build   # Vite frontend + esbuild szerver → dist/server.cjs
npm start       # a production build futtatása
```

<details>
<summary><b>Projektszerkezet</b></summary>

<br>

```
server.ts                 Express + WebSocket belépési pont, HTTP API, session-rotáció
server/
  providers/              gemini · openai · textModel · summary · textTranslate
  instructions.ts         Nyelvpár → rendszerutasítás
  sessions.ts             Lemezen tárolt felvételek
  obsidian.ts             Obsidian-jegyzet írása
  corrections.ts          Globális javítási szabályok
shared/                   A szerver és a böngésző is használja
  protocol.ts             WebSocket-üzenettípusok
  languages.ts            Nyelvkatalógus és modellszabályok
  session.ts              A tárolt felvétel formátuma
  corrections.ts          Javítások illesztése és glosszárium
  transcriptImport.ts     Teams-átirat feldolgozása
src/
  App.tsx                 Gyökérkomponens és állapot
  components/             Header, SettingsPanel, TranscriptList, SessionBar, RecordingsDrawer, dialógusok
  hooks/                  Hangrögzítés és -lejátszás, WebSocket-session, automatikus mentés, görgetés
  lib/                    PCM, idő, export, PDF
  i18n.ts                 Angol és magyar felületi szövegek
```

</details>

Az architektúra részletei és a tervezés mögötti, mért API-korlátok a [`CLAUDE.md`](CLAUDE.md) fájlban vannak (angolul).
