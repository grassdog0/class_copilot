import { create } from "zustand";
import type { Dictionary, Lang } from "./types";
import { zh } from "./zh";
import { en } from "./en";

export type { Lang, Dictionary };

const STORAGE_KEY = "cc.lang";

const DICTIONARIES: Record<Lang, Dictionary> = { zh, en };

function readStoredLang(): Lang {
  if (typeof localStorage === "undefined") return "zh";
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "zh" || raw === "en") return raw;
  // Auto-detect from browser
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  if (nav.startsWith("zh")) return "zh";
  return "en";
}

interface I18nState {
  lang: Lang;
  t: Dictionary;
  setLang: (lang: Lang) => void;
  toggle: () => void;
}

const initialLang = readStoredLang();

export const useI18n = create<I18nState>((set, get) => ({
  lang: initialLang,
  t: DICTIONARIES[initialLang],
  setLang: (lang) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, lang);
    }
    document.documentElement.lang = lang;
    set({ lang, t: DICTIONARIES[lang] });
  },
  toggle: () => {
    const next = get().lang === "zh" ? "en" : "zh";
    get().setLang(next);
  },
}));

// Set initial html lang attribute
if (typeof document !== "undefined") {
  document.documentElement.lang = initialLang;
}

/**
 * Simple template interpolation: replaces {key} with values.
 * Usage: tpl(t.some_key, { name: "foo" })
 */
export function tpl(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}
