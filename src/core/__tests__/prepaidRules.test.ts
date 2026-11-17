import { describe, expect, it } from "vitest";
import { chunk } from "../chunk";
import { examples } from "../examples";
import { runRegex } from "../regex";
import { rules } from "../rules";
import { detectType, rulesForScene } from "../scene";
import type { ContractDoc } from "../types";

function hits(text: string): string[] {
  const doc: ContractDoc = { type: "prepaid", text, blocks: chunk(text), source: "paste" };
  return runRegex(rulesForScene(rules, "prepaid"), doc).map((f) => f.ruleId);
}

const CASES: { id: string; positives: string[]; negative: string }[] = [
  {
    id: "prepaid-no-refund",
    positives: [
      "退卡须扣除百分之三十的手续费。",
      "会员卡一经售出，概不退还。",
      "退卡只退余额的一半。",
    ],
    negative: "乙方要求退卡的，甲方按未消费余额全额退还。",
  },
  {
    id: "prepaid-shop-closure",
    positives: [
      "门店转让的，卡内余额不予退还。",
      "甲方有权随时停业。",
      "本店搬迁恕不另行通知。",
    ],
    negative: "甲方停业或迁移的，提前30日公告并退还未消费余额。",
  },
  {
    id: "prepaid-gift-expire",
    positives: [
      "赠送课时到期作废。",
      "附赠项目有效期届满失效。",
      "赠课过期清零。",
    ],
    negative: "赠送课时与主卡有效期一致，到期前可协商延期。",
  },
  {
    id: "prepaid-transfer-restrict",
    positives: [
      "本卡不得转让。",
      "转让须收取手续费200元。",
      "转卡须经甲方同意。",
    ],
    negative: "卡内余额可无偿转给亲友使用。",
  },
  {
    id: "prepaid-term-unclear",
    positives: [
      "课时有效期以甲方系统记录为准。",
      "疗程过期作废，费用不退。",
      "甲方有权调整有效期。",
    ],
    negative: "课时有效期两年，自开卡之日起算，到期前甲方提醒乙方续期。",
  },
];

describe("预付卡专属规则命中与反例", () => {
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

  it("ex-prepaid 示例：类型判 prepaid，专属命中 ≥2", () => {
    const ex = examples.find((e) => e.id === "ex-prepaid")!;
    expect(ex.fabricated).toBe(true);
    expect(detectType(ex.text)).toBe("prepaid");
    const doc: ContractDoc = {
      type: "prepaid",
      text: ex.text,
      blocks: chunk(ex.text),
      source: "example",
    };
    const found = runRegex(rulesForScene(rules, "prepaid"), doc).map((f) => f.ruleId);
    const dedicated = found.filter((id) => id.startsWith("prepaid-"));
    expect(dedicated.length).toBeGreaterThanOrEqual(2);
    expect(dedicated).toContain("prepaid-no-refund");
    expect(dedicated).toContain("prepaid-shop-closure");
  });
});