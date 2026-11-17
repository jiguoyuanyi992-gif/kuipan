import { describe, expect, it } from "vitest";
import { examples } from "../examples";
import { LEGAL_BASIS_SOURCE } from "../legalSource";
import { rules } from "../rules";
import { detectType, rulesForScene, scenesFor } from "../scene";

describe("规则库与场景", () => {
  it("M4 交付真实规则库", () => {
    expect(rules.length).toBeGreaterThanOrEqual(12);
  });

  it("场景分布满足租房 6 / 实习兼职 5 / 贷款分期 5 / 套餐 5 / 考证 5 / 通用 9", () => {
    const count = (scene: string) => rules.filter((r) => r.scene === scene).length;
    expect(count("rent")).toBe(6);
    expect(count("internship")).toBe(5);
    expect(count("loan")).toBe(5);
    expect(count("plan")).toBe(5);
    expect(count("cert")).toBe(5);
    expect(count("common")).toBe(9);
  });

  it("verified 置真必须登记授权/复核记录与核对底本", () => {
    for (const r of rules) {
      if (!r.verified) continue;
      expect(r.reviewer).toBeTruthy();
      expect(r.reviewNote).toBeTruthy();
    }
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

  it("每条规则至少一条法律依据，来源为权威站点，引用为原文", () => {
    for (const r of rules) {
      expect(r.legalBasis.length).toBeGreaterThan(0);
      for (const b of r.legalBasis) {
        expect(b.law).toBeTruthy();
        expect(b.article).toBeTruthy();
        expect(b.quote.length).toBeGreaterThan(8);
        // 逐字原文：禁省略号；「等」只允许法条枚举用法（等事项/等方式），禁句末省略。
        expect(b.quote).not.toMatch(/……|…|\.\.\./);
        expect(b.quote).not.toMatch(/等([。；！？，、]|$)/);
        expect(b.source).toBe(LEGAL_BASIS_SOURCE);
        if (b.sourceUrl) expect(b.sourceUrl.startsWith("https://flk.npc.gov.cn/")).toBe(true);
        // 新通用规则可以没有转载链接；有才校验域名。
        if (b.reprintUrl) expect(b.reprintUrl).toMatch(/^https?:\/\/[^/]*(gov\.cn|moe\.edu\.cn)/);
      }
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
    expect(detectType(examples.find((e) => e.id === "ex-loan")!.text)).toBe("loan");
    expect(detectType(examples.find((e) => e.id === "ex-plan")!.text)).toBe("plan");
    expect(detectType(examples.find((e) => e.id === "ex-cert")!.text)).toBe("cert");
    expect(detectType(examples.find((e) => e.id === "ex-clean")!.text)).toBe("other");
  });
});