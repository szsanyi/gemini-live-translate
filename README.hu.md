# LiveTranslate — Gemini + OpenAI

Ez a projekt egy helyben futtatható, valós idejű beszédfordító alkalmazás. A frontend mikrofon- (vagy lap-) hangot küld a Node.js szervernek WebSocketen keresztül, a szerver pedig a Gemini Live API vagy az OpenAI Realtime Translation API felé továbbítja azt, majd visszaküldi a fordított beszédet és a szöveges átiratokat.

## Funkciók

- **Valós idejű beszédfordítás** beszélt kimenettel és fokozatosan érkező szöveges átiratokkal.
- **Tetszőleges nyelvpár** (a modell engedte keretek között): forrás- és célnyelv választható, felcserélhető, vagy kétirányú mód kapcsolható. Alapértelmezett: Magyar → Angol.
- **Szünet-alapú szegmentálás** — egy rövid csend lezárja az aktuális szegmenst saját blokkba, így a hosszú monológ valós idejű, jól időzített feliratblokkokra bomlik.
- **Kétnyelvű felület (i18n)** — alapból angol, magyarra váltható; a választás `localStorage`-ba mentve.
- **Világos / sötét téma** váltó (mentve).
- **Hangmérők** (be-/kimeneti hullámforma) — alapból elrejtve, a fejlécből kapcsolható (mentve).
- **Jegyzetek** — chat-szerű jegyzetelés a munkamenet közben, akár önállóan a folyamban, akár egy adott fordítási blokkhoz fűzve; a jegyzetek szerkeszthetők (Ctrl/⌘+Enter = mentés, Enter = új sor).
- **AI összefoglaló** — a beszélgetés összefoglalása; az eredmény a folyamban jelenik meg **angolul és magyarul** is, nyelvenként külön letölthetően. Az összefoglaló providere konfigurálható (Gemini / OpenAI / Ollama).
- **Export** — a letöltő ablakban kiválasztható a formátum (**TXT / Markdown / PDF**) és pontosan az is, mit tartalmazzon (időbélyegek, eredeti/fordított szöveg, jegyzetek, az egyes összefoglaló-nyelvek). Emellett kétnyelvű **SRT** feliratfájl is elérhető.

## Hogyan működik

- A szerver belépési pontja a `server.ts` (Express + `ws` a HTTP + WebSocket kiszolgáláshoz).
- Fejlesztői módban a `Vite` middleware-ként fut, így a frontend és a backend egy folyamatból indul.
- A kliens a `/api/live-ws` végponton kapcsolódik; a kiválasztott modelltől függően a szerver a Gemini Live vagy az OpenAI Realtime API-hoz csatlakozik.
- Modellek:
  - `gemini-3.5-live-translate-preview` — dedikált Gemini fordítási modell (egyirányú)
  - `gemini-3.1-flash-live-preview` — általános Gemini Live modell rendszerutasítással (**csak ez támogatja a kétirányú módot**)
  - `gpt-realtime-translate` — OpenAI valós idejű fordítás (`OPENAI_API_KEY` szükséges)

## Modellek és nyelvi támogatás

| Modell | Szolgáltató | Nyelvek | Megjegyzés |
|---|---|---|---|
| `gemini-3.5-live-translate-preview` | Google | teljes katalógus (~27) | Egyirányú; a célnyelvet a `translationConfig` állítja. |
| `gemini-3.1-flash-live-preview` | Google | teljes katalógus (~27) | Rendszerutasítással; **csak ez támogatja a kétirányú módot**. |
| `gpt-realtime-translate` | OpenAI | bemenet: 14 (magyarral) · kimenet: 13 | Aszimmetrikus: a magyart érti bemenetként, de **nem beszéli**, ezért a magyar csak forrásnyelvként választható. Nincs kétirányú mód. |

A nyelvkatalógus és a modellenkénti engedélylisták a `shared/languages.ts`-ben vannak.

## Mappaszerkezet

```
src/
  App.tsx              Gyökér komponens — állapot, hookok bekötése, elrendezés
  i18n.ts              UI string-katalógus (EN/HU) + LangContext / useLang
  types.ts             Megosztott frontend típusok (TranslationPair, NoteEntry, SummaryEntry, LangConfig, …)
  themes.ts            Téma tokenek — világos / sötét; teal akcentek mindkettőhöz
  components/          UI komponensek
    Header.tsx           Fejléc: logó, nyelvváltó, hangmérő-kapcsoló, világos/sötét váltó
    SettingsPanel.tsx    Modellválasztó, forrás/cél nyelv legördülők + csere, kétirányú kapcsoló, audió forrás
    TranscriptList.tsx   Görgethető idővonal (párok + jegyzetek + összefoglalók) + élő folyam blokk
    TranscriptCard.tsx   Egy lezárt fordítási kártya + a hozzá fűzött jegyzetek
    NoteCard.tsx         Szerkeszthető jegyzet (chat-buborék / „attached" változat)
    NotesInput.tsx       Alsó, chat-szerű jegyzet beviteli sor
    SummaryCard.tsx      AI összefoglaló blokk (EN + HU, nyelvenkénti letöltés)
    Controls.tsx         Indítás/leállítás, némítás, AI összefoglaló, SRT/jegyzőkönyv export, törlés
    ExportDialog.tsx     Jegyzőkönyv-export modal — formátum + tartalom checkboxok
    AudioVisualizer.tsx  Canvas hullámforma analizátor
  hooks/               Egyedi React hookok
    useAudioPlayback.ts  24 kHz kimeneti AudioContext, PCM ütemezés, mute ref-en
    useAudioCapture.ts   Mikrofon / lap-hang rögzítés, ScriptProcessorNode pipeline
    useTranslationSession.ts  WebSocket életciklus, cbRef pattern (mindig friss closure)
  lib/                 Tiszta segédfüggvények (unit-teszteltek)
    pcm.ts             Float32↔Int16 PCM konverzió, base64 segédfüggvények
    time.ts            formatClock / formatSrtTime
    export.ts          Jegyzőkönyv blokk-modell + txt / markdown renderelők + SRT
    pdf.ts             Stílusozott, Unicode-helyes PDF export (jsPDF + DejaVu betű)
    constants.ts       SAMPLE_RATE értékek, puffer méretek, SEGMENT_SILENCE_MS
    __tests__/         Vitest unit tesztek

server/
  instructions.ts      modell + nyelvi konfiguráció → systemInstruction + targetLang
  providers/
    gemini.ts          createGeminiSession() — Gemini Live relay, típusos SDK callback-ek
    openai.ts          createOpenAISession() — OpenAI Realtime relay
    summary.ts         generateSummary() — konfigurálható Gemini / OpenAI / Ollama összefoglaló

shared/
  protocol.ts          Diszkriminált unió WS típusok (ClientMsg, ServerMsg, parseClientMsg)
  languages.ts         Nyelvkatalógus + modellenkénti engedélylisták + segédfüggvények

public/
  fonts/               DejaVuSans (normál + félkövér) — a PDF-exportba ágyazva
```

## Szöveggyűjtés, jegyzetek és export

Beszéd közben az alkalmazás mondatonként gyűjti az oldalon az eredeti és a lefordított szöveget is, mindegyikhez a session kezdetétől számított relatív időbélyeggel (⏱ M:SS). A jegyzetek és az AI összefoglalók ugyanebbe az időrendi folyamba kerülnek.

Ha van tartalom, a **Jegyzőkönyv letöltése** gomb egy export ablakot nyit, ahol kiválasztható:

- **Formátum** — `TXT`, `Markdown` (címsorok, félkövér címkék, `>` blockquote jegyzetek), vagy `PDF` (stílusozott, lapozott, beágyazott DejaVu betűvel Unicode-helyes).
- **Tartalom** — időbélyegek, eredeti (forrás) szöveg, fordított szöveg, jegyzetek, és az egyes AI-összefoglaló nyelvek. A jegyzet/összefoglaló opciók letiltva, ha nincs ilyen blokk.

Emellett kétnyelvű **SRT** feliratfájl is elérhető (feliratblokkonként az eredeti + a fordított sor, nem átfedő időzítéssel).

## Előfeltételek

- Node.js 20 vagy újabb ajánlott
- `npm`
- érvényes Gemini API kulcs (és/vagy OpenAI API kulcs)

## Beállítás

1. Telepítsd a függőségeket:

```bash
npm install
```

2. Hozd létre a `.env` fájlt a `.env.example` alapján, és állítsd be a kulcsokat.

### Környezeti változók

| Változó | Szerep |
|---|---|
| `GEMINI_API_KEY` | A Gemini Live modellekhez szükséges. |
| `OPENAI_API_KEY` | Az OpenAI Realtime modellhez szükséges. |
| `PORT` | HTTP/WS port (alap: `3000`). |
| `SUMMARY_PROVIDER` | Az AI-összefoglaló providere: `gemini` (alap), `openai` vagy `ollama`. |
| `SUMMARY_MODEL` | Összefoglaló modell (alapok: gemini → `gemini-2.0-flash`, openai → `gpt-4o-mini`, ollama → `llama3.1`). |
| `SUMMARY_API_KEY` | A provider kulcsa (visszaesik a `GEMINI_API_KEY` / `OPENAI_API_KEY`-re; Ollamához nem kell). |
| `SUMMARY_BASE_URL` | Az összefoglaló végpont felülírása (OpenAI-kompatibilis base vagy Ollama host). |

Így az összefoglaló más providerrel/kulccsal/modellel futhat, mint az élő fordítás.

## Indítás és leállítás

Az elkészített scriptek a projekt gyökerében találhatók.

Indítás:

```bash
./start.sh
```

Leállítás:

```bash
./stop.sh
```

Fejlesztői mód (Express + Vite middleware egy folyamatban):

```bash
npm run dev
```

## Mit csinál a `start.sh`

- ellenőrzi, hogy létezik-e a `.env`
- ellenőrzi, hogy telepítve vannak-e a Node.js függőségek
- buildeli a frontend csomagot a `dist/` könyvtárba
- elindítja a szervert háttérfolyamatként
- PID fájlt hoz létre itt: `.run/live-translate.pid`
- naplóz ide: `.run/live-translate.log`

Alapértelmezésben a szerver a `3000` porton indul. A port a `PORT` környezeti változóval felülírható (pl. `PORT=3457 npm run dev`).

## Hol érhető el az alkalmazás

Sikeres indítás után helyben ezen a címen érhető el:

```text
http://localhost:3000
```

## Hasznos ellenőrzések

Egészségügyi végpont:

```text
http://localhost:3000/api/health
```

Ha a szerver fut, JSON választ ad vissza, például `status: ok` mezővel.

## Hibaelhárítás

- Ha az indítás azt írja, hogy hiányzik a `.env`, hozd létre a `.env.example` alapján.
- Ha hiányzik a `node_modules`, futtasd az `npm install` parancsot.
- Ha nem indul el a szerver, nézd meg a naplót:

```bash
tail -f .run/live-translate.log
```

- Ha a PID fájl megmaradt, de a folyamat már nem fut, a `stop.sh` ezt automatikusan takarítja.
