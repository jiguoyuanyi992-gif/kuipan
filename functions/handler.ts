// M0 临时探针：只返回是/否状态与最小元数据，验完即删（恢复 starter 原样）。
// 红线：永不返回 Key、模型响应原文、请求内容、IP 值；不写任何日志。
const PROBE_NONCE = "efcdcb48-0bad-4499-b42a-34123739edc5";
const BAILIAN_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const NO_STORE = { "Cache-Control": "no-store" };
const BODY_CAP = 8 * 1024 * 1024;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function readSecret(): { present: boolean; value: string; error: boolean } {
  try {
    const value = Deno.env.get("BAILIAN_API_KEY") ?? "";
    return { present: value.length > 0, value, error: false };
  } catch {
    return { present: false, value: "", error: true };
  }
}

function isPublicIp(host: string): boolean {
  if (!host) return false;
  if (host.includes(":")) {
    const lower = host.toLowerCase();
    return lower !== "::1" && !lower.startsWith("fe80") &&
      !lower.startsWith("fc") && !lower.startsWith("fd");
  }
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

async function checkLlm(): Promise<Response> {
  const secret = readSecret();
  if (secret.error) return json({ item: "llm", ok: false, errorClass: "env_error" });
  if (!secret.present) return json({ item: "llm", ok: false, errorClass: "secret_missing" });
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(BAILIAN_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secret.value}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen-flash",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    await res.arrayBuffer().catch(() => undefined); // 消费响应体以释放连接，内容直接丢弃
    return json({
      item: "llm",
      ok: res.ok,
      status: res.status,
      latencyMs,
      ...(res.ok ? {} : { errorClass: "http" }),
    });
  } catch {
    return json({
      item: "llm",
      ok: false,
      latencyMs: Date.now() - started,
      errorClass: controller.signal.aborted ? "timeout" : "network",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function checkKv(): Promise<Response> {
  const denoKv = (Deno as unknown as {
    openKv?: () => Promise<{ close: () => void }>;
  }).openKv;
  const openKvApi = typeof denoKv === "function";
  let openKvWorks = false;
  if (openKvApi) {
    try {
      const kv = await Promise.race([
        denoKv!(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("kv_probe_timeout")), 3_000)
        ),
      ]);
      openKvWorks = true;
      try {
        kv.close();
      } catch { /* 已打开即证明能力存在，关闭失败不影响结论 */ }
    } catch {
      openKvWorks = false;
    }
  }
  return json({ item: "kv", ok: true, openKvApi, openKvWorks });
}

async function check(request: Request, item: string): Promise<Response> {
  const url = new URL(request.url);
  switch (item) {
    case "secret": {
      const secret = readSecret();
      return json({
        item,
        ok: !secret.error,
        present: secret.present,
        ...(secret.error ? { errorClass: "env_error" } : {}),
      });
    }
    case "llm":
      return await checkLlm();
    case "delay": {
      const ms = Math.min(
        Math.max(Number(url.searchParams.get("ms")) || 0, 0),
        120_000,
      );
      await new Promise((resolve) => setTimeout(resolve, ms));
      return json({ item, ok: true, waitedMs: ms });
    }
    case "body": {
      if (request.method !== "POST") {
        return json({ item, ok: false, errorClass: "method" }, 405);
      }
      const declared = Number(request.headers.get("content-length") ?? 0);
      if (declared > BODY_CAP) {
        return json({ item, ok: false, errorClass: "too_large" }, 413);
      }
      const buf = await request.arrayBuffer();
      return json({ item, ok: true, bytes: buf.byteLength });
    }
    case "ip": {
      const xff = request.headers.get("x-forwarded-for") ?? "";
      const realIp = request.headers.get("x-real-ip") ?? "";
      const firstHop = xff.split(",")[0]?.trim() ?? "";
      return json({
        item,
        ok: true,
        xff: xff.length > 0,
        realIp: realIp.length > 0,
        publicLike: isPublicIp(firstHop) || isPublicIp(realIp),
      });
    }
    case "kv":
      return await checkKv();
    default:
      return json({ item, ok: false, errorClass: "unknown_item" }, 400);
  }
}

export async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/check")) {
    if (url.searchParams.get("k") !== PROBE_NONCE) {
      return json({ ok: false, errorClass: "forbidden" }, 403);
    }
    const item = url.searchParams.get("item") ?? "";
    return await check(request, item);
  }

  const headers = NO_STORE;
  if (request.method !== "GET") {
    return Response.json(
      { ok: false, error: "method_not_allowed" },
      { status: 405, headers: { ...headers, Allow: "GET" } },
    );
  }
  const name = url.searchParams.get("name")?.trim() ?? "Visitor";
  if (!name || name.length > 80) {
    return Response.json({ ok: false, error: "invalid_name" }, { status: 400, headers });
  }
  return Response.json({ ok: true, message: `Hello, ${name}!` }, { headers });
}