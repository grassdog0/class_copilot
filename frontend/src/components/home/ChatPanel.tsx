import { useEffect, useRef, useState } from "react";
import { Send, MessageCircle, Zap, Sparkles, Brain } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useChatStore } from "@/stores/chat";
import { useSessionStore } from "@/stores/session";
import { useWsSend } from "@/ws/useWebSocket";
import { Markdown } from "@/components/Markdown";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n";

type ModelChoice = "fast" | "quality";

export function ChatPanel() {
  const messages = useChatStore((state) => state.messages);
  const appendUser = useChatStore((state) => state.appendUser);
  const isListening = useSessionStore((state) => state.isListening);
  const send = useWsSend();
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ModelChoice>("quality");
  const [enableThinking, setEnableThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, messages[messages.length - 1]?.content]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || !isListening) return;
    appendUser(trimmed);
    send("chat", { question: trimmed, model, enable_thinking: enableThinking });
    setInput("");
  };

  return (
    <div className="card flex h-full min-h-0 flex-col overflow-hidden">
      <div className="card-header shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle size={14} className="text-slate-500 dark:text-slate-400" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.chat_panel_title}</span>
        </div>
        <div className="flex items-center gap-2">
          <ModelToggle value={model} onChange={setModel} />
          <ThinkingToggle value={enableThinking} onChange={setEnableThinking} />
        </div>
      </div>
      <div ref={scrollRef} className="card-body min-h-0 flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isListening ? t.chat_placeholder_active : t.chat_placeholder_idle}
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
                    : "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200",
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
      <div className="sticky bottom-0 shrink-0 border-t border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
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
            placeholder={isListening ? t.chat_inputPlaceholder_active : t.chat_inputPlaceholder_idle}
            disabled={!isListening}
            rows={2}
            className="input min-h-[2.5rem] flex-1 resize-none"
          />
          <Button onClick={handleSubmit} disabled={!isListening || input.trim() === ""}>
            <Send size={14} />
            {t.common_send}
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
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs dark:border-slate-600 dark:bg-slate-700">
      <ToggleButton
        active={value === "quality"}
        onClick={() => onChange("quality")}
        icon={<Sparkles size={12} />}
        label={t.chat_model_quality}
      />
      <ToggleButton
        active={value === "fast"}
        onClick={() => onChange("fast")}
        icon={<Zap size={12} />}
        label={t.chat_model_fast}
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
        active
          ? "bg-white text-brand-700 shadow-sm dark:bg-slate-600 dark:text-brand-300"
          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ThinkingToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
        value
          ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-600 dark:bg-brand-900/30 dark:text-brand-300"
          : "border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
      )}
      title={value ? t.chat_thinking_on_hint : t.chat_thinking_off_hint}
    >
      <Brain size={12} />
      {value ? t.chat_thinking_on : t.chat_thinking_off}
    </button>
  );
}
