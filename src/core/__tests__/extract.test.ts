import { describe, expect, it } from "vitest";
import { isLikelyScanned } from "../extract";

describe("extract 扫描版判定", () => {
  it("空文本/纯空白判为扫描版", () => {
    expect(isLikelyScanned("")).toBe(true);
    expect(isLikelyScanned("   \n\t  ")).toBe(true);
  });

  it("文字极少判为扫描版（提示改用粘贴）", () => {
    expect(isLikelyScanned("合同")).toBe(true);
  });

  it("正常文字不判为扫描版", () => {
    expect(isLikelyScanned("房屋租赁合同 第一条 租赁期限 租期12个月。")).toBe(false);
  });
});