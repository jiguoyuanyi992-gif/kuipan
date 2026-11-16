import { describe, expect, it } from "vitest";
import { createRateLimiter, ipFromHeaders } from "../../../functions/limiter";

describe("每 IP 每分钟 N 次内存限流（尽力而为）", () => {
  it("窗口内放行 N 次、第 N+1 次拒绝", () => {
    const l = createRateLimiter(10);
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) expect(l.allow("1.2.3.4", t0 + i)).toBe(true);
    expect(l.allow("1.2.3.4", t0 + 10)).toBe(false);
  });

  it("不同 IP 互不影响", () => {
    const l = createRateLimiter(1);
    expect(l.allow("1.1.1.1", 0)).toBe(true);
    expect(l.allow("2.2.2.2", 0)).toBe(true);
    expect(l.allow("1.1.1.1", 1)).toBe(false);
  });

  it("滑窗过期后恢复", () => {
    const l = createRateLimiter(2);
    expect(l.allow("x", 0)).toBe(true);
    expect(l.allow("x", 1000)).toBe(true);
    expect(l.allow("x", 1500)).toBe(false); // 窗口内已满
    // now=61000 → cutoff=1000，t>1000 的只剩 1500? 1500 那次被拒不计入 → 只剩 1000（被裁掉）→ 全空
    expect(l.allow("x", 61_000)).toBe(true);
  });
});

describe("ipFromHeaders", () => {
  it("x-forwarded-for 首跳优先", () => {
    const h = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" });
    expect(ipFromHeaders(h)).toBe("9.9.9.9");
  });

  it("退到 x-real-ip，再退到 unknown", () => {
    expect(ipFromHeaders(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(ipFromHeaders(new Headers())).toBe("unknown");
  });
});
