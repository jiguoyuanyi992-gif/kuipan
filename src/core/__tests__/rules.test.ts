import { describe, expect, it } from "vitest";
import { examples } from "../examples";
import { rules } from "../rules";
import { detectType, rulesForScene, scenesFor } from "../scene";

describe("规则库与场景", () => {
  it("M1 交付 5 条假规则", () => {
    expect(rules).toHaveLength(5);
  });

  it("verified 默认 false，执行层无置真路径", () => {
    expect(rules.every((r) => r.verified === false)).toBe(true);
  });

  it("每条规则字段完整", () => {
    for (const r of rules) {
      expect(r.id).toBeTruthy();
      expect(r.title).toBeTruthy();
      expect(["high", "medium", "low"]).toContain(r.severity);
      expect(Array.isArray(r.traits)).toBe(true);
      expect(Array.isArray(r.legalBasis)).toBe(true);
      expect(typeof r.why).toBe("string");
      expect(typeof r.askTalk).toBe("string");
    }
  });

  it("场景子集裁剪：其他走通用规则集", () => {
    expect(scenesFor("rent")).toEqual(["rent", "common"]);
    expect(scenesFor("internship")).toEqual(["internship", "common"]);
    expect(scenesFor("other")).toEqual(["common"]);
    const other = rulesForScene(rules, "other");
    expect(other.every((r) => r.scene === "common")).toBe(true);
  });

  it("本地类型判定兜底", () => {
    expect(detectType(examples.find((e) => e.id === "ex-rent")!.text)).toBe("rent");
    expect(detectType(examples.find((e) => e.id === "ex-intern")!.text)).toBe("internship");
    expect(detectType(examples.find((e) => e.id === "ex-clean")!.text)).toBe("other");
  });
});