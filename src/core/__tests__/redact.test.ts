import { describe, expect, it } from "vitest";
import { examples } from "../examples";
import { extractAmounts, redact } from "../redact";

const rent = examples.find((e) => e.id === "ex-rent")!;
const intern = examples.find((e) => e.id === "ex-intern")!;

describe("redact 脱敏", () => {
  it("本地抽取金额与期限供概览卡", () => {
    const a = extractAmounts(rent.text);
    expect(a.monthlyRent).toBe(3000);
    expect(a.deposit).toBe(9000);
    expect(a.depositMonths).toBe(3);
    expect(a.penalty).toBe(6000);
    expect(a.penaltyMonths).toBe(2);
    expect(a.termMonths).toBe(12);
    expect(a.currency).toBe("CNY");
  });

  it("实习期期限可抽取", () => {
    expect(extractAmounts(intern.text).termMonths).toBe(3);
  });

  it("金额换比例占位符，不整体抹掉", () => {
    const { redactedText } = redact(rent.text);
    expect(redactedText).toContain("押金=月租×3");
    expect(redactedText).toContain("违约金=月租×2");
    expect(redactedText).toContain("月租");
    expect(redactedText).not.toContain("9000");
    expect(redactedText).not.toContain("6000");
    expect(redactedText).not.toContain("3000");
  });

  it("移除姓名/身份证/手机号/住址，原值不回显", () => {
    const { redactedText, removed } = redact(rent.text);
    expect(removed.idCard).toBeGreaterThanOrEqual(1);
    expect(removed.phone).toBeGreaterThanOrEqual(1);
    expect(removed.name).toBeGreaterThanOrEqual(1);
    expect(removed.address).toBeGreaterThanOrEqual(1);
    expect(redactedText).not.toContain("110101199003077758");
    expect(redactedText).not.toContain("13800138000");
    expect(redactedText).not.toContain("张三");
    expect(redactedText).not.toContain("李四");
    expect(redactedText).not.toContain("北京市");
    expect(redactedText).toContain("[身份证号已移除]");
    expect(redactedText).toContain("[手机号已移除]");
    expect(redactedText).toContain("[姓名已移除]");
    expect(redactedText).toContain("[住址已移除]");
  });

  it("脱敏不改动原文（纯函数，无副作用）", () => {
    const before = rent.text;
    redact(rent.text);
    expect(rent.text).toBe(before);
  });

  // 拍照识别出来的文本：数字两侧带空格、手机号带分隔符，格式和 Word/PDF 不一样。
  it("识别文本的带空格金额与带分隔符手机号照样处理", () => {
    const ocr = [
      "房屋租赁合同（示例，虚构）",
      "甲方（出租方）：李某某 电话 138-0000-0000",
      "乙方（承租方）：王小明 身份证号 110101200001010000",
      "第一条 租赁期限自 2026 年 3 月 1 日至 2027 年 2 月 28 日，共 12 个月。月租金人民币 1500 元。",
      "第二条 押金人民币 4500 元。租赁期满或乙方提前退租的，押金归甲方所有，不予退还。",
    ].join("\n");
    const a = extractAmounts(ocr);
    expect(a.monthlyRent).toBe(1500);
    expect(a.deposit).toBe(4500);
    expect(a.depositMonths).toBe(3);
    expect(a.termMonths).toBe(12);

    const { redactedText, removed } = redact(ocr);
    expect(removed.phone).toBeGreaterThanOrEqual(1);
    expect(removed.idCard).toBeGreaterThanOrEqual(1);
    expect(removed.name).toBe(2);
    expect(redactedText).not.toContain("138-0000-0000");
    expect(redactedText).not.toContain("110101200001010000");
    expect(redactedText).toContain("押金=月租×3");
    expect(redactedText).not.toContain("1500");
    expect(redactedText).not.toContain("4500");
  });

  // 金额里的五位/六位数字不能被新手机号格式误吞。
  it("带空格的金额不会被误认成手机号", () => {
    const t = "月租金人民币 1500 元，押金人民币 13000 元，违约金 12000 元。";
    const { redactedText, removed } = redact(t);
    expect(removed.phone).toBe(0);
    expect(extractAmounts(t).deposit).toBe(13000);
    expect(redactedText).not.toContain("13000");
  });
});