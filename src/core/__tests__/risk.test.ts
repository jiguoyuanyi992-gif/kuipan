import { describe, expect, it } from "vitest";
import { NONE_META, overallRisk, SEVERITY_META } from "../risk";
import type { Finding, Severity } from "../types";

function f(severity: Severity, title: string): Finding {
  return {
    ruleId: "r",
    blockId: "b1",
    kind: "exist",
    severity,
    title,
    explanation: "存在风险，建议留意。",
    askTalk: "问一问",
    aiSuggested: false,
    legalBasis: [],
    verified: false,
  };
}

describe("总体风险三档", () => {
  it("存在 high → 需重点留意", () => {
    const r = overallRisk([f("high", "押金可能被没收"), f("medium", "违约金偏高")]);
    expect(r.level).toBe("high");
    expect(r.label).toBe("需重点留意");
    expect(r.reason).toContain("需重点留意");
    expect(r.reason).toContain("押金可能被没收");
  });

  it("最高 medium → 建议留意", () => {
    const r = overallRisk([f("medium", "违约金偏高")]);
    expect(r.label).toBe("建议留意");
  });

  it("最高 low → 建议留意", () => {
    const r = overallRisk([f("low", "可留意事项")]);
    expect(r.label).toBe("建议留意");
    expect(r.level).toBe("low");
  });

  it("零命中 → 暂未发现明显风险", () => {
    const r = overallRisk([]);
    expect(r.level).toBe("none");
    expect(r.label).toBe("暂未发现明显风险");
  });

  it("档位名与理由句不得出现「安全」", () => {
    for (const findings of [[], [f("high", "x")], [f("medium", "y")], [f("low", "z")]]) {
      const r = overallRisk(findings);
      expect(r.label).not.toContain("安全");
      expect(r.reason).not.toContain("安全");
    }
  });

  it("每档具备图标 + 文字", () => {
    expect(SEVERITY_META.high.icon).toBeTruthy();
    expect(SEVERITY_META.high.label).toBe("需重点留意");
    expect(SEVERITY_META.medium.label).toBe("建议留意");
    expect(SEVERITY_META.low.label).toBe("可留意");
    expect(NONE_META.icon).toBe("✓");
  });
});