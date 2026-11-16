// /functions/v1/app/ocr：图片 → 文字。Key 只从环境变量读，图片只在内存里过一遍，
// 不落盘、不写日志、不回显内容；失败只回错误码。
// 模型顺序按 2026-11-16 线上探针实测：qwen3.5-ocr 1.3s 且输出干净，
// qwen3-vl-plus 6.0s 也可用，qwen-vl-ocr 3.4s 但每行带坐标前缀（客户端再清洗一次）。
import type { RateLimiter } from "./limiter.ts";
import { ipFromHeaders } from "./limiter.ts";

const BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const MODELS = ["qwen3.5-ocr", "qwen3-vl-plus", "qwen-vl-ocr"];
const NO_STORE = { "Cache-Control": "no-store" };
// 前端已压到长边 1600px / JPEG 0.8，这里只兜底挡异常大包（M0 实测请求体 ≥4MB 可过）。
const IMAGE_MAX_B64_CHARS = 5_000_000;
// 网关超时约 60s（M0 实测），整体留 45s，多次尝试共用同一截止时间。
const TOTAL_DEADLINE_MS = 45_000;
// 实测：不加这句时，页面角上的斜置水印章会被当成正文最后一行输出（只吐出半句「示例，虚」）。
const OCR_PROMPT =
  "请按原文顺序输出图片中合同正文的全部文字，保留条款编号与换行，不要解释、不要翻译、不要补充。" +
  "忽略水印、印章、签名章、页眉页脚装饰文字与残缺字迹，只输出合同条款正文。";

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function extractText(data: unknown): string {
  const choice = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as { text?: string }[]).map((c) => c.text ?? "").join("");
  }
  return "";
}

export async function ocr(request: Request, limiter: RateLimiter): Promise<Response> {
  const ip = ipFromHeaders(request.headers);
  if (!limiter.allow(ip, Date.now())) {
    return json({ ok: false, error: "rate_limited" }, 429);
  }

  let image = "";
  try {
    const body = (await request.json()) as { image?: unknown };
    if (typeof body.image === "string") image = body.image;
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }
  if (!image.startsWith("data:image/") || !image.includes(";base64,")) {
    return json({ ok: false, error: "bad_image" }, 400);
  }
  if (image.length > IMAGE_MAX_B64_CHARS) {
    return json({ ok: false, error: "image_too_large" }, 413);
  }

  let key = "";
  try {
    key = Deno.env.get("BAILIAN_API_KEY") ?? "";
  } catch {
    return json({ ok: false, error: "env_error" }, 503);
  }
  if (!key) return json({ ok: false, error: "not_configured" }, 503);

  const deadline = Date.now() + TOTAL_DEADLINE_MS;
  let lastError = "upstream_network";

  for (const model of MODELS) {
    const remaining = deadline - Date.now();
    if (remaining <= 2000) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: image } },
                { type: "text", text: OCR_PROMPT },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // 模型名不可用（404）或参数被拒（400）就换下一个；其余状态视为服务侧失败。
        lastError = res.status === 404 || res.status === 400 ? "model_unavailable" : "upstream_http";
        if (res.status === 429) {
          return json({ ok: false, error: "rate_limited" }, 429);
        }
        continue;
      }
      const text = extractText(data).trim();
      if (!text) {
        lastError = "ocr_empty";
        continue;
      }
      return json({ ok: true, text, model });
    } catch {
      lastError = controller.signal.aborted ? "upstream_timeout" : "upstream_network";
    } finally {
      clearTimeout(timer);
    }
  }

  return json(
    { ok: false, error: lastError === "model_unavailable" ? "unavailable_model" : lastError },
    502,
  );
}
