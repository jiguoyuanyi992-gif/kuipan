// 照片识别的纯函数层：页序、合并、噪声清洗与错误文案映射。
// 与网络、Canvas 无关，便于单测（AGENTS.md：业务逻辑全在 src/core）。

export const MAX_PAGE_IMAGES = 6;

// 与输入页的处理上限一致（约 2 万字）。
export const MAX_OCR_TOTAL_CHARS = 20_000;

export interface OcrPage {
  index: number;
  text: string;
}

export type OcrErrorCode =
  | "blurry"
  | "network"
  | "quota"
  | "too_large"
  | "too_many_pages"
  | "empty"
  | "unavailable";

// 服务端 error 码 → 页面提示。都给出改用粘贴的出路。
const SERVER_ERRORS: Record<string, OcrErrorCode> = {
  ocr_empty: "blurry",
  upstream_timeout: "network",
  upstream_network: "network",
  upstream_http: "network",
  upstream_empty: "network",
  rate_limited: "quota",
  input_too_long: "too_large",
  image_too_large: "too_large",
  not_configured: "unavailable",
  env_error: "unavailable",
  unavailable_model: "unavailable",
  bad_image: "blurry",
};

export function classifyOcrError(
  serverError: string | undefined,
  httpStatus?: number,
): OcrErrorCode {
  if (serverError && SERVER_ERRORS[serverError]) return SERVER_ERRORS[serverError];
  if (httpStatus === 429) return "quota";
  if (httpStatus === 413) return "too_large";
  if (httpStatus === 404 || httpStatus === 503) return "unavailable";
  return "network";
}

export const OCR_ERROR_TEXT: Record<OcrErrorCode, string> = {
  blurry:
    "这张照片没有识别出文字，可能是太模糊、光线不足或拍歪了。请重拍一张，或改用粘贴文本。",
  network: "识别服务暂时没有响应（网络或服务异常）。请稍后重试，或改用粘贴文本。",
  quota: "当前网络短时间请求过多，请一分钟后再试，或改用粘贴文本。",
  too_large: "图片过大，压缩后仍超出处理上限。请减少张数或改用粘贴文本。",
  too_many_pages: `一次最多识别 ${MAX_PAGE_IMAGES} 张照片，请删掉几张再识别。`,
  empty: "照片里没有可识别的文字。请改用粘贴文本。",
  unavailable: "文字识别服务暂不可用，请改用粘贴文本或上传 Word / PDF。",
};

// qwen-vl-ocr 会在每行前面吐出「坐标,坐标,…,」；其余模型不带。统一清洗掉。
const COORD_PREFIX = /^(?:\d+(?:\.\d+)?,){3,}/;

export function stripOcrCoordLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(COORD_PREFIX, ""))
    .join("\n");
}

// 视觉模型爱用行尾双空格表示换行，合并前统一收掉。
function normalizeLineEnds(text: string): string {
  return text.replace(/[ \t]+$/gm, "");
}

export type MergeResult =
  | { ok: true; text: string; pages: number }
  | { ok: false; error: OcrErrorCode };

// 按选择顺序当作页序合并；空页跳过，全空则报 empty。
export function mergeOcrPages(pages: OcrPage[]): MergeResult {
  const ordered = [...pages].sort((a, b) => a.index - b.index);
  const chunks = ordered
    .map((p) => normalizeLineEnds(stripOcrCoordLines(p.text)).trim())
    .filter((t) => t.length > 0);
  if (chunks.length === 0) return { ok: false, error: "empty" };
  const text = chunks.join("\n\n");
  if (text.length > MAX_OCR_TOTAL_CHARS) return { ok: false, error: "too_large" };
  return { ok: true, text, pages: chunks.length };
}

// 只收图片；超出上限的部分直接忽略，由调用方提示。
export function takeImages(files: File[], limit = MAX_PAGE_IMAGES): {
  kept: File[];
  dropped: number;
} {
  const images = files.filter((f) => f.type.startsWith("image/"));
  return { kept: images.slice(0, limit), dropped: Math.max(0, images.length - limit) };
}
