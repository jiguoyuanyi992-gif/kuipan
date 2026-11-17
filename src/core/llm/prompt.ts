import type { Block, RiskRule } from "../types";
import type { ArticleEntry } from "../articles";

// 构造批量语义匹配 prompt。一次带多个条款块（6–10），批次并行、总调用 ≤8 次。
// 硬约束写进 prompt：禁止引用/杜撰法条；只返回 ruleId + blockId，禁止字符 offset。
export function buildPrompt(
  blocks: Block[],
  rules: RiskRule[],
  articles: ArticleEntry[] = [],
): string {
  const ruleLines = rules
    .map(
      (r) =>
        `- ruleId=${r.id}｜${r.title}｜识别特征：${r.traits.join("；")}`,
    )
    .join("\n");

  const articleLines = articles
    .map((a) => `articleId=${a.id}｜${a.summary}`)
    .join("\n");

  const blockLines = blocks
    .map((b) => `[${b.id}] ${b.text.replace(/\s+/g, " ").trim()}`)
    .join("\n");

  return [
    "你是合同风险条款识别助手。下面给出若干规则（含白话识别特征）和一份已脱敏合同的条款块。",
    "任务：判断每个条款块是否语义命中某条规则；命中则返回该 ruleId 与 blockId。",
    "",
    "严格约束：",
    "1. 禁止引用、罗列或杜撰任何法律条文、法条编号、案例号。法律依据由系统另行提供，与你无关。",
    "2. 只返回 ruleId 与 blockId，禁止返回字符 offset、start、end、位置索引等任何定位字段。",
    "3. 措辞用「存在……风险，建议……」，不下法律结论，不使用「违法/无效/一定/肯定/必然/安全/保证/承诺/没问题」等词。",
    "4. 未命中任何规则但你认为可疑的条款，aiSuggested=true、ruleId 留空字符串，措辞「建议留意」。",
    "5. rewrite 为条款改写建议，仅供参考；askTalk 为签约前可以问对方的话。",
    "6. 返回里可以带 articleIds 数组；只能填写下方条文清单里出现过的 id，没有把握就留空数组；禁止引用、罗列或杜撰清单之外的任何法律条文。",
    "",
    "只输出 JSON，格式：",
    '{"contractType":"rent|internship|other","findings":[{"ruleId":"","blockId":"b1","explanation":"","askTalk":"","rewrite":"","aiSuggested":false,"articleIds":[]}]}',
    "",
    "规则列表：",
    ruleLines,
    ...(articles.length > 0 ? ["", "条文清单：", articleLines] : []),
    "",
    "条款块：",
    blockLines,
  ].join("\n");
}

// 把条款块切成批次，供并行发出。每批目标 6–10 块；
// 与「总调用 ≤8 次」（策略修订，硬约束）冲突时优先保证批数 ≤8，批内大小放宽。
export function batchBlocks(blocks: Block[], maxBatches = 8): Block[][] {
  const n = blocks.length;
  if (n === 0) return [];
  let size = Math.min(10, Math.max(6, Math.ceil(n / maxBatches)));
  if (Math.ceil(n / size) > maxBatches) size = Math.ceil(n / maxBatches);
  const out: Block[][] = [];
  for (let i = 0; i < n; i += size) {
    out.push(blocks.slice(i, i + size));
  }
  return out;
}