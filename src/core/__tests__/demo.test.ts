import { describe, expect, it } from "vitest";
import { chunk } from "../chunk";
import { demoContract } from "../examples/demo";
import { runRegex } from "../regex";
import { rules } from "../rules";
import { rulesForScene } from "../scene";
import type { ContractDoc } from "../types";

// 高命中演示合同 = 真实案例脱敏版（2026-11-18 天赐指令）。
// 需求硬线：至少 5 处明确风险点，且类型多样（没收/偏高/缺失/预付不退/中介收款）。
function hitIds(text: string): string[] {
  const doc: ContractDoc = { type: "rent", text, blocks: chunk(text), source: "example" };
  return runRegex(rulesForScene(rules, "rent"), doc).map((f) => f.ruleId);
}

describe("高命中演示合同（真实案例脱敏版）", () => {
  const ids = hitIds(demoContract.text);

  it("命中不少于 5 处", () => {
    expect(ids.length).toBeGreaterThanOrEqual(5);
  });

  it("覆盖五类预期风险点", () => {
    expect(ids).toContain("rent-deposit-forfeit");
    expect(ids).toContain("rent-penalty-high");
    expect(ids).toContain("rent-missing-deposit-return");
    expect(ids).toContain("rent-agent-collects-rent");
    expect(ids).toContain("common-prepaid-no-refund");
  });

  it("概览卡所需数值可被本地提取", async () => {
    const { extractAmounts } = await import("../redact");
    const a = extractAmounts(demoContract.text);
    expect(a.monthlyRent).toBe(500);
    expect(a.deposit).toBe(500);
    expect(a.termMonths).toBe(12);
    expect(a.penalty).toBe(1000);
  });

  it("不含禁用词表述", () => {
    const banned = ["违法", "无效", "可起诉", "一定", "肯定", "必然", "安全", "放心签", "保证", "承诺", "没问题"];
    for (const w of banned) expect(demoContract.text).not.toContain(w);
  });
});
