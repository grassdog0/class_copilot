import { useState } from "react";
import { Eye, EyeOff, KeyRound, Save } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import { Badge } from "@/components/ui/Badge";

export function ApiKeySection() {
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  const pushToast = useUiStore((state) => state.pushToast);

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const apiKeySet = settings?.dashscope_api_key_set ?? false;
  const masked = settings?.dashscope_api_key ?? "";

  const save = async () => {
    setSubmitting(true);
    try {
      await update({ dashscope_api_key: value.trim() });
      pushToast({ level: "success", message: "API Key 已更新" });
      setEditing(false);
      setValue("");
    } catch {
      // toast handled in store
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <KeyRound size={14} />
            DashScope API Key
            {apiKeySet ? <Badge tone="success">已设置</Badge> : <Badge tone="warning">未设置</Badge>}
          </span>
        }
        description="用于调用阿里云百炼实时 ASR 与 LLM。已加密存储于本地。"
      />
      <CardBody className="space-y-3">
        {!editing ? (
          <div className="flex items-center justify-between gap-3">
            <code className="rounded-md bg-slate-100 px-3 py-1.5 font-mono text-sm text-slate-700">
              {apiKeySet ? masked : "未填写"}
            </code>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {apiKeySet ? "修改" : "填写"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                autoFocus
                type={reveal ? "text" : "password"}
                placeholder="sk-..."
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void save();
                  if (event.key === "Escape") setEditing(false);
                }}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                aria-label={reveal ? "隐藏" : "显示"}
              >
                {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button onClick={() => void save()} disabled={submitting || !value.trim()}>
              <Save size={14} />
              保存
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setValue("");
              }}
            >
              取消
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
