import { describe, expect, it } from "vitest";
import { chunk } from "../chunk";
import { examples } from "../examples";
import { runRegex } from "../regex";
import { rules } from "../rules";
import { rulesForScene } from "../scene";
import type { ContractDoc, ContractType } from "../types";

function makeDoc(text: string, type: ContractType): ContractDoc {
  return { type, text, blocks: chunk(text), source: "example" };
}

function ids(findings: { ruleId: string }[]): string[] {
  return findings.map((f) => f.ruleId);
}

describe("regex 兜底匹配", () => {
  it("租房示例：命中押金没收与违约金偏高，不触发押金退还缺失", () => {
    const ex = examples.find((e) => e.id === "ex-rent")!;
    const doc = makeDoc(ex.text, "rent");
    const findings = runRegex(rulesForScene(rules, "rent"), doc);
    const ruleIds = ids(findings);
    expect(ruleIds).toContain("rent-deposit-forfeit");
    expect(ruleIds).toContain("rent-penalty-high");
    expect(ruleIds).not.toContain("rent-missing-deposit-return");
    const deposit = findings.find((f) => f.ruleId === "rent-deposit-forfeit")!;
    expect(deposit.kind).toBe("exist");
    expect(deposit.blockId).not.toBeNull();
    expect(deposit.severity).toBe("high");
  });

  it("实习示例：命中试用期无薪与单方解除，不套用租房规则", () => {
    const ex = examples.find((e) => e.id === "ex-intern")!;
    const doc = makeDoc(ex.text, "internship");
    const findings = runRegex(rulesForScene(rules, "internship"), doc);
    const ruleIds = ids(findings);
    expect(ruleIds).toContain("intern-unpaid-probation");
    expect(ruleIds).toContain("common-unilateral-terminate");
    expect(ruleIds.some((id) => id.startsWith("rent-"))).toBe(false);
  });

  it("通用清洁示例：零命中", () => {
    const ex = examples.find((e) => e.id === "ex-clean")!;
    const doc = makeDoc(ex.text, "other");
    const findings = runRegex(rulesForScene(rules, "other"), doc);
    expect(findings).toEqual([]);
  });

  it("缺失性检查本地确定性执行：无押金退还表述 → absent，blockId 为 null", () => {
    const text = "房屋租赁合同\n第一条 租金\n月租金3000元。\n第二条 期限\n租期12个月。";
    const doc = makeDoc(text, "rent");
    const findings = runRegex(rulesForScene(rules, "rent"), doc);
    const absent = findings.find((f) => f.ruleId === "rent-missing-deposit-return");
    expect(absent).toBeDefined();
    expect(absent!.kind).toBe("absent");
    expect(absent!.blockId).toBeNull();
  });

  it("命中句区间落在对应块内", () => {
    const ex = examples.find((e) => e.id === "ex-rent")!;
    const doc = makeDoc(ex.text, "rent");
    const findings = runRegex(rulesForScene(rules, "rent"), doc);
    for (const f of findings) {
      if (f.kind !== "exist" || f.matchStart === undefined) continue;
      const block = doc.blocks.find((b) => b.id === f.blockId)!;
      expect(f.matchStart).toBeGreaterThanOrEqual(block.start);
      expect(f.matchEnd).toBeLessThanOrEqual(block.end);
    }
  });
});