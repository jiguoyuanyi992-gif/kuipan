import { describe, expect, it } from "vitest";
import { chunk } from "../chunk";
import { examples } from "../examples";
import { runRegex } from "../regex";
import { rules } from "../rules";
import { detectType, rulesForScene } from "../scene";
import type { ContractDoc } from "../types";

function hits(text: string): string[] {
  const doc: ContractDoc = { type: "insurance", text, blocks: chunk(text), source: "paste" };
  return runRegex(rulesForScene(rules, "insurance"), doc).map((f) => f.ruleId);
}

const CASES: { id: string; positives: string[]; negative: string }[] = [
  {
    id: "insurance-exempt-hidden",
    positives: [
      "投保人已阅读并理解全部条款。",
      "勾选投保即视为知悉并同意全部条款内容。",
      "责任免除条款投保时不再单独提示。",
    ],
    negative: "保险人在投保单上对免责条款加粗提示，并逐条向投保人说明。",
  },
  {
    id: "insurance-waiting-deductible",
    positives: [
      "等待期内确诊疾病的，不承担给付责任。",
      "每次事故免赔额为10000元。",
      "等待期与免赔额详见保险条款附件。",
    ],
    negative: "本合同无等待期，医疗费用按约定比例赔付，无免赔额。",
  },
  {
    id: "insurance-default-bundled",
    positives: [
      "办理借款时默认勾选投保本保险。",
      "本保险在投保页面默认勾选。",
      "保险保费计入每月分期还款。",
    ],
    negative: "投保人可自愿选择是否投保，保险不与借款捆绑。",
  },
  {
    // 缺失性规则：保险文本通篇未提犹豫期/冷静期才命中。
    id: "insurance-hesitation-missing",
    positives: [
      "本合同自投保人缴纳保费时成立，保险人按约定承担保险责任。",
      "投保人解除合同的，保险人退还保险单的现金价值。",
      "保险期间一年，期满双方可协商续保。",
    ],
    negative: "投保人自签收保单之日起15日为犹豫期，犹豫期内退保全额退还保费。",
  },
  {
    id: "insurance-surrender-loss",
    positives: [
      "投保人退保的，保险人仅退还保险单的现金价值。",
      "保单早期现金价值远低于已交保费。",
      "犹豫期后退保的，按现金价值退还。",
    ],
    negative: "犹豫期内退保的，保险人全额退还已交保费。",
  },
];

describe("保险专属规则命中与反例", () => {
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

  it("ex-insurance 示例：类型判 insurance，专属命中 ≥2", () => {
    const ex = examples.find((e) => e.id === "ex-insurance")!;
    expect(ex.fabricated).toBe(true);
    expect(detectType(ex.text)).toBe("insurance");
    const doc: ContractDoc = {
      type: "insurance",
      text: ex.text,
      blocks: chunk(ex.text),
      source: "example",
    };
    const found = runRegex(rulesForScene(rules, "insurance"), doc).map((f) => f.ruleId);
    const dedicated = found.filter((id) => id.startsWith("insurance-"));
    expect(dedicated.length).toBeGreaterThanOrEqual(2);
    expect(dedicated).toContain("insurance-exempt-hidden");
    expect(dedicated).toContain("insurance-hesitation-missing");
  });
});