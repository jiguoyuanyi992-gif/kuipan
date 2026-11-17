import { describe, expect, it } from "vitest";
import { chunk } from "../chunk";
import { examples } from "../examples";
import { runRegex } from "../regex";
import { rules } from "../rules";
import { detectType, rulesForScene } from "../scene";
import type { ContractDoc } from "../types";

function hits(text: string): string[] {
  const doc: ContractDoc = { type: "carrental", text, blocks: chunk(text), source: "paste" };
  return runRegex(rulesForScene(rules, "carrental"), doc).map((f) => f.ruleId);
}

const CASES: { id: string; positives: string[]; negative: string }[] = [
  {
    id: "carrental-check-dispute",
    positives: [
      "车辆状况以甲方门店验车记录为准。",
      "乙方取车时未拍照留存的，视为认可车辆完好。",
      "还车验车由门店单方确认，乙方不得异议。",
    ],
    negative: "取车时双方共同验车并拍照，已有划痕记入交接单。",
  },
  {
    id: "carrental-loss-fee",
    positives: [
      "车辆维修期间的停运损失由乙方承担。",
      "事故造成的折旧费、贬值费由乙方另行支付。",
      "维修定损以甲方指定的维修厂评估为准。",
    ],
    negative: "车损赔偿按双方共同确认的定损单结算，不收其他费用。",
  },
  {
    id: "carrental-deposit-missing",
    positives: [
      "取车时缴纳押金5000元，另收违章押金2000元。",
      "乙方缴纳押金3000元，租期3天，租金每日300元。",
      "押金于取车时一次性收取，违章押金另行收取。",
    ],
    negative: "还车后无违章的，甲方于7日内退还押金。",
  },
  {
    id: "carrental-insurance-gap",
    positives: [
      "本车仅投保交强险。",
      "车损免赔额为2000元，由乙方自理。",
      "保险理赔不足部分的费用由乙方自行承担。",
    ],
    negative: "本车已投保交强险、车损险与三者险，免赔部分由甲方承担。",
  },
  {
    id: "carrental-fee-unclear",
    positives: [
      "超时、超里程、异地还车费用另计，按甲方门店标准收取。",
      "超时费按门店规定另行收取。",
      "异地还车费不含在租金内，另行结算。",
    ],
    negative: "超时每小时50元、超里程每公里2元、异地还车300元，均已列明。",
  },
];

describe("租车专属规则命中与反例", () => {
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

  it("ex-carrental 示例：类型判 carrental，专属命中 ≥2", () => {
    const ex = examples.find((e) => e.id === "ex-carrental")!;
    expect(ex.fabricated).toBe(true);
    expect(detectType(ex.text)).toBe("carrental");
    const doc: ContractDoc = {
      type: "carrental",
      text: ex.text,
      blocks: chunk(ex.text),
      source: "example",
    };
    const found = runRegex(rulesForScene(rules, "carrental"), doc).map((f) => f.ruleId);
    const dedicated = found.filter((id) => id.startsWith("carrental-"));
    expect(dedicated.length).toBeGreaterThanOrEqual(2);
    expect(dedicated).toContain("carrental-check-dispute");
    expect(dedicated).toContain("carrental-insurance-gap");
    expect(dedicated).toContain("carrental-deposit-missing");
  });
});