import { Mic, Monitor, ArrowRightLeft, Settings, Sparkles, Check, Square, Volume2, VolumeX } from "lucide-react";
import { ThemeConfig } from "../themes";
import { AudioSourceType } from "../types";
import { useLang } from "../i18n";
import { LANGUAGES, allowedSourceCodes, allowedTargetCodes, supportsBidirectional, langName } from "@/shared/languages";

interface SettingsPanelProps {
  model: string;
  sourceLang: string;
  targetLang: string;
  bidirectional: boolean;
  translate: boolean;
  speak: boolean;
  audioSource: AudioSourceType;
  isActive: boolean;
  isSidebarMode: boolean;
  mobileSettingsOpen: boolean;
  t: ThemeConfig;
  onModelChange: (model: string) => void;
  onSourceChange: (code: string) => void;
  onTargetChange: (code: string) => void;
  onSwapLangs: () => void;
  onBidirectionalToggle: () => void;
  onTranslateToggle: () => void;
  onSpeakToggle: () => void;
  onAudioSourceChange: (source: AudioSourceType) => void;
}

export function SettingsPanel({
  model,
  sourceLang,
  targetLang,
  bidirectional,
  translate,
  speak,
  audioSource,
  isActive,
  isSidebarMode,
  mobileSettingsOpen,
  t,
  onModelChange,
  onSourceChange,
  onTargetChange,
  onSwapLangs,
  onBidirectionalToggle,
  onTranslateToggle,
  onSpeakToggle,
  onAudioSourceChange,
}: SettingsPanelProps) {
  const isOpenAI = model === "gpt-realtime-translate";
  const { lang: uiLang, tr } = useLang();
  const srcAllowed = allowedSourceCodes(model);
  const tgtAllowed = allowedTargetCodes(model);
  const canBidirectional = supportsBidirectional(model);
  // Without spoken output the model pair is dictated by capability, not taste:
  // only 3.1 Flash Live can transcribe silently. Lock the picker and say why.
  const modelLocked = isActive || !speak;
  // Catalogue order, filtered to what the active model supports (source and
  // target can differ — e.g. OpenAI accepts Hungarian input but can't speak it).
  const sourceOptions = LANGUAGES.filter((l) => srcAllowed.includes(l.code));
  const targetOptions = LANGUAGES.filter((l) => tgtAllowed.includes(l.code));
  // Swapping is only meaningful if the current source is also a valid target.
  const canSwap = tgtAllowed.includes(sourceLang);

  return (
    <div className={`xl:col-span-1 surface-card max-xl:overflow-y-auto p-6 flex-col justify-between gap-6 transition-all duration-300 ${
      mobileSettingsOpen ? "flex" : "hidden"
    } ${isSidebarMode ? "xl:hidden" : "xl:flex"}`}>
      <div>
        <div className="flex items-center mb-4 pb-3 border-b border-[var(--border-medium)]">
          <h2 className={`text-xs font-bold tracking-wider uppercase ${t.text} flex items-center gap-2`}>
            <Settings className="w-4 h-4" /> {tr("settings.title")}
          </h2>
        </div>

        {/* Model Selection */}
        <div className="mb-5">
          <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-2 uppercase tracking-widest">{tr("settings.model")}</label>
          <div className="flex flex-col gap-2 p-1.5 bg-[var(--bg-subtle)] border border-[var(--border-faint)]">
            <button
              id="model-3.5-btn"
              onClick={() => onModelChange("models/gemini-3.5-live-translate-preview")}
              disabled={modelLocked}
              className={`px-3 py-2.5 text-left transition-all text-xs cursor-pointer ${
                model === "models/gemini-3.5-live-translate-preview"
                  ? "bg-[var(--bg-raised)] text-[var(--text-primary)] border border-[var(--border-strong)] font-bold shadow-sm"
                  : "border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              } ${modelLocked ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <p className="font-bold flex items-center gap-1.5">
                Gemini 3.5 Live Translate
                {model === "models/gemini-3.5-live-translate-preview" && (
                  <Sparkles className={`w-3 h-3 ${t.text} sm:block hidden`} />
                )}
              </p>
            </button>
            <button
              id="model-3.1-btn"
              onClick={() => onModelChange("models/gemini-3.1-flash-live-preview")}
              disabled={modelLocked}
              className={`px-3 py-2.5 text-left transition-all text-xs cursor-pointer ${
                model === "models/gemini-3.1-flash-live-preview"
                  ? "bg-[var(--bg-raised)] text-[var(--text-primary)] border border-[var(--border-strong)] font-bold shadow-sm"
                  : "border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              } ${modelLocked ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <p className="font-bold flex items-center gap-1.5">
                Gemini 3.1 Live Flash
                {model === "models/gemini-3.1-flash-live-preview" && (
                  <Sparkles className={`w-3 h-3 ${t.text} sm:block hidden`} />
                )}
              </p>
            </button>
            <button
              id="model-openai-btn"
              onClick={() => onModelChange("gpt-realtime-translate")}
              disabled={modelLocked}
              className={`px-3 py-2.5 text-left transition-all text-xs cursor-pointer ${
                model === "gpt-realtime-translate"
                  ? "bg-[var(--bg-raised)] text-[var(--text-primary)] border border-[var(--border-strong)] font-bold shadow-sm"
                  : "border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              } ${modelLocked ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <p className="font-bold flex items-center gap-1.5">
                OpenAI Realtime Translate
                {model === "gpt-realtime-translate" && (
                  <Sparkles className={`w-3 h-3 ${t.text} sm:block hidden`} />
                )}
              </p>
            </button>
          </div>
          {!speak && (
            <p className="mt-2 text-[10px] text-[var(--text-muted)] bg-[var(--bg-subtle)] border border-[var(--border-medium)] rounded-lg px-2.5 py-1.5">
              {tr("settings.modelLocked")}
            </p>
          )}
        </div>

        {/* Mode: translate at all, and speak the translation. Both are locked once
            the session starts — switching mid-session would need a reconnect, and
            the transcript would end up mixing modes. */}
        <div className="mb-5">
          <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-2 uppercase tracking-widest">{tr("settings.mode")}</label>
          <div className="flex flex-col gap-2">
            <button
              id="translate-toggle"
              type="button"
              onClick={onTranslateToggle}
              disabled={isActive}
              title={isActive ? tr("settings.lockedWhileActive") : undefined}
              className={`w-full px-3.5 py-2.5 text-xs font-semibold border text-left flex items-center justify-between transition-all cursor-pointer ${
                translate
                  ? `${t.bgSoft} ${t.borderSoft} ${t.textLight} shadow-sm`
                  : "border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
              } ${isActive ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span>{tr("settings.translate")}</span>
              {translate
                ? <Check className={`w-3.5 h-3.5 shrink-0 ${t.text}`} />
                : <Square className="w-3.5 h-3.5 shrink-0 opacity-50" />}
            </button>
            {!translate && (
              <p className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-subtle)] border border-[var(--border-medium)] rounded-lg px-2.5 py-1.5">
                {tr("settings.translateHint")}
              </p>
            )}

            <button
              id="speak-toggle"
              type="button"
              onClick={onSpeakToggle}
              disabled={isActive || !translate}
              title={
                !translate ? tr("settings.speakUnavailable")
                : isActive ? tr("settings.lockedWhileActive")
                : undefined
              }
              className={`w-full px-3.5 py-2.5 text-xs font-semibold border text-left flex items-center justify-between transition-all cursor-pointer ${
                speak
                  ? `${t.bgSoft} ${t.borderSoft} ${t.textLight} shadow-sm`
                  : "border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
              } ${isActive || !translate ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span className="flex items-center gap-1.5">
                {speak ? <Volume2 className="w-3.5 h-3.5 shrink-0" /> : <VolumeX className="w-3.5 h-3.5 shrink-0" />}
                {tr("settings.speak")}
              </span>
              {speak
                ? <Check className={`w-3.5 h-3.5 shrink-0 ${t.text}`} />
                : <Square className="w-3.5 h-3.5 shrink-0 opacity-50" />}
            </button>
            {translate && !speak && (
              <p className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-subtle)] border border-[var(--border-medium)] rounded-lg px-2.5 py-1.5">
                {tr("settings.speakHint")}
              </p>
            )}
          </div>
        </div>

        {/* Language Selection — in recording mode the source language still matters
            (it is the spoken language, stored on every card); only the target and
            the direction become meaningless. */}
        <div className="mb-5">
          <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-2 uppercase tracking-widest">{tr("settings.languages")}</label>
          {isOpenAI && (
            <p className="text-[10px] text-[var(--text-muted)] mb-2 bg-[var(--bg-subtle)] border border-[var(--border-medium)] rounded-lg px-2.5 py-1.5">
              {tr("settings.openaiNote")}
            </p>
          )}

          <div className="flex items-end gap-2">
            <label className="flex-1 flex flex-col gap-1 min-w-0">
              <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">{tr("settings.sourceLang")}</span>
              <select
                id="source-lang"
                value={sourceLang}
                onChange={(e) => onSourceChange(e.target.value)}
                disabled={isActive}
                className="w-full px-2.5 py-2 text-xs font-semibold border border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-primary)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-[var(--border-strong)]"
              >
                {sourceOptions.map((l) => <option key={l.code} value={l.code}>{langName(l.code, uiLang)}</option>)}
              </select>
            </label>

            {/* The swap button stays enabled during a live session so the user
                can manually flip the translation direction mid-conversation. */}
            <button
              id="swap-langs"
              type="button"
              onClick={onSwapLangs}
              disabled={!canSwap || !translate}
              title={tr("settings.swap")}
              className="shrink-0 p-2 border border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>

            <label className={`flex-1 flex flex-col gap-1 min-w-0 ${translate ? "" : "opacity-50"}`}>
              <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">{tr("settings.targetLang")}</span>
              <select
                id="target-lang"
                value={targetLang}
                onChange={(e) => onTargetChange(e.target.value)}
                disabled={isActive || !translate}
                className="w-full px-2.5 py-2 text-xs font-semibold border border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-primary)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-[var(--border-strong)]"
              >
                {targetOptions.map((l) => <option key={l.code} value={l.code}>{langName(l.code, uiLang)}</option>)}
              </select>
            </label>
          </div>

          {canBidirectional ? (
            <button
              id="bidirectional-toggle"
              type="button"
              onClick={onBidirectionalToggle}
              disabled={isActive || !translate}
              className={`mt-2.5 w-full px-3.5 py-2.5 text-xs font-semibold border text-left flex items-center justify-between transition-all cursor-pointer ${
                bidirectional
                  ? `${t.bgSoft} ${t.borderSoft} ${t.textLight} shadow-sm`
                  : "border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
              } ${isActive || !translate ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span>{tr("settings.bidirectional")}</span>
              {bidirectional
                ? <Check className={`w-3.5 h-3.5 ${t.text}`} />
                : <ArrowRightLeft className="w-3.5 h-3.5 opacity-70" />}
            </button>
          ) : (
            <p className="mt-2 text-[10px] text-[var(--text-muted)] bg-[var(--bg-subtle)] border border-[var(--border-medium)] rounded-lg px-2.5 py-1.5">
              {tr("settings.bidirectionalUnavailable")}
            </p>
          )}
        </div>

        {/* Audio Source Selection */}
        <div className="mb-5">
          <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-2 uppercase tracking-widest">{tr("settings.audioSource")}</label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              id="source-mic"
              onClick={() => onAudioSourceChange("microphone")}
              disabled={isActive}
              className={`px-3 py-3 border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                audioSource === "microphone"
                  ? "bg-[var(--bg-raised)] border-[var(--border-strong)] text-[var(--text-primary)] shadow-sm"
                  : "border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-muted)] hover:border-[var(--border-strong)]"
              } ${isActive ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <Mic className={`w-4 h-4 ${t.text}`} />
              <span>{tr("settings.microphone")}</span>
            </button>
            <button
              id="source-tab"
              onClick={() => onAudioSourceChange("tab-audio")}
              disabled={isActive}
              className={`px-3 py-3 border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                audioSource === "tab-audio"
                  ? "bg-[var(--bg-raised)] border-[var(--border-strong)] text-[var(--text-primary)] shadow-sm"
                  : "border-[var(--border-medium)] bg-[var(--bg-base)] text-[var(--text-muted)] hover:border-[var(--border-strong)]"
              } ${isActive ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <Monitor className={`w-4 h-4 ${t.text}`} />
              <span>{tr("settings.tabAudio")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
