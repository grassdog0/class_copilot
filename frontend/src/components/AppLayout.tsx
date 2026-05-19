import { NavLink, Outlet } from "react-router-dom";
import { Headphones, History, MessageCircle, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { useWsConnectionState } from "@/ws/useWebSocket";

const NAV_ITEMS = [
  { to: "/", label: "监听", icon: Headphones, end: true },
  { to: "/qa", label: "问答", icon: Sparkles, end: false },
  { to: "/chat", label: "提问", icon: MessageCircle, end: false },
  { to: "/sessions", label: "会话", icon: History, end: false },
  { to: "/settings", label: "设置", icon: Settings, end: false },
];

export function AppLayout() {
  const wsState = useWsConnectionState();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white">
              <Headphones size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">听课助手</p>
              <p className="text-xs text-slate-500">Class Copilot</p>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100",
                  )
                }
              >
                <item.icon size={14} />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        {wsState !== "open" ? (
          <div
            role="alert"
            className="border-t border-amber-200 bg-amber-50 px-6 py-1.5 text-center text-xs text-amber-800"
          >
            {wsState === "connecting" ? "正在连接服务器..." : "服务器已断开，正在重试"}
          </div>
        ) : null}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
