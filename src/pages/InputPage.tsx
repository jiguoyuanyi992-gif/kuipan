import { useEffect, useRef, useState } from "react";
import { Disclaimer } from "@/src/components/Disclaimer";
import { extractFile } from "@/src/core/extract";
import { examples } from "@/src/core/examples";
import { demoContract } from "@/src/core/examples/demo";
import {
  MAX_PAGE_IMAGES,
  OCR_ERROR_TEXT,
  takeImages,
  mergeOcrPages,
  type OcrErrorCode,
} from "@/src/core/ocr/plan";
import {
  OcrError,
  compressImage,
  recognizeDataUrl,
} from "@/src/lib/ocrPass";
import type { ContractSource } from "@/src/core/types";

interface Props {
  onAnalyze: (text: string, source: ContractSource, fileName?: string) => void;
  onOpenTraps: () => void;
  // 从陷阱库「检查这一项」跳回时的提示，不改动输入流程。
  checkHint?: string | null;
}

// 输入长度上限（AGENTS.md 限流口径：约 2 万字，尽力而为）。
const MAX_INPUT_CHARS = 20_000;

interface Photo {
  id: string;
  file: File;
  // 仅用于本地缩略图，删除或识别完成后撤销。
  url: string;
  status: "todo" | "doing" | "done" | "error";
  text?: string;
  error?: string;
}

export function InputPage({ onAnalyze, onOpenTraps, checkHint }: Props) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<ContractSource>("paste");
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [ocrRunning, setOcrRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const doneCount = photos.filter((p) => p.status === "done").length;

  function addFiles(files: File[]) {
    setError(null);
    setHint(null);
    const { kept, dropped } = takeImages(files);
    if (dropped > 0) setError(`一次最多 ${MAX_PAGE_IMAGES} 张照片，多出的 ${dropped} 张没有加入。`);

    const docs = files.filter((f) => !f.type.startsWith("image/"));
    if (kept.length > 0) {
      setPhotos((prev) => {
        const room = MAX_PAGE_IMAGES - prev.length;
        const added = kept.slice(0, room).map((file) => {
          const url = URL.createObjectURL(file);
          urlsRef.current.push(url);
          return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            file,
            url,
            status: "todo" as const,
          };
        });
        if (added.length < room && docs.length === 0 && kept.length > added.length) {
          setError(`照片总数不能超过 ${MAX_PAGE_IMAGES} 张。`);
        }
        return [...prev, ...added];
      });
    }

    if (docs.length > 0) void handleFile(docs[0]);
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function recognize() {
    const targets = photos;
    if (targets.length === 0 || ocrRunning) return;
    setOcrRunning(true);
    setError(null);
    setHint(null);
    setPhotos((prev) =>
      prev.map((p) => ({ ...p, status: "doing" as const, error: undefined })),
    );

    const results = await Promise.all(
      targets.map(async (p, index) => {
        try {
          const dataUrl = await compressImage(p.file);
          return { index, id: p.id, ok: true as const, text: await recognizeDataUrl(dataUrl) };
        } catch (e) {
          const code: OcrErrorCode = e instanceof OcrError ? e.code : "network";
          return { index, id: p.id, ok: false as const, error: OCR_ERROR_TEXT[code] };
        }
      }),
    );

    setPhotos((prev) =>
      prev.map((p) => {
        const r = results.find((x) => x.id === p.id);
        if (!r) return p;
        return r.ok
          ? { ...p, status: "done" as const, text: r.text }
          : { ...p, status: "error" as const, error: r.error };
      }),
    );

    const merged = mergeOcrPages(results.map((r) => ({ index: r.index, text: r.ok ? r.text : "" })));
    if (!merged.ok) {
      setError(OCR_ERROR_TEXT[merged.error]);
    } else {
      setText(merged.text);
      setSource("photo");
      const failed = results.filter((r) => !r.ok).length;
      setHint(
        `已识别 ${merged.pages} 页文字${failed ? `，${failed} 张失败` : ""}。` +
          "识别难免有错字，请先核对修改，再点「开始分析」。",
      );
    }
    setOcrRunning(false);
  }

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
      setError("暂不支持该文件类型，请上传 Word(.docx) / PDF(.pdf) / 合同照片，或直接粘贴文本。");
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
            输入上限约 2 万字。文字合同会先在本地脱敏再发给 AI 分析。照片会发送给 AI
            服务用于识别文字，识别后立即丢弃，不保存。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-[var(--site-radius)] border border-border px-4 py-2 text-sm hover:border-[var(--site-accent)]"
          >
            上传 Word / PDF / 照片
          </button>
          {/* 不加 capture：手机上由系统自己决定用相机还是相册。 */}
          <input
            ref={fileRef}
            type="file"
            accept=".docx,.pdf,.txt,.md,image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const list = e.target.files ? [...e.target.files] : [];
              if (list.length > 0) addFiles(list);
              e.target.value = "";
            }}
          />
          <span className="text-xs text-muted-foreground">
            照片一次最多 {MAX_PAGE_IMAGES} 张，按选择顺序当页序。扫描版 PDF 请改用拍照或粘贴。
          </span>
        </div>

        {photos.length > 0 && (
          <div className="space-y-2 rounded-[var(--site-radius)] border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                合同照片 {photos.length} 张 · 已识别 {doneCount} 张
              </p>
              <button
                type="button"
                onClick={() => void recognize()}
                disabled={ocrRunning}
                className="rounded-[var(--site-radius)] border px-3 py-1.5 text-sm hover:border-[var(--site-accent)] disabled:opacity-50"
                style={{ borderColor: "var(--site-accent)", color: "var(--site-accent)" }}
              >
                {ocrRunning
                  ? `识别中 ${photos.filter((p) => p.status === "done" || p.status === "error").length}/${photos.length}…`
                  : "识别成文字"}
              </button>
            </div>
            <ul className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <li key={p.id} className="relative">
                  <img
                    src={p.url}
                    alt={`第 ${i + 1} 页合同照片`}
                    className="h-24 w-[72px] rounded object-cover"
                    style={{
                      border: `1px solid ${
                        p.status === "error" ? "var(--risk-high)" : "var(--site-border, #d8d2c4)"
                      }`,
                    }}
                  />
                  <span className="absolute bottom-0 left-0 rounded bg-black/55 px-1 text-[10px] leading-4 text-white">
                    {i + 1}
                    {p.status === "doing" ? " 识别中" : ""}
                    {p.status === "done" ? " 已识别" : ""}
                    {p.status === "error" ? " 失败" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePhoto(p.id)}
                    aria-label={`删除第 ${i + 1} 张照片`}
                    className="absolute right-0 top-0 h-5 w-5 rounded-full bg-black/55 text-[11px] leading-5 text-white"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            {photos.some((p) => p.status === "error") && (
              <ul className="space-y-1 text-xs" style={{ color: "var(--risk-high)" }}>
                {photos
                  .filter((p) => p.status === "error")
                  .map((p, i) => (
                    <li key={p.id}>第 {photos.indexOf(p) + 1} 张：{p.error}</li>
                  ))}
              </ul>
            )}
          </div>
        )}

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
