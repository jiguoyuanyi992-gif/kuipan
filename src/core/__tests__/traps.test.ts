import { describe, expect, it } from "vitest";
import { LEGAL_BASIS_SOURCE } from "../legalSource";
import { rules } from "../rules";
import {
  CATEGORY_LABEL,
  checklists,
  ruleIdForTrap,
  searchTraps,
  trapCategory,
  traps,
  trapsByCategory,
  trapsForRuleId,
} from "../traps";

describe("陷阱库数据契约", () => {
  it("最低交付量：租房 6 + 实习兼职 4 + 贷款分期 4 + 套餐 2 + 考证 2 + 保险 2 + 预付卡 2 + 租车 2", () => {
    expect(trapsByCategory("rent")).toHaveLength(6);
    expect(trapsByCategory("internship")).toHaveLength(4);
    expect(trapsByCategory("loan")).toHaveLength(4);
    expect(trapsByCategory("plan")).toHaveLength(2);
    expect(trapsByCategory("cert")).toHaveLength(2);
    expect(trapsByCategory("insurance")).toHaveLength(2);
    expect(trapsByCategory("prepaid")).toHaveLength(2);
    expect(trapsByCategory("carrental")).toHaveLength(2);
    expect(traps.length).toBeGreaterThanOrEqual(24);
  });

  it("verified 置真必须登记授权/复核记录与核对底本", () => {
    for (const t of traps) {
      if (!t.verified) continue;
      expect(t.reviewer).toBeTruthy();
      expect(t.reviewNote).toBeTruthy();
    }
  });

  it("每条字段完整：一句话概括、识别特征、签约前要问、被坑后怎么办、依据", () => {
    for (const t of traps) {
      expect(t.id).toMatch(/^trap-/);
      expect(["rent", "internship", "loan", "plan", "cert", "insurance", "prepaid", "carrental", "common"]).toContain(t.scene);
      expect(t.oneLiner.length).toBeGreaterThan(6);
      expect(t.traits.length).toBeGreaterThanOrEqual(2);
      expect(t.beforeSign.length).toBeGreaterThanOrEqual(2);
      expect(t.afterHit.length).toBeGreaterThanOrEqual(2);
      expect(t.legalBasis.length).toBeGreaterThan(0);
      for (const b of t.legalBasis) {
        expect(b.law).toBeTruthy();
        expect(b.article).toBeTruthy();
        expect(b.quote.length).toBeGreaterThan(8);
        // 逐字原文：禁省略号；「等」只允许法条枚举用法（等事项/等方式），禁句末省略。
        expect(b.quote).not.toMatch(/……|…|\.\.\./);
        expect(b.quote).not.toMatch(/等([。；！？，、]|$)/);
        expect(b.source).toBe(LEGAL_BASIS_SOURCE);
        if (b.sourceUrl) expect(b.sourceUrl.startsWith("https://flk.npc.gov.cn/")).toBe(true);
        expect(b.reprintUrl).toMatch(/^https?:\/\/[^/]*gov\.cn/);
      }
    }
  });

  it("story 为空串时前端隐藏该区块，不得编造案例", () => {
    for (const t of traps) {
      expect(typeof t.story).toBe("string");
      if (t.story === "") continue;
      // 有案例必须是脱敏写法：不得出现可识别的手机号或身份证格式。
      expect(t.story).not.toMatch(/1[3-9]\d{9}/);
      expect(t.story).not.toMatch(/\d{17}[\dXx]/);
    }
    expect(traps.every((t) => t.story === "")).toBe(true);
  });

  it("贷款分期：旧 2 条仅浏览不挂规则，新 2 条与专属规则双向关联", () => {
    const browseOnly = ["trap-loan-training-loan", "trap-loan-installment-fees"];
    for (const id of browseOnly) {
      const t = traps.find((x) => x.id === id)!;
      expect(t.scene).toBe("common");
      expect(ruleIdForTrap(t)).toBeUndefined();
    }
    const linked = ["trap-loan-required-loan", "trap-loan-upfront-interest"];
    for (const id of linked) {
      const t = traps.find((x) => x.id === id)!;
      expect(t.scene).toBe("loan");
      const ruleId = ruleIdForTrap(t)!;
      expect(rules.some((r) => r.id === ruleId && r.scene === "loan")).toBe(true);
    }
  });

  it("分类标签齐全", () => {
    expect(Object.keys(CATEGORY_LABEL)).toEqual([
      "rent",
      "internship",
      "loan",
      "plan",
      "cert",
      "insurance",
      "prepaid",
      "carrental",
      "driving",
    ]);
    expect(trapCategory(traps[0])).toBe("rent");
  });

  it("检索按自身字段命中", () => {
    expect(searchTraps("押金").length).toBeGreaterThan(0);
    expect(searchTraps("不存在的那个词xyz")).toHaveLength(0);
    expect(searchTraps("", "loan")).toHaveLength(4);
    expect(searchTraps("", "plan")).toHaveLength(2);
    expect(searchTraps("", "cert")).toHaveLength(2);
    expect(searchTraps("", "insurance")).toHaveLength(2);
    expect(searchTraps("", "prepaid")).toHaveLength(2);
    expect(searchTraps("", "carrental")).toHaveLength(2);
  });
});

describe("签约前检查清单", () => {
  it("各类清单齐全，条目可勾选且 id 唯一", () => {
    expect(checklists.categories.map((c) => c.id)).toEqual([
      "rent",
      "internship",
      "loan",
      "plan",
      "cert",
      "insurance",
      "prepaid",
      "carrental",
    ]);
    for (const c of checklists.categories) {
      expect(c.items.length).toBeGreaterThanOrEqual(6);
      expect(new Set(c.items.map((i) => i.id)).size).toBe(c.items.length);
      expect(c.storageKey).toBe(`qqy:checklist:${c.id}`);
      for (const item of c.items) expect(item.label.length).toBeGreaterThan(6);
    }
  });

  it("清单条目 id 在各清单内全局唯一，避免 localStorage 串档", () => {
    const all = checklists.categories.flatMap((c) => c.items.map((i) => i.id));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("风险详情与陷阱库双向跳转", () => {
  it("规则能跳到同类案例", () => {
    const linked = rules.filter((r) => trapsForRuleId(r.id).length > 0);
    expect(linked.length).toBeGreaterThanOrEqual(8);
  });

  it("陷阱条目能回到合同检查项", () => {
    const checkable = traps.filter((t) => ruleIdForTrap(t));
    expect(checkable.length).toBeGreaterThanOrEqual(8);
    for (const t of checkable) {
      const ruleId = ruleIdForTrap(t)!;
      expect(rules.some((r) => r.id === ruleId)).toBe(true);
    }
  });
});
