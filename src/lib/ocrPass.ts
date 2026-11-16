// 照片识别的运行器（有网络与 Canvas，故不在 src/core）：本地压缩 → 送 /ocr → 取回文字。
// 图片只在内存里：压缩后的 dataURL 发出去即丢，不写 localStorage、不落地。
import { classifyOcrError, stripOcrCoordLines, type OcrErrorCode } from "@/src/core/ocr/plan";

const ENDPOINT = "/functions/v1/app/ocr";
// 单张识别超时：探针实测最快 1.3s，网关上限约 60s（M0 实测）。
const OCR_TIMEOUT_MS = 45_000;

export const MAX_LONG_EDGE = 1600;
export const JPEG_QUALITY = 0.8;

export class OcrError extends Error {
  constructor(readonly code: OcrErrorCode) {
    super(code);
    this.name = "OcrError";
  }
}

async function decode(file: File): Promise<{ width: number; height: number; source: CanvasImageSource }> {
  // EXIF 方向按照片自带信息纠正，手机竖拍才不会躺倒。
  if ("createImageBitmap" in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bmp.width, height: bmp.height, source: bmp };
    } catch {
      /* 落到 img 解码 */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image_decode_failed"));
      img.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight, source: img };
  } finally {
    // 让解码完成后再撤销，避免部分浏览器取不到像素。
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

// 长边压到 1600px 以内、JPEG 质量 0.8：识别够用，请求体也小。
export async function compressImage(file: File): Promise<string> {
  const { width, height, source } = await decode(file);
  if (!width || !height) throw new OcrError("blurry");
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new OcrError("unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export async function recognizeDataUrl(
  dataUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl }),
      signal: controller.signal,
    });
    let data: { ok?: boolean; text?: string; error?: string } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      /* 非 JSON 响应按状态码归类 */
    }
    if (!res.ok || data.ok !== true || typeof data.text !== "string") {
      throw new OcrError(classifyOcrError(data.error, res.status));
    }
    return stripOcrCoordLines(data.text);
  } catch (e) {
    if (e instanceof OcrError) throw e;
    throw new OcrError(controller.signal.aborted ? "network" : "network");
  } finally {
    clearTimeout(timer);
  }
}

export async function recognizeImage(
  file: File,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const dataUrl = await compressImage(file);
  return recognizeDataUrl(dataUrl, fetchImpl);
}
