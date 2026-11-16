import { describe, expect, it } from "vitest";
import {
  MAX_PAGE_IMAGES,
  OCR_ERROR_TEXT,
  classifyOcrError,
  mergeOcrPages,
  stripOcrCoordLines,
  takeImages,
} from "../plan";

const img = (name: string) => ({ name, type: "image/jpeg" }) as File;
const doc = (name: string) => ({ name, type: "application/pdf" }) as File;

describe("照片识别的纯函数层", () => {
  it("只收图片，超出 6 张的部分报 dropped", () => {
    const { kept, dropped } = takeImages([img("a"), doc("x.pdf"), img("b"), img("c")]);
    expect(kept).toHaveLength(3);
    expect(dropped).toBe(0);
    const over = takeImages(Array.from({ length: 8 }, (_, i) => img(`p${i}`)));
    expect(over.kept).toHaveLength(MAX_PAGE_IMAGES);
    expect(over.dropped).toBe(2);
  });

  it("qwen-vl-ocr 的坐标前缀被清洗，普通数字行不受影响", () => {
    const raw = [
      "499,90,35,508,88,房屋租赁合同（示例，虚构）",
      "第二条 押金人民币 4500 元，月租 1500 元。",
      "1,2,3,4,5,第三条 租金一次性支付一年",
    ].join("\n");
    const out = stripOcrCoordLines(raw);
    expect(out).toContain("房屋租赁合同（示例，虚构）");
    expect(out).not.toMatch(/^499,/);
    expect(out).toContain("第二条 押金人民币 4500 元，月租 1500 元。");
    expect(out).toContain("第三条 租金一次性支付一年");
  });

  it("按选择顺序当页序合并，空页跳过", () => {
    const merged = mergeOcrPages([
      { index: 1, text: "第二条 押金不退" },
      { index: 0, text: "第一条 租期 12 个月" },
      { index: 2, text: "   " },
    ]);
    expect(merged.ok).toBe(true);
    if (merged.ok) {
      expect(merged.pages).toBe(2);
      expect(merged.text.indexOf("第一条")).toBeLessThan(merged.text.indexOf("第二条"));
      expect(merged.text).toContain("第一条 租期 12 个月\n\n第二条 押金不退");
    }
  });

  it("行尾双空格换行标记被收掉", () => {
    const merged = mergeOcrPages([{ index: 0, text: "第一条 租期  \n第二条 押金  " }]);
    expect(merged.ok && merged.text).toBe("第一条 租期\n第二条 押金");
  });

  it("全部为空 → empty；超长 → too_large", () => {
    expect(mergeOcrPages([{ index: 0, text: "" }])).toEqual({ ok: false, error: "empty" });
    expect(mergeOcrPages([{ index: 0, text: "字".repeat(20_001) }])).toEqual({
      ok: false,
      error: "too_large",
    });
  });

  it("服务端错误码映射到用户可读原因", () => {
    expect(classifyOcrError("ocr_empty")).toBe("blurry");
    expect(classifyOcrError("rate_limited")).toBe("quota");
    expect(classifyOcrError("upstream_timeout")).toBe("network");
    expect(classifyOcrError("image_too_large")).toBe("too_large");
    expect(classifyOcrError("unavailable_model")).toBe("unavailable");
    expect(classifyOcrError(undefined, 429)).toBe("quota");
    expect(classifyOcrError(undefined, 404)).toBe("unavailable");
    expect(classifyOcrError("weird_code", 500)).toBe("network");
  });

  it("每条失败提示都给出改用粘贴的出路，且不含禁用词", () => {
    const banned = ["违法", "无效", "可起诉", "一定", "肯定", "必然", "安全", "放心签", "保证", "承诺", "没问题"];
    for (const text of Object.values(OCR_ERROR_TEXT)) {
      expect(text.length).toBeGreaterThan(8);
      for (const word of banned) expect(text.includes(word)).toBe(false);
    }
  });
});
