export type ThemeKey = "light" | "dark";

export const THEME_KEYS: ThemeKey[] = ["light", "dark"];

export interface ThemeConfig {
  id: ThemeKey;
  name: string;
  selectionBg: string;
  strong: string;
  strongHover: string;
  text: string;
  textMid: string;
  textLight: string;
  bgSoft: string;
  bgFaint: string;
  bgVeryFaint: string;
  bgBadge: string;
  bgDeep: string;
  borderSoft: string;
  borderFaint: string;
  borderBadge: string;
  borderDeep: string;
  borderDeepAlt: string;
  borderL: string;
  vizInputColor: string;
}

export const THEMES: Record<ThemeKey, ThemeConfig> = {
  light: {
    id: "light",
    name: "Világos",
    selectionBg: "selection:bg-teal-600/20",
    strong: "bg-teal-700",
    strongHover: "hover:bg-teal-600",
    text: "text-teal-700",
    textMid: "text-teal-600",
    textLight: "text-teal-900",
    bgSoft: "bg-teal-700/10",
    bgFaint: "bg-teal-700/6",
    bgVeryFaint: "bg-teal-700/4",
    bgBadge: "bg-teal-700/12",
    bgDeep: "bg-teal-50",
    borderSoft: "border-teal-700/30",
    borderFaint: "border-teal-700/15",
    borderBadge: "border-teal-700/25",
    borderDeep: "border-teal-200/70",
    borderDeepAlt: "border-teal-100",
    borderL: "border-l-teal-500",
    vizInputColor: "#0d9488",
  },
  dark: {
    id: "dark",
    name: "Sötét",
    selectionBg: "selection:bg-teal-400/25",
    strong: "bg-teal-600",
    strongHover: "hover:bg-teal-500",
    text: "text-teal-400",
    textMid: "text-teal-300",
    textLight: "text-teal-100",
    bgSoft: "bg-teal-400/15",
    bgFaint: "bg-teal-400/8",
    bgVeryFaint: "bg-teal-400/5",
    bgBadge: "bg-teal-400/15",
    bgDeep: "bg-teal-900/30",
    borderSoft: "border-teal-400/35",
    borderFaint: "border-teal-400/18",
    borderBadge: "border-teal-400/28",
    borderDeep: "border-teal-800/60",
    borderDeepAlt: "border-teal-900",
    borderL: "border-l-teal-400",
    vizInputColor: "#2dd4bf",
  },
};

export const DEFAULT_THEME: ThemeKey = "light";
