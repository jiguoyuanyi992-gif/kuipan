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
});