import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { extractDocx, extractPdf, isLikelyScanned } from "../extract";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const fixture = (n: string) => {
  const b = readFileSync(join(root, "dev", "fixtures", n));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const workerSrc = pathToFileURL(
  createRequire(import.meta.url).resolve("pdfjs-dist/build/pdf.worker.min.mjs"),
).href;
// node 的 CMap 读取走 fs.readFile，需纯文件路径且带尾斜杠；浏览器走 http URL。
const pdfOpts = {
  cMapUrl: join(root, "public", "pdf-cmaps") + "/",
  workerSrc,
};

describe("extract 扫描版判定", () => {
  it("空文本/纯空白判为扫描版", () => {
    expect(isLikelyScanned("")).toBe(true);
    expect(isLikelyScanned("   \n\t  ")).toBe(true);
  });

  it("文字极少判为扫描版（提示改用粘贴）", () => {
    expect(isLikelyScanned("合同")).toBe(true);
  });

  it("正常文字不判为扫描版", () => {
    expect(isLikelyScanned("房屋租赁合同 第一条 租赁期限 租期12个月。")).toBe(false);
  });
});

describe("extract 上传解析（编造 fixture）", () => {
  it("PDF 中文提取保留换行与条款标记", async () => {
    const { text, scanned } = await extractPdf(fixture("contract.pdf"), pdfOpts);
    expect(scanned).toBe(false);
    expect(text).toContain("押金归甲方所有");
    expect(text).toContain("\n第一条 租赁期限");
    expect(text).toContain("\n第四条 解除");
  });

  it("无文字 PDF 判为扫描版", async () => {
    const { text, scanned } = await extractPdf(fixture("scanned.pdf"), pdfOpts);
    expect(scanned).toBe(true);
    expect(text.replace(/\s/g, "")).toBe("");
  });

  it("DOCX 提取段落文本", async () => {
    const text = await extractDocx(fixture("contract.docx"));
    expect(text).toContain("押金归甲方所有");
    expect(text).toContain("第四条 解除");
  });
});