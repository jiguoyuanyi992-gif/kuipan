import { describe, expect, it } from "vitest";
import { chunk } from "../chunk";
import { runRegex } from "../regex";
import { rules } from "../rules";
import { rulesForScene } from "../scene";
import type { ContractDoc } from "../types";

function hits(text: string): string[] {
  const doc: ContractDoc = { type: "other", text, blocks: chunk(text), source: "paste" };
  return runRegex(rulesForScene(rules, "other"), doc).map((f) => f.ruleId);
}

const CASES: { id: string; positives: string[]; negative: string }[] = [
  {
    id: "common-auto-renew",
    positives: [
      "本服务到期自动续费，费用从绑定账户扣除。",
      "到期前未取消的，视为默认续订一年。",
      "会员按月自动续约，扣款前不另行通知。",
    ],
    negative: "期限届满后双方协商一致的，可以续签合同。",
  },
  {
    id: "common-prepaid-no-refund",
    positives: [
      "课程费一经缴纳，概不退还。",
      "预付费用不予退款。",
      "缴费后一律不退。",
    ],
    negative: "乙方提前退租的，押金不予退还。",
  },
  {
    id: "common-exempt-liability",
    positives: [
      "甲方对任何损失概不负责。",
      "一切后果由乙方自负。",
      "甲方免除赔偿责任。",
    ],
    negative: "双方应依法承担各自的违约责任。",
  },
  {
    id: "common-penalty-excessive",
    positives: [
      "逾期付款的，按日加收滞纳金。",
      "违约金为总价款的三倍。",
      "逾期归还的，每日按百分之一支付违约金。",
    ],
    negative: "乙方违约的，违约金6000元。",
  },
  {
    id: "common-unilateral-change",
    positives: [
      "甲方有权单方调整服务费用。",
      "甲方可随时修改合同条款，修改后公布即生效。",
      "价格由甲方自行调整。",
    ],
    negative: "合同变更须双方协商一致。",
  },
  {
    id: "common-jurisdiction",
    positives: [
      "争议由甲方所在地人民法院管辖。",
      "争议提交甲方所在地仲裁委员会仲裁。",
      "如起诉，应向甲方所在地法院提出。",
    ],
    negative: "争议由合同履行地人民法院管辖。",
  },
  {
    id: "common-personal-info",
    positives: [
      "乙方同意甲方将其个人信息提供给第三方合作机构。",
      "甲方有权将乙方个人信息共享给关联方。",
      "乙方授权甲方收集全部个人信息并用于其他商业用途。",
    ],
    negative: "甲方仅收集履行本合同所需的联系方式。",
  },
];

describe("通用兜底规则命中与反例", () => {
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

  it("清洁示例仍零命中", () => {
    const text =
      "技术服务协议\n第一条 服务内容 乙方为甲方提供网站维护服务，每月服务费1000元。\n第二条 费用支付 甲方应于每月10日前支付当月服务费。\n第三条 争议解决 双方协商解决争议。";
    expect(hits(text)).toEqual([]);
  });
});