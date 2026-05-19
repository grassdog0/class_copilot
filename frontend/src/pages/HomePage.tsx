import { Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { CourseSelect } from "@/components/home/CourseSelect";
import { ListenControls } from "@/components/home/ListenControls";
import { MicLevelMeter } from "@/components/home/MicLevelMeter";
import { TranscriptStream } from "@/components/home/TranscriptStream";
import { QuestionList } from "@/components/home/QuestionList";
import { AnswerCard } from "@/components/home/AnswerCard";
import { ChatPanel } from "@/components/home/ChatPanel";

export function HomePage() {
  const isListening = useSessionStore((state) => state.isListening);
  const apiKeySet = useSettingsStore((state) => state.settings?.dashscope_api_key_set ?? false);

  return (
    <div className="flex flex-col gap-6">
      {!apiKeySet ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">尚未填写 DashScope API Key</p>
            <p className="mt-0.5 text-xs">
              请前往
              <Link to="/settings" className="mx-1 font-medium text-amber-900 underline">
                设置页
              </Link>
              填写后再开始监听。
            </p>
          </div>
        </div>
      ) : null}

      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-6">
          <CourseSelect disabled={isListening} />
          <ListenControls />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-4">
          <MicLevelMeter active={isListening} />
          <QuestionList />
        </div>
        <div className="space-y-4 lg:col-span-8">
          <TranscriptStream isListening={isListening} />
          <AnswerCard />
        </div>
      </div>

      <ChatPanel />
    </div>
  );
}
