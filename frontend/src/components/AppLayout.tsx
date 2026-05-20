import { NavLink, Outlet } from "react-router-dom";
import { Headphones, History, MessageCircle, Moon, Settings, Sparkles, Sun, Languages } from "lucide-react";
import { cn } from "@/lib/cn";
import { useWsConnectionState } from "@/ws/useWebSocket";
import { useThemeStore } from "@/stores/theme";
import { useI18n } from "@/i18n";

export function AppLayout() {
  const wsState = useWsConnectionState();
  const { t, lang, toggle: toggleLang } = useI18n();
  const { isDark, toggle: toggleTheme } = useThemeStore();

  const NAV_ITEMS = [
    { to: "/", label: t.navListen, icon: Headphones, end: true },
    { to: "/qa", label: t.navQA, icon: Sparkles, end: false },
    { to: "/chat", label: t.navChat, icon: MessageCircle, end: false },
    { to: "/sessions", label: t.navSessions, icon: History, end: false },
    { to: "/settings", label: t.navSettings, icon: Settings, end: false },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white">
              <Headphones size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.appName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t.appSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700",
                    )
                  }
                >
                  <item.icon size={14} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-1 border-l border-slate-200 pl-3 dark:border-slate-700">
              <button
                type="button"
                onClick={toggleLang}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                aria-label={t.langAria}
                title={t.langAria}
              >
                <Languages size={14} />
                <span>{lang === "zh" ? "EN" : "中"}</span>
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                aria-label={t.themeAria}
                title={t.themeAria}
              >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            </div>
          </div>
        </div>
        {wsState !== "open" ? (
          <div
            role="alert"
            className="border-t border-amber-200 bg-amber-50 px-6 py-1.5 text-center text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
          >
            {wsState === "connecting" ? t.wsConnecting : t.wsDisconnected}
          </div>
        ) : null}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
