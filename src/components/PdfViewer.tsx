// 站内 pdf.js 阅读器弹层：渲染 public/docs/ 的本地托管典例 PDF。
// 移动端对跨站 PDF 多为下载而非预览，故本地文件 + canvas 渲染，桌面手机一致。
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface Props {
  // 站内路径，如 /docs/bj-prepaid.pdf
  src: string;
  // 打开时定位页（1 起），越界自动夹取。
  page?: number;
  title: string;
  // 原外链，加载失败时兜底给出。
  sourceUrl?: string;
  onClose: () => void;
}

export function PdfViewer({ src, page, title, sourceUrl, onClose }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState(Math.max(1, page ?? 1));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const res = await fetch(src);
      if (!res.ok) throw new Error(`http ${res.status}`);
      const data = new Uint8Array(await res.arrayBuffer());
      const loaded = await pdfjs.getDocument({
        data,
        cMapUrl: "/pdf-cmaps/",
        cMapPacked: true,
      }).promise;
      if (cancelled) {
        loaded.cleanup();
        return;
      }
      setDoc(loaded);
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const target = Math.min(current, doc.numPages);
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pdfPage = await doc.getPage(target);
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const avail = bodyRef.current?.clientWidth ?? document.documentElement.clientWidth - 32;
      const scale = Math.max(0.8, Math.min(2, (avail - 24) / base.width));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const viewport = pdfPage.getViewport({ scale: scale * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      // pdfjs v6：必须传 canvas 本身（canvasContext 仅供特殊场景配对使用）。
      await pdfPage.render({ canvas, viewport }).promise;
      bodyRef.current?.scrollTo({ top: 0 });
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [doc, current]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "rgba(30, 26, 20, 0.55)" }}
      role="dialog"
      aria-modal="true"
      aria-label={`典例来源：${title}`}
      onClick={onClose}
    >
      <div
        className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden border"
        style={{ backgroundColor: "var(--paper)", borderColor: "var(--paper-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-2.5"
          style={{ borderColor: "var(--paper-border)" }}
        >
          <span className="min-w-0 truncate font-title text-sm">{title}</span>
          <div className="flex shrink-0 items-center gap-3 text-sm">
            {!failed && doc && (
              <span className="text-muted-foreground">
                {Math.min(current, doc.numPages)} / {doc.numPages}
              </span>
            )}
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-4 text-muted-foreground"
              >
                原链接
              </a>
            )}
            <button type="button" onClick={onClose} className="font-title">
              关闭
            </button>
          </div>
        </div>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {failed ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              文档加载失败，可点击右上角「原链接」在新窗口查看。
            </p>
          ) : !doc ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">文档加载中……</p>
          ) : (
            <canvas ref={canvasRef} className="mx-auto block" />
          )}
        </div>
        {!failed && doc && doc.numPages > 1 && (
          <div
            className="flex items-center justify-center gap-6 border-t px-4 py-2 text-sm"
            style={{ borderColor: "var(--paper-border)" }}
          >
            <button
              type="button"
              className="font-title disabled:opacity-40"
              disabled={current <= 1}
              onClick={() => setCurrent((c) => Math.max(1, c - 1))}
            >
              上一页
            </button>
            <button
              type="button"
              className="font-title disabled:opacity-40"
              disabled={current >= doc.numPages}
              onClick={() => setCurrent((c) => Math.min(doc.numPages, c + 1))}
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
