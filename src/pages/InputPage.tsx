import { useRef, useState } from "react";
import { Disclaimer } from "@/src/components/Disclaimer";
import { extractFile } from "@/src/core/extract";
import { examples } from "@/src/core/examples";
import { demoContract } from "@/src/core/examples/demo";
import type { ContractSource } from "@/src/core/types";

interface Props {
  onAnalyze: (text: string, source: ContractSource, fileName?: string) => void;
  onOpenTraps: () => void;
  // 从陷阱库「检查这一项」跳回时的提示，不改动输入流程。
  checkHint?: string | null;
}

// 输入长度上限（AGENTS.md 限流口径：约 2 万字，尽力而为）。
const MAX_INPUT_CHARS = 20_000;

export function InputPage({ onAnalyze, onOpenTraps, checkHint }: Props) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<ContractSource>("paste");
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setHint(null);
    try {
      const res = await extractFile(file);
      if (res.scanned) {
        setHint("这是扫描版 PDF，提取不到文字。请改用粘贴文本，或上传含文字层的 PDF / Word。");
        return;
      }
      if (!res.text.trim()) {
        setHint("没有从文件中提取到文字，请改用粘贴文本。");
        return;
      }
      if (res.text.length > MAX_INPUT_CHARS) {
        setError(
          `提取到的文本约 ${(res.text.length / 10000).toFixed(1)} 万字，超出 2 万字处理上限，请删减无关内容后粘贴。`,
        );
        return;
      }
      setText(res.text);
      setSource(res.source);
      setHint(`已提取「${file.name}」的文字，可点击下方开始分析。`);
    } catch {
      setError("暂不支持该文件类型，请上传 Word(.docx) / PDF(.pdf)，或直接粘贴文本。");
    }
  }

  function start() {
    if (!text.trim()) {
      setError("请先粘贴合同文本，或上传文件，或选择一份示例。");
      return;
    }
    if (text.length > MAX_INPUT_CHARS) {
      setError(
        `合同文本约 ${(text.length / 10000).toFixed(1)} 万字，超出 2 万字处理上限，请删减无关内容后重试。`,
      );
      return;
    }
    onAnalyze(text, source);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-5 py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="font-title text-4xl tracking-tight">签前一查</h1>
          <p className="text-base text-muted-foreground">
            大学生合同防坑助手 · 租房 / 实习兼职
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenTraps}
          className="rounded-[var(--site-radius)] border border-border px-3 py-1.5 text-sm hover:border-[var(--site-accent)]"
        >
          浏览陷阱库
        </button>
      </header>

      {checkHint && (
        <p
          className="-mt-4 rounded-[var(--site-radius)] border px-4 py-2.5 text-sm leading-relaxed"
          style={{
            borderColor: "var(--site-accent)",
            color: "var(--site-accent)",
            backgroundColor: "var(--site-surface)",
          }}
        >
          {checkHint}
        </p>
      )}

      <section
        className="space-y-4 rounded-[var(--site-radius)] border border-border p-5"
        style={{ backgroundColor: "var(--site-surface)" }}
      >
        <div className="space-y-2">
          <label htmlFor="contract" className="text-sm font-medium">
            粘贴合同文本
          </label>
          <textarea
            id="contract"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSource("paste");
            }}
            rows={10}
            placeholder="把租房或实习兼职合同全文粘贴到这里……"
            className="w-full resize-y rounded-[var(--site-radius)] border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-[var(--site-accent)]"
          />
          <p className="text-xs text-muted-foreground">
            输入上限约 2 万字。合同原文只在你的浏览器本地处理，不会上传或保存。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-[var(--site-radius)] border border-border px-4 py-2 text-sm hover:border-[var(--site-accent)]"
          >
            上传 Word / PDF
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".docx,.pdf,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <span className="text-xs text-muted-foreground">
            扫描版 PDF 提取不到文字时，请改用粘贴。
          </span>
        </div>

        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        {error && (
          <p className="text-sm" style={{ color: "var(--risk-high)" }}>
            {error}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-title text-lg">先用示例试试（示例，虚构）</h2>
        <div className="flex flex-wrap gap-3">
          {examples.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => onAnalyze(ex.text, "example")}
              className="rounded-[var(--site-radius)] border border-border px-4 py-2 text-sm hover:border-[var(--site-accent)]"
            >
              {ex.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onAnalyze(demoContract.text, "example")}
            className="rounded-[var(--site-radius)] border px-4 py-2 text-sm"
            style={{
              borderColor: "var(--site-accent)",
              color: "var(--site-accent)",
            }}
          >
            {demoContract.label}（示例，虚构）
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-sm text-muted-foreground">
          分析时会把脱敏后的文本发送给 AI 服务。
        </p>
        <button
          type="button"
          onClick={start}
          className="w-full rounded-[var(--site-radius)] px-5 py-3 text-base font-medium sm:w-auto"
          style={{
            backgroundColor: "var(--site-accent)",
            color: "var(--site-on-accent)",
          }}
        >
          开始分析
        </button>
      </section>

      <footer className="mt-auto border-t border-border pt-4">
        <Disclaimer />
      </footer>
    </main>
  );
}