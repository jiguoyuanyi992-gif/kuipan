// 实例内存尽力限流：每 IP 每分钟 N 次。冷启动/多实例丢计数为预期行为（策略：尽力而为，不持久化、无每日限额）。
// 纯逻辑、无 Deno API，便于 vitest 直接验证。

export const WINDOW_MS = 60_000;

export interface RateLimiter {
  allow(ip: string, now: number): boolean;
}

export function createRateLimiter(maxPerMinute: number): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    allow(ip: string, now: number): boolean {
      const cutoff = now - WINDOW_MS;
      const recent = (hits.get(ip) ?? []).filter((t) => t > cutoff);
      if (recent.length >= maxPerMinute) {
        hits.set(ip, recent);
        return false;
      }
      recent.push(now);
      hits.set(ip, recent);
      // 机会性清理，防 Map 无界增长。
      if (hits.size > 4096) {
        for (const [k, v] of hits) {
          const kept = v.filter((t) => t > cutoff);
          if (kept.length === 0) hits.delete(k);
          else hits.set(k, kept);
        }
      }
      return true;
    },
  };
}

// 取调用方 IP：x-forwarded-for 首跳优先，其次 x-real-ip；拿不到记 "unknown"（全局限）。
export function ipFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  return "unknown";
}
