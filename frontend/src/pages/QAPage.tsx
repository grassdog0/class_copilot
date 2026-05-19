import { AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { QuestionAnswerPanel } from "@/components/home/QuestionAnswerPanel";
import { useSessionStore } from "@/stores/session";

export function QAPage() {
  const isListening = useSessionStore((state) => state.isListening);

  return (
    <div className="flex min-h-[calc(100vh-6.5rem)] flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-lg font-semibold text-slate-900">自动问答</h1>
        <p className="mt-1 text-sm text-slate-500">
          课堂监听过程中自动检测问题，并在同一页生成参考答案。
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
              开始监听；开始后这里会显示自动检测到的问题和参考答案。
            </p>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <QuestionAnswerPanel />
      </div>
    </div>
  );
}
