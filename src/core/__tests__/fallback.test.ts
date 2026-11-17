import { describe, expect, it } from "vitest";
import {
  actionsForType,
  GENERAL_ACTIONS,
  SCENE_EXTRA_ACTIONS,
} from "../fallback/actions";
import { CONTRACT_TYPES } from "../types";

const BANNED = [
  "违法",
  "无效",
  "可起诉",
  "一定",
  "肯定",
  "必然",
  "安全",
  "放心签",
  "保证",
  "承诺",
  "没问题",
];
const WHITELIST = ["保证金", "保证人", "保证责任", "保证书"];

function bannedHits(text: string): string[] {
  let t = text;
  for (const w of WHITELIST) t = t.split(w).join("");
  return BANNED.filter((w) => t.includes(w));
}

describe("签前怎么办兜底文案", () => {
  it("所有类型都能取到非空文案，且含通用行动建议", () => {
    for (const type of CONTRACT_TYPES) {
      const actions = actionsForType(type);
      expect(actions.length).toBeGreaterThan(0);
      expect(actions).toEqual(expect.arrayContaining(GENERAL_ACTIONS));
    }
  });

  it("场景补充只加在对应类型上", () => {
    expect(actionsForType("rent")).toEqual([
      ...GENERAL_ACTIONS,
      ...(SCENE_EXTRA_ACTIONS.rent ?? []),
    ]);
    expect(actionsForType("internship")).toEqual([
      ...GENERAL_ACTIONS,
      ...(SCENE_EXTRA_ACTIONS.internship ?? []),
    ]);
    expect(actionsForType("other")).toEqual(GENERAL_ACTIONS);
    expect(actionsForType("rent").join("")).toContain("12345");
    expect(actionsForType("internship").join("")).toContain("12333");
    expect(actionsForType("internship").join("")).toContain("实习指导老师");
  });

  it("全部文案不含禁用词", () => {
    for (const type of CONTRACT_TYPES) {
      expect(bannedHits(actionsForType(type).join(""))).toEqual([]);
    }
  });
});