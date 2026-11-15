import type { ContractSource } from "../types";

// 扫描版 PDF 提取不到文字 → 提示改用粘贴。纯函数，便于单测。
export function isLikelyScanned(text: string): boolean {
  return text.replace(/\s/g, "").length < 20;
}

export async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const res = await mammoth.extractRawText({ arrayBuffer: buffer });
  return res.value ?? "";
}

export async function extractPdf(
  buffer: ArrayBuffer,
): Promise<{ text: string; scanned: boolean }> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ");
    pages.push(line);
  }
  const text = pages.join("\n");
  return { text, scanned: isLikelyScanned(text) };
}

export interface ExtractResult {
  text: string;
  source: ContractSource;
  scanned?: boolean;
}

// 按扩展名分派。原始文件只在本地解析，不上传、不落盘。
export async function extractFile(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (name.endsWith(".docx")) {
    return { text: await extractDocx(buffer), source: "docx" };
  }
  if (name.endsWith(".pdf")) {
    const { text, scanned } = await extractPdf(buffer);
    return { text, source: "pdf", scanned };
  }
  if (name.endsWith(".txt") || name.endsWith(".md")) {
    return { text: await file.text(), source: "paste" };
  }
  throw new Error("unsupported_file_type");
}