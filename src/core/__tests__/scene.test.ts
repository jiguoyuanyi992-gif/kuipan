import { describe, expect, it } from "vitest";
import contractsJson from "../../../data/contracts.json";
import { parseModelResponse } from "../llm";
import { rules } from "../rules";
import { detectType, scenesFor } from "../scene";
import { CONTRACT_TYPES } from "../types";

// 专属规则尚未补齐的类型在此显式豁免；每补完一类移除一项。
// 被跳过（凑不够 4 条 flk 依据）的类型保留在名单里并在 qoder-log 记录原因。
const PENDING_DEDICATED: string[] = [
  "loan",
  "plan",
  "cert",
  "insurance",
  "prepaid",
  "carrental",
  "driving",
];

describe("类型单一来源与结构", () => {
  it("每个 ContractType 在 contracts.json 都有条目", () => {
    const ids = (contractsJson as { types: { id: string }[] }).types.map((t) => t.id);
    // other 是分析兜底类型，照契页不设页签。
    for (const t of CONTRACT_TYPES) {
      if (t === "other") continue;
      expect(ids).toContain(t);
    }
  });

  it("每类专属规则 ≥4 条（豁免名单显式列出）", () => {
    for (const t of CONTRACT_TYPES) {
      if (t === "other") continue;
      if (PENDING_DEDICATED.includes(t)) continue;
      const n = rules.filter((r) => r.scene === t).length;
      expect(n, `scene=${t} 专属规则数`).toBeGreaterThanOrEqual(4);
    }
  });

  it("scenesFor：每类返回 [type, common]，other 只返回 common", () => {
    for (const t of CONTRACT_TYPES) {
      if (t === "other") expect(scenesFor(t)).toEqual(["common"]);
      else expect(scenesFor(t)).toEqual([t, "common"]);
    }
  });

  it("schema 的 contractType 枚举与 CONTRACT_TYPES 一致", () => {
    for (const t of CONTRACT_TYPES) {
      const r = parseModelResponse(JSON.stringify({ contractType: t, findings: [] }));
      expect(r.ok, `contractType=${t}`).toBe(true);
    }
    const bad = parseModelResponse(
      JSON.stringify({ contractType: "bogus", findings: [] }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.errorClass).toBe("schema");
  });
});

describe("detectType 边界用例（plan/prepaid、cert/driving、loan/cert）", () => {
  it("健身房办卡充值归 prepaid，不被 plan 抢走", () => {
    const text =
      "健身房会员办卡协议：乙方在甲方门店办理健身年卡，充值3000元，私教课程另行购买。";
    expect(detectType(text)).toBe("prepaid");
  });

  it("话费套餐里的「充值」不影响归 plan", () => {
    const text =
      "话费套餐协议：乙方订购甲方流量套餐，月费39元，合约期12个月，话费充值后生效，到期自动续费。";
    expect(detectType(text)).toBe("plan");
  });

  it("驾校合同里的培训费报名费不影响归 driving", () => {
    const text =
      "驾驶培训合同：甲方驾校为乙方提供驾驶证培训，收取培训费3800元、报名费200元，科目二练车由教练安排，补考费另计。";
    expect(detectType(text)).toBe("driving");
  });

  it("考证培训合同归 cert，不落 driving", () => {
    const text =
      "考研培训服务协议：甲方为乙方提供考研辅导课程，收取培训费5000元、教材费300元，写明包过，不过全退。";
    expect(detectType(text)).toBe("cert");
  });

  it("培训贷借款合同归 loan，不归 cert", () => {
    const text =
      "培训贷借款合同：乙方为支付培训费向甲方借款20000元，放款至培训机构账户，本金分24期偿还，利息按年化利率计算，报名费另付。";
    expect(detectType(text)).toBe("loan");
  });

  it("培训服务合同里的分期缴费不触发 loan", () => {
    const text =
      "考证培训服务协议：乙方报名甲方职业资格培训，培训费6000元可分期支付，教材费另收。";
    expect(detectType(text)).toBe("cert");
  });

  it("租车合同里的押金不影响归 carrental", () => {
    const text =
      "汽车租赁合同：乙方自驾租车，取车时验车，还车时结算里程与违章押金，车损由甲方定损。";
    expect(detectType(text)).toBe("carrental");
  });

  it("无任何关键词返回 other", () => {
    expect(detectType("技术服务协议：乙方为甲方提供网站维护服务，每月服务费1000元。")).toBe(
      "other",
    );
  });
});