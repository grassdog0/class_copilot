import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileAudio, Loader2 } from "lucide-react";
import type { ChatMessageItem, QuestionItem, SessionDetail, TranscriptionItem } from "@/api/types";
import { getSession, exportMarkdownUrl, recordingUrl } from "@/api/sessions";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Markdown } from "@/components/Markdown";
import { useUiStore } from "@/stores/ui";
import { useSettingsStore } from "@/stores/settings";
import {
  formatDuration,
  formatLocalDateTime,
  formatLocalTime,
  formatEpoch,
} from "@/lib/time";
import { formatFileSize, formatConfidence } from "@/lib/format";
import { cn } from "@/lib/cn";

type Tab = "transcripts" | "questions" | "chat";

const TABS: { key: Tab; label: string }[] = [
  { key: "transcripts", label: "转写" },
  { key: "questions", label: "问题与答案" },
  { key: "chat", label: "主动提问" },
];

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("transcripts");
  const pushToast = useUiStore((state) => state.pushToast);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getSession(id);
      setDetail(data);
    } catch (err) {
      pushToast({
        level: "error",
        message: err instanceof Error ? err.message : "加载会话失败",
      });
    } finally {
      setLoading(false);
    }
  }, [id, pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !detail) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!detail) {
    return (
      <EmptyState
        title="未找到会话"
        action={
          <Link to="/sessions" className="btn btn-secondary">
            返回会话列表
          </Link>
        }
      />
    );
  }

  const { session } = detail;
  const recordingAvailable =
    !!session.recording_path && !!session.recording_file_size_bytes;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/sessions"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={12} />
          返回会话列表
        </Link>
      </div>

      <header className="card flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {session.custom_name ?? session.course_name ?? "未命名会话"}
            </h1>
            <p className="text-xs text-slate-500">
              {session.course_name ?? "—"} · {session.date}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={exportMarkdownUrl(session.id)} download>
              <Button variant="secondary">
                <Download size={14} />
                导出 Markdown
              </Button>
            </a>
            {recordingAvailable ? (
              <a href={recordingUrl(session.id)} download>
                <Button variant="secondary">
                  <FileAudio size={14} />
                  下载录音
                </Button>
              </a>
            ) : null}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-xs text-slate-600 md:grid-cols-4">
          <Field label="状态">
            <SessionStatusBadge status={session.status} />
          </Field>
          <Field label="开始">{formatLocalDateTime(session.started_at)}</Field>
          <Field label="结束">{formatLocalDateTime(session.ended_at)}</Field>
          <Field label="录音">
            {formatDuration(session.recording_duration_seconds)} · {formatFileSize(
              session.recording_file_size_bytes,
            )}
          </Field>
        </dl>
      </header>

      <nav className="flex border-b border-slate-200">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === item.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div>
        {tab === "transcripts" ? <TranscriptsTab items={detail.transcriptions} /> : null}
        {tab === "questions" ? <QuestionsTab items={detail.questions} /> : null}
        {tab === "chat" ? <ChatTab items={detail.chat_messages} /> : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

function SessionStatusBadge({ status }: { status: SessionDetail["session"]["status"] }) {
  if (status === "active") return <Badge tone="info">进行中</Badge>;
  if (status === "interrupted") return <Badge tone="warning">中断</Badge>;
  return <Badge tone="success">已停止</Badge>;
}

function TranscriptsTab({ items }: { items: TranscriptionItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="没有转写内容" />;
  }
  return (
    <div className="card">
      <div className="card-body space-y-1.5 font-mono text-[13px] leading-relaxed">
        {items.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[auto_1fr] gap-3 rounded-sm px-1 py-0.5 hover:bg-slate-50"
          >
            <span className="select-none text-slate-400">{formatEpoch(item.start_time)}</span>
            <span className="text-slate-800">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuestionsTab({ items }: { items: QuestionItem[] }) {
  const answerType = useSettingsStore((state) => state.settings?.auto_answer_type ?? "brief");
  if (items.length === 0) {
    return <EmptyState title="未检测到问题" />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((question) => {
        const answer = question.answers.find((item) => item.answer_type === answerType);
        return (
          <li key={question.id} className="card px-4 py-3">
            <div className="flex items-center gap-2">
              <Badge tone={question.source === "manual" ? "info" : "neutral"}>
                {question.source === "manual" ? "手动" : "自动"}
              </Badge>
              <span className="text-xs text-slate-500">
                置信度 {formatConfidence(question.confidence)}
              </span>
              <span className="text-xs text-slate-400">
                {formatLocalTime(question.created_at)}
              </span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-slate-900">{question.question_text}</p>
            <div className="mt-2 rounded-md bg-slate-50 px-3 py-2">
              {answer ? (
                <Markdown content={answer.content} />
              ) : (
                <p className="text-xs text-slate-500">未生成 {answerType} 答案</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ChatTab({ items }: { items: ChatMessageItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="没有主动提问记录" />;
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((message) => (
        <div
          key={message.id}
          className={cn(
            "max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm",
            message.role === "user"
              ? "ml-auto bg-brand-600 text-white"
              : "bg-slate-100 text-slate-800",
          )}
        >
          {message.role === "assistant" ? (
            <Markdown content={message.content} />
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
          <div
            className={cn(
              "mt-1 text-[10px]",
              message.role === "user" ? "text-brand-100" : "text-slate-400",
            )}
          >
            {formatLocalTime(message.created_at)}
            {message.model_used ? ` · ${message.model_used}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
