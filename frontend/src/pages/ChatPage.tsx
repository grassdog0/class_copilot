import { AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { ChatPanel } from "@/components/home/ChatPanel";
import { useSessionStore } from "@/stores/session";

export function ChatPage() {
  const isListening = useSessionStore((state) => state.isListening);

  return (
    <div className="flex h-[calc(100vh-6.5rem)] min-h-[32rem] flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-lg font-semibold text-slate-900">主动提问</h1>
        <p className="mt-1 text-sm text-slate-500">
          基于当前监听会话的转写内容向 AI 提问。回答会保存在当前会话记录中。
        </p>
      </div>

      {!isListening ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">当前没有进行中的监听会话</p>
            <p className="mt-0.5 text-xs">
              请先到
              <Link to="/" className="mx-1 font-medium text-amber-900 underline">
                监听页
              </Link>
              开始监听，再在这里主动提问。
            </p>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <ChatPanel />
      </div>
    </div>
  );
}
