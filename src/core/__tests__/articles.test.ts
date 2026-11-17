import { describe, expect, it } from "vitest";
import { articleById, articles, articlesForType } from "../articles";
import { chunk } from "../chunk";
import { buildPrompt, mergeFindings, parseModelResponse } from "../llm";
import { rules } from "../rules";
import { CONTRACT_TYPES } from "../types";
import type { ContractDoc, ModelFinding } from "../types";

const doc: ContractDoc = {
  type: "other",
  text: "第一条 双方约定如下。\n第二条 其他约定 以书面内容为准。",
  blocks: chunk("第一条 双方约定如下。\n第二条 其他约定 以书面内容为准。"),
  source: "paste",
};

function aiFinding(articleIds?: string[]): ModelFinding {
  return {
    ruleId: "",
    blockId: doc.blocks[0].id,
    explanation: "建议留意该表述。",
    askTalk: "能说明一下吗？",
    rewrite: "",
    aiSuggested: true,
    articleIds,
  };
}

describe("封闭条文清单", () => {
  it("清单共 12 条，全部 verified 且有 reviewer/reviewNote 登记", () => {
    expect(articles).toHaveLength(12);
    for (const a of articles) {
      expect(a.verified).toBe(true);
      expect(a.reviewer).toBe("执行层自动引用");
      expect(a.reviewNote).toBeTruthy();
      expect(a.source).toContain("flk.npc.gov.cn");
    }
  });

  it("articlesForType 只返回 verified 条目；scenes 含 other 视为通用条文全场景可用", () => {
    // 指令口径：scenes 包含该类型（或包含 other）即返回。
    // consumer-26/53 的 scenes 含 other（贷款/分期分析时归 other 类，必须可用），
    // 因此按通用条文处理，rent 场景同样返回。
    for (const t of CONTRACT_TYPES) {
      const list = articlesForType(t);
      expect(list.every((a) => a.verified)).toBe(true);
      expect(list.map((a) => a.id)).toContain("civil-496");
    }
    const plan = articlesForType("plan").map((a) => a.id);
    expect(plan).toContain("consumer-26");
    expect(plan).toContain("consumer-53");
    const loan = articlesForType("loan").map((a) => a.id);
    expect(loan).toContain("civil-670");
    expect(loan).toContain("civil-680");
    const other = articlesForType("other").map((a) => a.id);
    expect(other).toContain("consumer-26");
    expect(other).toContain("consumer-53");
    expect(other).toHaveLength(10);
  });

  it("articleById 查不到返回 undefined", () => {
    expect(articleById("civil-496")?.law).toContain("民法典");
    expect(articleById("no-such-article")).toBeUndefined();
  });
});

describe("merge：possibleBasis 只认清单内且 verified 的 id", () => {
  it("清单内保留、清单外静默丢弃", () => {
    const merged = mergeFindings([], [aiFinding(["civil-496", "bogus"])], rules, doc);
    const ai = merged.find((f) => f.aiSuggested)!;
    expect(ai.possibleBasis).toHaveLength(1);
    expect(ai.possibleBasis![0].law).toContain("民法典");
    expect(ai.legalBasis).toEqual([]);
    expect(ai.verified).toBe(false);
  });

  it("全部清单外 → possibleBasis 不设置，不报错", () => {
    const merged = mergeFindings([], [aiFinding(["bogus-1", "bogus-2"])], rules, doc);
    const ai = merged.find((f) => f.aiSuggested)!;
    expect(ai.possibleBasis).toBeUndefined();
  });

  it("不带 articleIds → possibleBasis 不设置", () => {
    const merged = mergeFindings([], [aiFinding()], rules, doc);
    const ai = merged.find((f) => f.aiSuggested)!;
    expect(ai.possibleBasis).toBeUndefined();
  });

  it("非 aiSuggested 项不处理 articleIds", () => {
    const rule = rules.find((r) => r.id === "common-auto-renew")!;
    const mf: ModelFinding = {
      ruleId: rule.id,
      blockId: doc.blocks[0].id,
      explanation: "存在自动续约风险，建议留意。",
      askTalk: "x",
      rewrite: "y",
      aiSuggested: false,
      articleIds: ["civil-496"],
    };
    const merged = mergeFindings([], [mf], rules, doc);
    const hit = merged.find((f) => f.ruleId === rule.id)!;
    expect(hit.possibleBasis).toBeUndefined();
    expect(hit.legalBasis).toEqual(rule.legalBasis);
  });
});

describe("schema：articleIds 向后兼容", () => {
  const base = {
    ruleId: "",
    blockId: "b1",
    explanation: "x",
    askTalk: "y",
    rewrite: "",
    aiSuggested: true,
  };

  it("不带 articleIds 的旧格式通过，默认空数组", () => {
    const r = parseModelResponse(
      JSON.stringify({ contractType: "other", findings: [base] }),
    );
    expect(r.ok).toBe(true);
    expect(r.data?.findings[0].articleIds).toEqual([]);
  });

  it("带 articleIds 通过", () => {
    const r = parseModelResponse(
      JSON.stringify({
        contractType: "other",
        findings: [{ ...base, articleIds: ["civil-496"] }],
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.data?.findings[0].articleIds).toEqual(["civil-496"]);
  });

  it("articleIds 类型错误拒绝", () => {
    const r = parseModelResponse(
      JSON.stringify({
        contractType: "other",
        findings: [{ ...base, articleIds: "civil-496" }],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.errorClass).toBe("schema");
  });
});

describe("prompt：条文清单段只追加不改写", () => {
  it("传 articles 时含条文清单与约束第 6 条，JSON 示例带 articleIds", () => {
    const p = buildPrompt(doc.blocks, rules, articlesForType("other"));
    expect(p).toContain("条文清单：");
    expect(p).toContain("articleId=civil-496｜");
    expect(p).toContain("只能填写下方条文清单里出现过的 id");
    expect(p).toContain('"articleIds":[]');
    // 天赐原版约束逐字保留
    expect(p).toContain("禁止引用、罗列或杜撰任何法律条文、法条编号、案例号");
  });

  it("不传 articles 时无条文清单段（旧调用方不受影响）", () => {
    const p = buildPrompt(doc.blocks, rules);
    expect(p).not.toContain("条文清单：");
    expect(p).toContain("规则列表：");
  });
});