import { describe, expect, it } from "vitest";
import { batchBlocks } from "../llm/prompt";
import { redactForModel } from "../redact";
import { extractAmounts } from "../redact";
import type { Block } from "../types";

function fakeBlock(i: number): Block {
  return {
    id: `b${i + 1}`,
    index: i,
    text: `第${i + 1}条 内容${i + 1}`,
    start: 0,
    end: 0,
    kind: "clause",
  };
}

describe("batchBlocks 总调用 ≤8（策略修订硬预算）", () => {
  it("小合同每批不超过 10 块", () => {
    const batches = batchBlocks(Array.from({ length: 14 }, (_, i) => fakeBlock(i)));
    expect(batches.length).toBeLessThanOrEqual(8);
    for (const b of batches) {
      expect(b.length).toBeLessThanOrEqual(10);
    }
    // 非末批按批大小填满
    for (const b of batches.slice(0, -1)) {
      expect(b.length).toBe(batches[0].length);
    }
  });

  it("80 块 → 每批 10 共 8 批", () => {
    const batches = batchBlocks(Array.from({ length: 80 }, (_, i) => fakeBlock(i)));
    expect(batches.length).toBe(8);
  });

  it("100 块仍 ≤8 批（批内放宽，保证总数上限）", () => {
    const batches = batchBlocks(Array.from({ length: 100 }, (_, i) => fakeBlock(i)));
    expect(batches.length).toBeLessThanOrEqual(8);
    const total = batches.reduce((n, b) => n + b.length, 0);
    expect(total).toBe(100);
  });

  it("空输入返回空", () => {
    expect(batchBlocks([])).toEqual([]);
  });
});

describe("redactForModel 块级脱敏", () => {
  it("块内没有月租时，押金仍按全文档比例占位", () => {
    const full = "月租金为人民币2000元。\n乙方提前退租的，押金6000元不予退还。";
    const amounts = extractAmounts(full);
    expect(amounts.depositMonths).toBe(3);
    const out = redactForModel("乙方提前退租的，押金6000元不予退还。", amounts);
    expect(out).toContain("押金=月租×3");
    expect(out).not.toContain("6000");
  });

  it("块内姓名/手机号被移除", () => {
    const out = redactForModel("乙方：张三，电话13800000000。", extractAmounts(""));
    expect(out).not.toContain("张三");
    expect(out).not.toContain("13800000000");
  });
});
