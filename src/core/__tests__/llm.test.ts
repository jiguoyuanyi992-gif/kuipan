import { describe, expect, it } from "vitest";
import { chunk } from "../chunk";
import { examples } from "../examples";
import { buildPrompt, mergeFindings, parseModelResponse } from "../llm";
import { runRegex } from "../regex";
import { rules } from "../rules";
import { rulesForScene } from "../scene";
import type { ContractDoc, ModelFinding } from "../types";

const rent = examples.find((e) => e.id === "ex-rent")!;
const doc: ContractDoc = {
  type: "rent",
  text: rent.text,
  blocks: chunk(rent.text),
  source: "example",
};

const valid = JSON.stringify({
  contractType: "rent",
  findings: [
    {
      ruleId: "rent-deposit-forfeit",
      blockId: "b1",
      explanation: "存在押金被没收风险，建议问清退还条件。",
      askTalk: "押金什么时候退？",
      rewrite: "建议约定退租后7日内退还押金。",
      aiSuggested: false,
    },
  ],
});

describe("llm schema 硬校验", () => {
  it("合法返回通过", () => {
    const r = parseModelResponse(valid);
    expect(r.ok).toBe(true);
    expect(r.data?.findings).toHaveLength(1);
  });

  it("非 JSON 拒绝", () => {
    const r = parseModelResponse("这不是JSON");
    expect(r.ok).toBe(false);
    expect(r.errorClass).toBe("json");
  });

  it("缺字段拒绝", () => {
    const r = parseModelResponse(
      JSON.stringify({ contractType: "rent", findings: [{ ruleId: "x" }] }),
    );
    expect(r.ok).toBe(false);
    expect(r.errorClass).toBe("schema");
  });

  it("带字符 offset 等越权字段拒绝（模型 offset 不采信）", () => {
    const bad = JSON.stringify({
      contractType: "rent",
      findings: [
        {
          ruleId: "rent-deposit-forfeit",
          blockId: "b1",
          explanation: "x",
          askTalk: "y",
          rewrite: "z",
          aiSuggested: false,
          start: 10,
          end: 20,
        },
      ],
    });
    expect(parseModelResponse(bad).ok).toBe(false);
  });

  it("类型错误拒绝", () => {
    const bad = valid.replace('"aiSuggested":false', '"aiSuggested":"false"');
    expect(parseModelResponse(bad).ok).toBe(false);
  });
});

describe("llm 合并去重", () => {
  const regexFindings = runRegex(rulesForScene(rules, "rent"), doc);

  it("模型引用不存在的块 → 丢弃", () => {
    const mf: ModelFinding[] = [
      {
        ruleId: "rent-deposit-forfeit",
        blockId: "b999",
        explanation: "x",
        askTalk: "y",
        rewrite: "z",
        aiSuggested: false,
      },
    ];
    const merged = mergeFindings(regexFindings, mf, rules, doc);
    expect(merged.length).toBe(regexFindings.length);
  });

  it("模型凭空创造规则 → 丢弃", () => {
    const mf: ModelFinding[] = [
      {
        ruleId: "no-such-rule",
        blockId: doc.blocks[0].id,
        explanation: "x",
        askTalk: "y",
        rewrite: "z",
        aiSuggested: false,
      },
    ];
    const merged = mergeFindings(regexFindings, mf, rules, doc);
    expect(merged.length).toBe(regexFindings.length);
  });

  it("同 rule+block 与兜底去重，法律依据仍取规则库", () => {
    const target = regexFindings.find((f) => f.ruleId === "rent-deposit-forfeit")!;
    const mf: ModelFinding[] = [
      {
        ruleId: target.ruleId,
        blockId: target.blockId!,
        explanation: "模型解释",
        askTalk: "模型话术",
        rewrite: "模型改写",
        aiSuggested: false,
      },
    ];
    const merged = mergeFindings(regexFindings, mf, rules, doc);
    const same = merged.filter(
      (f) => f.ruleId === target.ruleId && f.blockId === target.blockId,
    );
    expect(same).toHaveLength(1);
    expect(same[0].explanation).toBe("模型解释");
    expect(same[0].verified).toBe(target.verified);
    expect(same[0].legalBasis).toEqual(target.legalBasis);
  });

  it("aiSuggested → 其他可疑条款，不附法律依据", () => {
    const mf: ModelFinding[] = [
      {
        ruleId: "",
        blockId: doc.blocks[0].id,
        explanation: "建议留意该表述。",
        askTalk: "能说明一下吗？",
        rewrite: "",
        aiSuggested: true,
      },
    ];
    const merged = mergeFindings(regexFindings, mf, rules, doc);
    const ai = merged.find((f) => f.aiSuggested);
    expect(ai).toBeDefined();
    expect(ai!.kind).toBe("ai");
    expect(ai!.legalBasis).toEqual([]);
    expect(ai!.title).toBe("其他可疑条款");
  });

  it("缺失性规则（absent-only）不接受模型 exist 命中", () => {
    const mf: ModelFinding[] = [
      {
        ruleId: "rent-missing-deposit-return",
        blockId: doc.blocks[0].id,
        explanation: "模型称该块缺失押金退还约定。",
        askTalk: "x",
        rewrite: "y",
        aiSuggested: false,
      },
    ];
    const merged = mergeFindings(regexFindings, mf, rules, doc);
    // 该规则的命中只能来自本地缺失性判定（blockId 为 null），模型版被丢弃。
    const hits = merged.filter((f) => f.ruleId === "rent-missing-deposit-return");
    expect(hits.every((f) => f.blockId === null)).toBe(true);
  });

  it("模型 explanation 夹带法条字样 → 法律依据仍只来自规则库", () => {
    const target = regexFindings.find((f) => f.ruleId === "rent-deposit-forfeit")!;
    const rule = rules.find((r) => r.id === target.ruleId)!;
    const mf: ModelFinding[] = [
      {
        ruleId: target.ruleId,
        blockId: target.blockId!,
        explanation: "依据《民法典》第七百零三条，该押金约定存在风险，建议留意。",
        askTalk: "x",
        rewrite: "y",
        aiSuggested: false,
      },
    ];
    const merged = mergeFindings(regexFindings, mf, rules, doc);
    const same = merged.find(
      (f) => f.ruleId === target.ruleId && f.blockId === target.blockId,
    )!;
    // 模型文本只进 explanation，legalBasis 与规则库逐字一致，不受模型夹带影响。
    expect(same.explanation).toContain("民法典");
    expect(same.legalBasis).toEqual(rule.legalBasis);
    expect(same.legalBasis.some((b) => b.law.includes("民法典"))).toBe(false);
  });
});

describe("法条调取规范（prompt 硬约束固定）", () => {
  it("prompt 禁止模型引用/罗列/杜撰法条", () => {
    const p = buildPrompt(doc.blocks.slice(0, 2), rulesForScene(rules, "rent"));
    expect(p).toContain("禁止引用、罗列或杜撰任何法律条文、法条编号、案例号");
    expect(p).toContain("法律依据由系统另行提供，与你无关");
  });

  it("扩类只在约束末尾追加第 7 条，原 JSON 示例行不动", () => {
    const p = buildPrompt(doc.blocks.slice(0, 2), rulesForScene(rules, "rent"));
    expect(p).toContain(
      "7. contractType 除 rent、internship、other 外，还可以取 loan（贷款分期）、plan（话费宽带会员等订阅套餐）、cert（考证培训）、insurance（保险）、prepaid（健身美容等办卡充值）、carrental（租车）、driving（驾校）；拿不准就填 other。",
    );
    expect(p).toContain('{"contractType":"rent|internship|other"');
    // 第 7 条在第 6 条之后、JSON 示例之前
    expect(p.indexOf("6. 返回里可以带 articleIds")).toBeLessThan(
      p.indexOf("7. contractType"),
    );
    expect(p.indexOf("7. contractType")).toBeLessThan(p.indexOf("只输出 JSON"));
  });
});