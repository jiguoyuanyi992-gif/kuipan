// 单 app Edge Function：/functions/v1/app/analyze 子路径。
// 薄代理：只做限流 + 输入上限 + 百炼调用，prompt 由客户端构造（与本地核心同一份 buildPrompt）。
// 红线：不打印 Key、不回显请求内容、永不落日志。
import { createRateLimiter, ipFromHeaders } from "./limiter.ts";

const BAILIAN_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const MODEL = "qwen-flash";
const NO_STORE = { "Cache-Control": "no-store" };
// prompt 字符上限：约 2 万字合同切批后单批远小于此，纯兜底。
const PROMPT_MAX_CHARS = 200_000;
// 网关超时约 60s（M0 实测），单次调用留 45s 余量。
const UPSTREAM_TIMEOUT_MS = 45_000;
// 每 IP 每分钟 N 次（N=10 待 M3 实测后报用户确认；单次分析并行 ≤8 批）。
const RATE_PER_MIN = 10;
// 批量 findings 的 JSON 可能较长，输出上限放宽。
const MAX_OUTPUT_TOKENS = 4000;

const limiter = createRateLimiter(RATE_PER_MIN);

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

async function analyze(request: Request): Promise<Response> {
  const ip = ipFromHeaders(request.headers);
  if (!limiter.allow(ip, Date.now())) {
    return json({ ok: false, error: "rate_limited" }, 429);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ ok: false, error: "body_unreadable" }, 400);
  }
  if (raw.length > PROMPT_MAX_CHARS) {
    return json({ ok: false, error: "input_too_long" }, 413);
  }

  let prompt: string;
  try {
    const body = JSON.parse(raw) as { prompt?: unknown };
    if (typeof body.prompt !== "string" || body.prompt.length === 0) {
      return json({ ok: false, error: "missing_prompt" }, 400);
    }
    prompt = body.prompt;
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  let key = "";
  try {
    key = Deno.env.get("BAILIAN_API_KEY") ?? "";
  } catch {
    return json({ ok: false, error: "env_error" }, 503);
  }
  if (!key) return json({ ok: false, error: "not_configured" }, 503);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(BAILIAN_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      await res.arrayBuffer().catch(() => undefined);
      return json({ ok: false, error: "upstream_http" }, 502);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      return json({ ok: false, error: "upstream_empty" }, 502);
    }
    return json({ ok: true, content });
  } catch {
    return json(
      {
        ok: false,
        error: controller.signal.aborted ? "upstream_timeout" : "upstream_network",
      },
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function handler(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (!path.endsWith("/analyze")) {
    return Promise.resolve(json({ ok: false, error: "not_found" }, 404));
  }
  if (request.method !== "POST") {
    return Promise.resolve(
      json({ ok: false, error: "method_not_allowed" }, 405),
    );
  }
  return analyze(request);
}
