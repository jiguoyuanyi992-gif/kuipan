import { describe, expect, it } from "vitest";
import { chunk, locateInBlock } from "../chunk";
import { examples } from "../examples";

describe("chunk", () => {
  for (const ex of examples) {
    it(`${ex.id}: 区间不变量 text===slice(start,end)，连续覆盖不越界`, () => {
      const blocks = chunk(ex.text);
      expect(blocks.length).toBeGreaterThan(0);
      let cursor = 0;
      blocks.forEach((b, i) => {
        expect(b.id).toBe(`b${i + 1}`);
        expect(b.index).toBe(i);
        expect(b.start).toBeGreaterThanOrEqual(0);
        expect(b.end).toBeLessThanOrEqual(ex.text.length);
        expect(b.end).toBeGreaterThan(b.start);
        expect(b.text).toBe(ex.text.slice(b.start, b.end));
        expect(b.start).toBeGreaterThanOrEqual(cursor);
        cursor = b.end;
      });
    });
  }

  it("空文本返回空数组", () => {
    expect(chunk("")).toEqual([]);
  });

  it("无条款标记时按空行分段兜底", () => {
    const text = "第一段内容。\n\n第二段内容。\n\n第三段内容。";
    const blocks = chunk(text);
    expect(blocks.length).toBe(3);
    for (const b of blocks) expect(b.text).toBe(text.slice(b.start, b.end));
  });

  it("locateInBlock 命中区间落在块内且不越界", () => {
    const text = "第一条 押金\n押金不予退还。\n第二条 其它\n正常条款。";
    const blocks = chunk(text);
    const b = blocks[0];
    const hit = locateInBlock(b, "押金[^。]*不予退还");
    expect(hit).not.toBeNull();
    expect(hit!.start).toBeGreaterThanOrEqual(b.start);
    expect(hit!.end).toBeLessThanOrEqual(b.end);
    expect(text.slice(hit!.start, hit!.end)).toBe(hit!.matchedText);
  });

  it("非法定位返回 null，不抛错", () => {
    const blocks = chunk("第一条 内容\n正文。");
    expect(locateInBlock(blocks[0], "([")).toBeNull();
  });
});