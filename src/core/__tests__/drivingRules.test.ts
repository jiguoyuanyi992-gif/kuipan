import { describe, expect, it } from "vitest";
import { chunk } from "../chunk";
import { examples } from "../examples";
import { runRegex } from "../regex";
import { rules } from "../rules";
import { detectType, rulesForScene } from "../scene";
import type { ContractDoc } from "../types";

function hits(text: string): string[] {
  const doc: ContractDoc = { type: "driving", text, blocks: chunk(text), source: "paste" };
  return runRegex(rulesForScene(rules, "driving"), doc).map((f) => f.ruleId);
}

const CASES: { id: string; positives: string[]; negative: string }[] = [
  {
    id: "driving-hidden-fees",
    positives: [
      "补考费、模拟费另收。",
      "补考费与模拟费不含在学费内。",
      "考场模拟费用另行缴纳。",
    ],
    negative: "培训费已包含补考、模拟与陪练全部费用，无其他收费。",
  },
  {
    id: "driving-narrow-refund",
    positives: [
      "退学的，扣除百分之三十管理费后退还剩余费用。",
      "报名后概不退费。",
      "退费按已培训学时折算扣除。",
    ],
    negative: "乙方退学的，甲方按未培训学时比例退还费用。",
  },
  {
    id: "driving-term-missing",
    positives: [
      "甲方为乙方提供C1驾驶证培训，培训费3800元。",
      "乙方报名学车，练车由教练安排。",
      "本合同自缴费时生效，培训安排以甲方通知为准。",
    ],
    negative: "培训期限36个月，自报名之日起算。",
  },
  {
    id: "driving-booking-unilateral",
    positives: [
      "练车预约与排课以甲方安排为准。",
      "甲方有权调整已预约的练车时段。",
      "约车以驾校系统记录为准。",
    ],
    negative: "练车时间由双方协商确定，提前一天预约即可。",
  },
  {
    id: "driving-site-change",
    positives: [
      "训练场地甲方有权调整，乙方应予配合。",
      "甲方有权根据经营情况单方变更训练场地。",
      "训练场地以驾校实际安排为准。",
    ],
    negative: "训练场地变更须经双方协商一致并书面确认。",
  },
];

describe("驾校专属规则命中与反例", () => {
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

  it("ex-driving 示例：类型判 driving，专属命中 ≥2", () => {
    const ex = examples.find((e) => e.id === "ex-driving")!;
    expect(ex.fabricated).toBe(true);
    expect(detectType(ex.text)).toBe("driving");
    const doc: ContractDoc = {
      type: "driving",
      text: ex.text,
      blocks: chunk(ex.text),
      source: "example",
    };
    const found = runRegex(rulesForScene(rules, "driving"), doc).map((f) => f.ruleId);
    const dedicated = found.filter((id) => id.startsWith("driving-"));
    expect(dedicated.length).toBeGreaterThanOrEqual(2);
    expect(dedicated).toContain("driving-hidden-fees");
    expect(dedicated).toContain("driving-narrow-refund");
    expect(dedicated).toContain("driving-term-missing");
  });
});