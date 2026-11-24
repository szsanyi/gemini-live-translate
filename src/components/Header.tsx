import { Languages, Settings, Moon, Sun, AudioLines, Library } from "lucide-react";
import { ThemeKey, ThemeConfig } from "../themes";
import { useLang } from "../i18n";

interface HeaderProps {
  theme: ThemeKey;
  mobileSettingsOpen: boolean;
  showVisualizer: boolean;
  t: ThemeConfig;
  onThemeChange: (key: ThemeKey) => void;
  onToggleVisualizer: () => void;
  onMobileSettingsToggle: () => void;
  onOpenRecordings: () => void;
}

export function Header({
  theme,
  mobileSettingsOpen,
  showVisualizer,
  t,
  onThemeChange,
  onToggleVisualizer,
  onMobileSettingsToggle,
  onOpenRecordings,
}: HeaderProps) {
  const { lang, setLang, tr } = useLang();

  return (
    <header className="px-5 py-2 border-b border-[var(--border-strong)] bg-[var(--bg-base)] sticky top-0 z-40 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-2.5">
        <div className={`h-7 w-7 ${t.strong} flex items-center justify-center glow-primary`}>
          <Languages className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            LiveTranslate
            <span className="text-[9px] font-semibold font-mono px-2 py-0.5 rounded-full bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-strong)] uppercase">
              Beta
            </span>
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Recordings library */}
        <button
          id="recordings-open"
          onClick={onOpenRecordings}
          className="p-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-raised)] text-xs hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer flex items-center gap-1.5"
          title={tr("recordings.open")}
        >
          <Library className="w-4 h-4" />
          <span className="hidden sm:inline font-semibold">{tr("recordings.open")}</span>
        </button>

        {/* Mobile settings toggle */}
        <button
          id="mobile-settings-toggle"
          onClick={onMobileSettingsToggle}
          className="xl:hidden p-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-raised)] text-xs hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer flex items-center gap-1.5"
          title={tr("header.settingsTitle")}
        >
          <Settings className="w-4 h-4" />
          <span className="hidden sm:inline">{mobileSettingsOpen ? tr("header.close") : tr("header.settings")}</span>
        </button>

        {/* Audio meters toggle */}
        <button
          id="visualizer-toggle"
          onClick={onToggleVisualizer}
          className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
            showVisualizer
              ? `${t.bgSoft} ${t.borderSoft} ${t.textLight}`
              : "border-[var(--border-strong)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
          }`}
          title={showVisualizer ? tr("header.vizHide") : tr("header.vizShow")}
        >
          <AudioLines className="w-4 h-4" />
        </button>

        {/* Interface language toggle */}
        <button
          id="lang-toggle"
          onClick={() => setLang(lang === "en" ? "hu" : "en")}
          className="px-2.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-raised)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer text-xs font-bold font-mono uppercase"
          title={tr("header.langTitle")}
        >
          {lang === "en" ? "EN" : "HU"}
        </button>

        {/* Light / Dark toggle */}
        <button
          id="theme-toggle"
          onClick={() => onThemeChange(theme === "light" ? "dark" : "light")}
          className="p-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-raised)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
          title={theme === "dark" ? tr("header.themeToLight") : tr("header.themeToDark")}
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
