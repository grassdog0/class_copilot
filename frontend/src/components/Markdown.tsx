import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        "markdown text-sm leading-relaxed text-slate-800 dark:text-slate-200",
        "[&_h1]:mt-3 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-slate-900 dark:[&_h1]:text-slate-100",
        "[&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-slate-900 dark:[&_h2]:text-slate-100",
        "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-900 dark:[&_h3]:text-slate-100",
        "[&_p]:my-2",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-0.5",
        "[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_code]:font-mono dark:[&_code]:bg-slate-700",
        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-slate-100",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit",
        "[&_a]:text-brand-600 [&_a]:underline-offset-2 hover:[&_a]:underline dark:[&_a]:text-brand-400",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 dark:[&_blockquote]:border-slate-600 dark:[&_blockquote]:text-slate-400",
        "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse",
        "[&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left dark:[&_th]:border-slate-600 dark:[&_th]:bg-slate-700",
        "[&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1 dark:[&_td]:border-slate-600",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
