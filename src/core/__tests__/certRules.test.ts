import { describe, expect, it } from "vitest";
import { chunk } from "../chunk";
import { examples } from "../examples";
import { runRegex } from "../regex";
import { rules } from "../rules";
import { detectType, rulesForScene } from "../scene";
import type { ContractDoc } from "../types";

function hits(text: string): string[] {
  const doc: ContractDoc = { type: "cert", text, blocks: chunk(text), source: "paste" };
  return runRegex(rulesForScene(rules, "cert"), doc).map((f) => f.ruleId);
}

const CASES: { id: string; positives: string[]; negative: string }[] = [
  {
    id: "cert-pass-guarantee",
    positives: [
      "本课程包过，不过全退。",
      "未通过考试的全额退款。",
      "退费仅限出勤率达标且完成全部作业的学员。",
    ],
    negative: "甲方如实介绍考试难度与历年通过率。",
  },
  {
    id: "cert-narrow-refund",
    positives: [
      "退课的，已上课时按每小时300元折算扣除。",
      "退款只退一半，另一半抵扣已发教材。",
      "退费按已消费课时折算。",
    ],
    negative: "乙方退课的，甲方按未上课时比例退还费用。",
  },
  {
    id: "cert-hidden-fees",
    positives: [
      "学费不含报名费与教材费。",
      "考试费、资料费另收。",
      "报名费用另行缴纳。",
    ],
    negative: "学费已包含报名、教材与考试全部费用，无其他收费。",
  },
  {
    id: "cert-unilateral-change",
    positives: [
      "甲方有权单方更换授课教师。",
      "甲方调整课表恕不另行通知。",
      "师资以甲方实际调配为准。",
    ],
    negative: "更换教师或调整课表的，双方协商一致后书面确认。",
  },
  {
    id: "cert-pay-waive-refund",
    positives: [
      "缴费即视为放弃退费权利。",
      "课程一经售出，概不退费。",
      "学费缴纳后不予退还。",
    ],
    negative: "乙方可在开课前申请全额退费。",
  },
];

describe("考证专属规则命中与反例", () => {
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

  it("ex-cert 示例：类型判 cert，专属命中 ≥2", () => {
    const ex = examples.find((e) => e.id === "ex-cert")!;
    expect(ex.fabricated).toBe(true);
    expect(detectType(ex.text)).toBe("cert");
    const doc: ContractDoc = {
      type: "cert",
      text: ex.text,
      blocks: chunk(ex.text),
      source: "example",
    };
    const found = runRegex(rulesForScene(rules, "cert"), doc).map((f) => f.ruleId);
    const dedicated = found.filter((id) => id.startsWith("cert-"));
    expect(dedicated.length).toBeGreaterThanOrEqual(2);
    expect(dedicated).toContain("cert-pass-guarantee");
    expect(dedicated).toContain("cert-hidden-fees");
  });
});