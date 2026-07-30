import { createContext, useContext } from "react";

export type Lang = "en" | "hu";
export const DEFAULT_LANG: Lang = "en";
export const LANG_STORAGE_KEY = "uiLang";

/**
 * UI string catalogue. English is the source of truth (and the default); the
 * Hungarian map must have exactly the same keys (enforced by the `Record` type
 * below). Use `{name}` placeholders for runtime values — see `translate()`.
 */
const EN = {
  "header.settings": "Settings",
  "header.close": "Close",
  "header.settingsTitle": "Open/close settings",
  "header.themeToLight": "Switch to light mode",
  "header.themeToDark": "Switch to dark mode",
  "header.langTitle": "Switch interface language",
  "header.vizShow": "Show audio meters",
  "header.vizHide": "Hide audio meters",

  "settings.title": "Settings",
  "settings.model": "AI Model",
  "settings.languages": "Languages",
  "settings.openaiNote": "OpenAI: a narrower set of languages is supported.",
  "settings.sourceLang": "Source",
  "settings.targetLang": "Target",
  "settings.swap": "Swap languages",
  "settings.bidirectional": "Bidirectional mode",
  "settings.bidirectionalUnavailable": "Bidirectional mode is only available with Gemini 3.1 Live Flash.",
  "settings.audioSource": "Audio Source",
  "settings.microphone": "Microphone",
  "settings.tabAudio": "Tab Audio",

  "transcript.empty": "Choose a mode, then start the interpreter.",
  "transcript.live": "Live translation...",
  "transcript.justSaid": "Just said:",
  "transcript.listening": "The interpreter is listening to you...",
  "transcript.instant": "Instant translation:",
  "transcript.copy": "Copy translation",
  "transcript.speechCaptured": "...(speech captured)",
  "transcript.translationPending": "...(translation in progress)",

  "controls.sentences": "{n} translated sentences",
  "controls.srtTitle": "Bilingual subtitles with timestamps (.srt)",
  "controls.srt": "Subtitles (SRT)",
  "controls.transcript": "Download",
  "controls.transcriptTitle": "Download transcript",
  "controls.obsidian": "Save to Obsidian",
  "controls.obsidianTitle": "Save the full transcript to your Obsidian vault",
  "controls.clear": "Clear History",
  "controls.unmuteTitle": "Unmute the interpreter",
  "controls.muteTitle": "Mute the interpreter",
  "controls.stop": "Stop",
  "controls.connecting": "Connecting...",
  "controls.start": "Start",

  "viz.input": "Input",
  "viz.output": "Output",

  "error.title": "System message",
  "error.close": "Close",
  "error.audioInput": "Audio input error: {msg}",
  "error.allowRecording": "Please allow recording access.",
  "error.connectionLost": "Connection to the translation server was lost.",
  "error.startup": "System error at startup: {msg}",
  "confirm.clear": "Delete the entire conversation history?",

  "file.subtitlePrefix": "LiveTranslate_Subtitles",
  "file.transcriptPrefix": "LiveTranslate_Transcript",
  "file.summaryPrefix": "LiveTranslate_Summary",
  "export.title": "==== LIVETRANSLATE TRANSCRIPT ====",

  "controls.summary": "AI Summary",
  "controls.summaryTitle": "Summarize the conversation with AI",

  "notes.label": "Note",
  "notes.placeholder": "Add a note…",
  "notes.add": "Add note",
  "notes.submitHint": "Ctrl/⌘+Enter to add (Enter = new line)",
  "notes.addToBlock": "Add a note to this block",
  "notes.edit": "Edit note",
  "notes.save": "Save",
  "notes.cancel": "Cancel",
  "notes.delete": "Delete note",
  "notes.exportHeader": "==== NOTES ====",

  "summary.title": "AI Summary",
  "summary.loading": "Generating summary…",
  "summary.error": "Summary failed: {msg}",
  "obsidian.saving": "Saving to Obsidian…",
  "obsidian.saved": "Saved to Obsidian: {path}",
  "obsidian.updated": "Updated in Obsidian: {path}",
  "obsidian.error": "Obsidian save failed: {msg}",
  "obsidian.dialogTitle": "Save to Obsidian",
  "obsidian.subjectLabel": "Note title",
  "obsidian.subjectPlaceholder": "e.g. Product launch meeting",
  "obsidian.subjectHint": "Used as the file name and the note title.",
  "obsidian.generate": "Generate with AI",
  "obsidian.generating": "Generating…",
  "obsidian.subjectErrorShort": "Couldn't generate a title. Please type one.",
  "obsidian.save": "Save",
  "obsidian.cancel": "Cancel",
  "export.pdfError": "PDF export failed: {msg}",
  "export.generatedAt": "Recorded: {date}",

  "exportDialog.title": "Download transcript",
  "exportDialog.format": "Format",
  "exportDialog.include": "Include",
  "exportDialog.timestamp": "Timestamps",
  "exportDialog.sourceText": "Original (source) text",
  "exportDialog.targetText": "Translated text",
  "exportDialog.notes": "Notes",
  "exportDialog.summaryEn": "AI summary (English)",
  "exportDialog.summaryHu": "AI summary (Hungarian)",
  "exportDialog.download": "Download",
  "exportDialog.cancel": "Cancel",
} as const;

export type StringKey = keyof typeof EN;

const HU: Record<StringKey, string> = {
  "header.settings": "Beállítások",
  "header.close": "Bezárás",
  "header.settingsTitle": "Beállítások megnyitása/bezárása",
  "header.themeToLight": "Váltás világos módra",
  "header.themeToDark": "Váltás sötét módra",
  "header.langTitle": "Felület nyelvének váltása",
  "header.vizShow": "Hangmérők megjelenítése",
  "header.vizHide": "Hangmérők elrejtése",

  "settings.title": "Beállítások",
  "settings.model": "AI Modell",
  "settings.languages": "Nyelvek",
  "settings.openaiNote": "OpenAI: szűkebb nyelvkészlet támogatott.",
  "settings.sourceLang": "Forrás",
  "settings.targetLang": "Cél",
  "settings.swap": "Nyelvek cseréje",
  "settings.bidirectional": "Kétirányú mód",
  "settings.bidirectionalUnavailable": "A kétirányú mód csak a Gemini 3.1 Live Flash modellel érhető el.",
  "settings.audioSource": "Audio Forrás",
  "settings.microphone": "Mikrofon",
  "settings.tabAudio": "Lap Hangja",

  "transcript.empty": "Válassz módot, majd indítsd el a tolmácsot.",
  "transcript.live": "Élő fordítás...",
  "transcript.justSaid": "Éppen elhangzott:",
  "transcript.listening": "A tolmács hallgat téged...",
  "transcript.instant": "Azonnali fordítás:",
  "transcript.copy": "Fordítás másolása",
  "transcript.speechCaptured": "...(Beszéd rögzítve)",
  "transcript.translationPending": "...(Fordítás folyamatban)",

  "controls.sentences": "{n} tolmácsolt mondat",
  "controls.srtTitle": "Kétnyelvű felirat időbélyegekkel (.srt)",
  "controls.srt": "Felirat (SRT)",
  "controls.transcript": "Letöltés",
  "controls.transcriptTitle": "Jegyzőkönyv letöltése",
  "controls.obsidian": "Mentés Obsidianba",
  "controls.obsidianTitle": "A teljes jegyzőkönyv mentése az Obsidian vaultba",
  "controls.clear": "Előzmények törlése",
  "controls.unmuteTitle": "Hang visszahangosítása",
  "controls.muteTitle": "Hang némítása a tolmácstól",
  "controls.stop": "Leállítás",
  "controls.connecting": "Kapcsolódás...",
  "controls.start": "Indítás",

  "viz.input": "Bemenet",
  "viz.output": "Kimenet",

  "error.title": "Rendszerüzenet",
  "error.close": "Bezárás",
  "error.audioInput": "Audio bemeneti hiba: {msg}",
  "error.allowRecording": "Kérjük, engedélyezd a rögzítési hozzáférést.",
  "error.connectionLost": "Megszakadt a kapcsolat a fordító szerverrel.",
  "error.startup": "Rendszerhiba az indításkor: {msg}",
  "confirm.clear": "Biztosan törlöd a teljes beszélgetés előzményt?",

  "file.subtitlePrefix": "LiveTranslate_Felirat",
  "file.transcriptPrefix": "LiveTranslate_Jegyzokonyv",
  "file.summaryPrefix": "LiveTranslate_Osszefoglalo",
  "export.title": "==== LIVETRANSLATE JEGYZŐKÖNYV ====",

  "controls.summary": "AI Összefoglaló",
  "controls.summaryTitle": "A beszélgetés összefoglalása AI-jal",

  "notes.label": "Jegyzet",
  "notes.placeholder": "Jegyzet hozzáadása…",
  "notes.add": "Jegyzet hozzáadása",
  "notes.submitHint": "Ctrl/⌘+Enter a hozzáadáshoz (Enter = új sor)",
  "notes.addToBlock": "Jegyzet hozzáadása ehhez a blokkhoz",
  "notes.edit": "Jegyzet szerkesztése",
  "notes.save": "Mentés",
  "notes.cancel": "Mégse",
  "notes.delete": "Jegyzet törlése",
  "notes.exportHeader": "==== JEGYZETEK ====",

  "summary.title": "AI Összefoglaló",
  "summary.loading": "Összefoglaló készítése…",
  "summary.error": "Az összefoglaló sikertelen: {msg}",
  "obsidian.saving": "Mentés Obsidianba…",
  "obsidian.saved": "Elmentve Obsidianba: {path}",
  "obsidian.updated": "Frissítve az Obsidianban: {path}",
  "obsidian.error": "Obsidianba mentés sikertelen: {msg}",
  "obsidian.dialogTitle": "Mentés Obsidianba",
  "obsidian.subjectLabel": "Jegyzet címe",
  "obsidian.subjectPlaceholder": "pl. Termékbevezetés megbeszélés",
  "obsidian.subjectHint": "A fájlnévhez és a jegyzet címéhez használjuk.",
  "obsidian.generate": "Generálás AI-val",
  "obsidian.generating": "Generálás…",
  "obsidian.subjectErrorShort": "Nem sikerült címet generálni. Kérlek, írj be egyet.",
  "obsidian.save": "Mentés",
  "obsidian.cancel": "Mégse",
  "export.pdfError": "PDF exportálás sikertelen: {msg}",
  "export.generatedAt": "Felvétel ideje: {date}",

  "exportDialog.title": "Jegyzőkönyv letöltése",
  "exportDialog.format": "Formátum",
  "exportDialog.include": "Tartalom",
  "exportDialog.timestamp": "Időbélyegek",
  "exportDialog.sourceText": "Eredeti (forrás) szöveg",
  "exportDialog.targetText": "Fordított szöveg",
  "exportDialog.notes": "Jegyzetek",
  "exportDialog.summaryEn": "AI összefoglaló (angol)",
  "exportDialog.summaryHu": "AI összefoglaló (magyar)",
  "exportDialog.download": "Letöltés",
  "exportDialog.cancel": "Mégse",
};

const CATALOGUE: Record<Lang, Record<StringKey, string>> = { en: EN, hu: HU };

/** Translate a key, substituting `{name}` placeholders from `vars`. */
export function translate(
  lang: Lang,
  key: StringKey,
  vars?: Record<string, string | number>,
): string {
  let s: string = CATALOGUE[lang][key] ?? EN[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.replace(`{${k}}`, String(vars[k]));
    }
  }
  return s;
}

export interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Translate a key (named `tr` to avoid clashing with the `t` theme prop). */
  tr: (key: StringKey, vars?: Record<string, string | number>) => string;
}

export const LangContext = createContext<LangContextValue>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  tr: (key) => translate(DEFAULT_LANG, key),
});

export const useLang = () => useContext(LangContext);
