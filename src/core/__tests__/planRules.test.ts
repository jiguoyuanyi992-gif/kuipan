import { describe, expect, it } from "vitest";
import { chunk } from "../chunk";
import { examples } from "../examples";
import { runRegex } from "../regex";
import { rules } from "../rules";
import { detectType, rulesForScene } from "../scene";
import type { ContractDoc } from "../types";

function hits(text: string): string[] {
  const doc: ContractDoc = { type: "plan", text, blocks: chunk(text), source: "paste" };
  return runRegex(rulesForScene(rules, "plan"), doc).map((f) => f.ruleId);
}

const CASES: { id: string; positives: string[]; negative: string }[] = [
  {
    id: "plan-auto-restore-price",
    positives: [
      "首月优惠价1元，优惠结束后自动恢复至原价39元。",
      "低价体验期到期后，自动续订并按标准资费扣费。",
      "优惠结束后自动按原价续订。",
    ],
    negative: "套餐到期后，双方可按届时公示资费协商续订。",
  },
  {
    id: "plan-lock-downgrade",
    positives: [
      "合约期内乙方不得降档或销户。",
      "提前销户的，按三个月月费支付违约金。",
      "合约期内提前终止的，应当支付赔偿金。",
    ],
    negative: "合约期满后，乙方可自由选择续约或销户。",
  },
  {
    id: "plan-gift-to-paid",
    positives: [
      "赠送的会员到期自动转为收费订阅。",
      "免费试用结束后自动扣费。",
      "到期未取消的，视为同意续费。",
    ],
    negative: "赠送服务到期后自动终止，不再产生费用。",
  },
  {
    id: "plan-unlimited-throttle",
    positives: [
      "不限量流量套餐，超出20GB后限速。",
      "宣传不限量，实际却限速。",
      "达量后降至1Mbps。",
    ],
    negative: "套餐含30GB流量，超出后可按公示资费叠加购买流量包。",
  },
  {
    id: "plan-default-addon",
    positives: [
      "开通即视为同意默认开通彩铃增值业务。",
      "增值业务默认开通，月费5元。",
      "办理套餐时默认勾选视频会员附加服务。",
    ],
    negative: "乙方可自愿选择是否开通增值业务，未选择的不收费。",
  },
];

describe("套餐专属规则命中与反例", () => {
  for (const c of CASES) {
    it(`${c.id}：常见表述命中`, () => {
      for (const text of c.positives) {
        expect(hits(text)).toContain(c.id);
      }
    });
    it(`${c.id}：不该命中的表述不命中`, () => {
      expect(hits(c.negative)).not.toContain(c.id);
    });
  }

  it("ex-plan 示例：类型判 plan，专属命中 ≥2", () => {
    const ex = examples.find((e) => e.id === "ex-plan")!;
    expect(ex.fabricated).toBe(true);
    expect(detectType(ex.text)).toBe("plan");
    const doc: ContractDoc = {
      type: "plan",
      text: ex.text,
      blocks: chunk(ex.text),
      source: "example",
    };
    const found = runRegex(rulesForScene(rules, "plan"), doc).map((f) => f.ruleId);
    const dedicated = found.filter((id) => id.startsWith("plan-"));
    expect(dedicated.length).toBeGreaterThanOrEqual(2);
    expect(dedicated).toContain("plan-lock-downgrade");
    expect(dedicated).toContain("plan-unlimited-throttle");
  });
});