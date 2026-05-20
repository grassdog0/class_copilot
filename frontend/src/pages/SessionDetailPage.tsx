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
import { useI18n, tpl } from "@/i18n";
import {
  formatDuration,
  formatLocalDateTime,
  formatLocalTime,
  formatEpoch,
} from "@/lib/time";
import { formatFileSize, formatConfidence } from "@/lib/format";
import { cn } from "@/lib/cn";

type Tab = "transcripts" | "questions" | "chat";

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("transcripts");
  const pushToast = useUiStore((state) => state.pushToast);
  const { t } = useI18n();

  const TABS: { key: Tab; label: string }[] = [
    { key: "transcripts", label: t.detail_tab_transcripts },
    { key: "questions", label: t.detail_tab_questions },
    { key: "chat", label: t.detail_tab_chat },
  ];

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getSession(id);
      setDetail(data);
    } catch (err) {
      pushToast({
        level: "error",
        message: err instanceof Error ? err.message : t.detail_loadFailed,
      });
    } finally {
      setLoading(false);
    }
  }, [id, pushToast, t]);

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
        title={t.detail_notFound}
        action={
          <Link to="/sessions" className="btn btn-secondary">
            {t.detail_back_link}
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
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft size={12} />
          {t.detail_back}
        </Link>
      </div>

      <header className="card flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {session.custom_name ?? session.course_name ?? t.common_unnamed}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {session.course_name ?? t.common_dash} · {session.date}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={exportMarkdownUrl(session.id)} download>
              <Button variant="secondary">
                <Download size={14} />
                {t.detail_export}
              </Button>
            </a>
            {recordingAvailable ? (
              <a href={recordingUrl(session.id)} download>
                <Button variant="secondary">
                  <FileAudio size={14} />
                  {t.detail_downloadRecording}
                </Button>
              </a>
            ) : null}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400 md:grid-cols-4">
          <Field label={t.detail_field_status}>
            <SessionStatusBadge status={session.status} />
          </Field>
          <Field label={t.detail_field_started}>{formatLocalDateTime(session.started_at)}</Field>
          <Field label={t.detail_field_ended}>{formatLocalDateTime(session.ended_at)}</Field>
          <Field label={t.detail_field_recording}>
            {formatDuration(session.recording_duration_seconds)} · {formatFileSize(
              session.recording_file_size_bytes,
            )}
          </Field>
        </dl>
      </header>

      <nav className="flex border-b border-slate-200 dark:border-slate-700">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === item.key
                ? "border-brand-600 text-brand-700 dark:text-brand-300"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
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
      <dd className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">{children}</dd>
    </div>
  );
}

function SessionStatusBadge({ status }: { status: SessionDetail["session"]["status"] }) {
  const { t } = useI18n();
  if (status === "active") return <Badge tone="info">{t.sessions_status_active}</Badge>;
  if (status === "interrupted") return <Badge tone="warning">{t.sessions_status_interrupted}</Badge>;
  return <Badge tone="success">{t.sessions_status_stopped}</Badge>;
}

function TranscriptsTab({ items }: { items: TranscriptionItem[] }) {
  const { t } = useI18n();
  if (items.length === 0) {
    return <EmptyState title={t.detail_no_transcripts} />;
  }
  return (
    <div className="card">
      <div className="card-body space-y-1.5 font-mono text-[13px] leading-relaxed">
        {items.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[auto_1fr] gap-3 rounded-sm px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-700/50"
          >
            <span className="select-none text-slate-400">{formatEpoch(item.start_time)}</span>
            <span className="text-slate-800 dark:text-slate-200">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuestionsTab({ items }: { items: QuestionItem[] }) {
  const answerType = useSettingsStore((state) => state.settings?.auto_answer_type ?? "brief");
  const { t } = useI18n();
  if (items.length === 0) {
    return <EmptyState title={t.detail_no_questions} />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((question) => {
        const answer = question.answers.find((item) => item.answer_type === answerType);
        return (
          <li key={question.id} className="card px-4 py-3">
            <div className="flex items-center gap-2">
              <Badge tone={question.source === "manual" ? "info" : "neutral"}>
                {question.source === "manual" ? t.qa_source_manual : t.qa_source_auto}
              </Badge>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t.qa_confidence} {formatConfidence(question.confidence)}
              </span>
              <span className="text-xs text-slate-400">
                {formatLocalTime(question.created_at)}
              </span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{question.question_text}</p>
            <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-700/50">
              {answer ? (
                <Markdown content={answer.content} />
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tpl(t.detail_no_answer_for_type, { type: answerType })}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ChatTab({ items }: { items: ChatMessageItem[] }) {
  const { t } = useI18n();
  if (items.length === 0) {
    return <EmptyState title={t.detail_no_chat} />;
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
              : "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200",
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
