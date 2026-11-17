import { describe, expect, it } from "vitest";
import { chunk } from "../chunk";
import { examples } from "../examples";
import { runRegex } from "../regex";
import { rules } from "../rules";
import { detectType, rulesForScene } from "../scene";
import type { ContractDoc } from "../types";

function hits(text: string): string[] {
  const doc: ContractDoc = { type: "loan", text, blocks: chunk(text), source: "paste" };
  return runRegex(rulesForScene(rules, "loan"), doc).map((f) => f.ruleId);
}

const CASES: { id: string; positives: string[]; negative: string }[] = [
  {
    id: "loan-required-loan",
    positives: [
      "乙方入职前须先办理培训贷款，未办理的不予录用。",
      "报名本课程需通过培训贷支付培训费。",
      "办理分期作为录用的前提条件。",
    ],
    negative: "乙方可自愿选择是否办理分期，不办理不影响报名。",
  },
  {
    id: "loan-upfront-interest",
    positives: [
      "本合同项下借款收取砍头息。",
      "服务费、担保费在放款时预先扣除。",
      "甲方放款时扣收首期利息与手续费。",
    ],
    negative: "甲方按合同约定足额放款，利息自到账之日起按实际借款数额计算。",
  },
  {
    id: "loan-hidden-rate",
    positives: [
      "日息低至0.02%，轻松借款无压力。",
      "每天只需一杯奶茶钱即可借款。",
      "综合年化利率以平台页面展示为准。",
    ],
    negative: "借款年利率为百分之六，利息与全部费用已在合同中列明。",
  },
  {
    id: "loan-prepay-penalty",
    positives: [
      "乙方提前还款的，按剩余本金百分之三支付违约金。",
      "提前结清需缴纳剩余期数的手续费。",
      "提前还款的，利息仍按原定期数全额计算。",
    ],
    negative: "乙方提前返还借款的，按照实际借款期间计算利息，不另收费用。",
  },
  {
    id: "loan-refund-loan-survives",
    positives: [
      "培训协议解除后，借款合同继续有效，乙方照常还款。",
      "借款分期不因乙方退课、退费而解除。",
      "乙方退费的，还款义务不免除。",
    ],
    negative: "培训协议解除的，借款合同同步解除，已还款项按实际借款期间结算退回。",
  },
];

describe("贷款分期专属规则命中与反例", () => {
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

  it("ex-loan 示例：类型判 loan，专属命中 ≥2", () => {
    const ex = examples.find((e) => e.id === "ex-loan")!;
    expect(ex.fabricated).toBe(true);
    expect(ex.label).toBeTruthy();
    expect(detectType(ex.text)).toBe("loan");
    const doc: ContractDoc = {
      type: "loan",
      text: ex.text,
      blocks: chunk(ex.text),
      source: "example",
    };
    const found = runRegex(rulesForScene(rules, "loan"), doc).map((f) => f.ruleId);
    const dedicated = found.filter((id) => id.startsWith("loan-"));
    expect(dedicated.length).toBeGreaterThanOrEqual(2);
    expect(dedicated).toContain("loan-required-loan");
    expect(dedicated).toContain("loan-upfront-interest");
  });
});