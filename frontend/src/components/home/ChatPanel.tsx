import { useEffect, useRef, useState } from "react";
import { Send, MessageCircle, Zap, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useChatStore } from "@/stores/chat";
import { useSessionStore } from "@/stores/session";
import { useWsSend } from "@/ws/useWebSocket";
import { Markdown } from "@/components/Markdown";
import { cn } from "@/lib/cn";

type ModelChoice = "fast" | "quality";

export function ChatPanel() {
  const messages = useChatStore((state) => state.messages);
  const appendUser = useChatStore((state) => state.appendUser);
  const isListening = useSessionStore((state) => state.isListening);
  const send = useWsSend();
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ModelChoice>("quality");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, messages[messages.length - 1]?.content]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || !isListening) return;
    appendUser(trimmed);
    send("chat", { question: trimmed, model });
    setInput("");
  };

  return (
    <div className="card flex h-full min-h-0 flex-col overflow-hidden">
      <div className="card-header shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle size={14} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-900">主动提问</span>
        </div>
        <ModelToggle value={model} onChange={setModel} />
      </div>
      <div ref={scrollRef} className="card-body min-h-0 flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500">
            {isListening
              ? "在下方输入任何想问 AI 的问题，回答会基于当前课堂转写。"
              : "开始监听后才能向 AI 提问。"}
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex flex-col",
                message.role === "user" ? "items-end" : "items-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm",
                  message.role === "user"
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-800",
                )}
              >
                {message.role === "assistant" ? (
                  <Markdown content={message.content || "…"} />
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
                {message.streaming ? (
                  <span className="ml-1 inline-block h-2 w-1 animate-pulse bg-brand-300" />
                ) : null}
              </div>
              {message.modelUsed ? (
                <span className="mt-0.5 text-[10px] text-slate-400">{message.modelUsed}</span>
              ) : null}
            </div>
          ))
        )}
      </div>
      <div className="sticky bottom-0 shrink-0 border-t border-slate-200 bg-white p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={isListening ? "向 AI 提问..." : "需先开始监听"}
            disabled={!isListening}
            rows={2}
            className="input min-h-[2.5rem] flex-1 resize-none"
          />
          <Button onClick={handleSubmit} disabled={!isListening || input.trim() === ""}>
            <Send size={14} />
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModelToggle({
  value,
  onChange,
}: {
  value: ModelChoice;
  onChange: (value: ModelChoice) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
      <ToggleButton
        active={value === "quality"}
        onClick={() => onChange("quality")}
        icon={<Sparkles size={12} />}
        label="quality"
      />
      <ToggleButton
        active={value === "fast"}
        onClick={() => onChange("fast")}
        icon={<Zap size={12} />}
        label="fast"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-1 transition-colors",
        active ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
