import type { ContractDoc, Finding, LegalBasis, ModelFinding, RiskRule } from "../types";
import { articleById, type ArticleEntry } from "../articles";
import { locateInBlock } from "../chunk";

function keyOf(f: { ruleId: string; blockId: string | null; aiSuggested: boolean }): string {
  return f.aiSuggested ? `ai|${f.blockId}` : `${f.ruleId}|${f.blockId}`;
}

// 合并去重：正则兜底结果始终保留；模型结果校验引用后并入，同 rule+block 不重复。
// 法律依据永远只从规则库按 ruleId 读取，模型不参与生成。
export function mergeFindings(
  regexFindings: Finding[],
  modelFindings: ModelFinding[],
  rules: RiskRule[],
  doc: ContractDoc,
): Finding[] {
  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  const blockMap = new Map(doc.blocks.map((b) => [b.id, b]));
  const byKey = new Map<string, Finding>();

  for (const f of regexFindings) byKey.set(keyOf(f), f);

  for (const mf of modelFindings) {
    const block = blockMap.get(mf.blockId);
    if (!block) continue; // 模型引用了不存在的块 → 丢弃

    if (mf.aiSuggested) {
      const k = `ai|${mf.blockId}`;
      if (byKey.has(k)) continue;
      // 参考条文只认封闭清单内且 verified 的 id；查不到的静默丢弃，不报错。
      const possibleBasis: LegalBasis[] = (mf.articleIds ?? [])
        .map((id) => articleById(id))
        .filter((a): a is ArticleEntry => a !== undefined && a.verified)
        .map((a) => ({
          law: a.law,
          article: a.article,
          quote: a.quote,
          source: a.source,
          effectiveOn: a.effectiveOn,
          sourceUrl: a.sourceUrl,
        }));
      byKey.set(k, {
        ruleId: "",
        blockId: mf.blockId,
        kind: "ai",
        severity: "medium",
        title: "其他可疑条款",
        explanation: mf.explanation,
        askTalk: mf.askTalk,
        rewrite: mf.rewrite || undefined,
        aiSuggested: true,
        legalBasis: [],
        verified: false,
        possibleBasis: possibleBasis.length > 0 ? possibleBasis : undefined,
      });
      continue;
    }

    const rule = ruleMap.get(mf.ruleId);
    if (!rule) continue; // 模型不能凭空创造规则

    // 缺失性规则只能由本地判定，模型不得把「整份缺失」伪造成某块 exist 命中。
    const existDetectable =
      (rule.detect.anyRegex?.length ?? 0) + (rule.detect.allKeywords?.length ?? 0) >
      0;
    if (!existDetectable) continue;

    const k = `${rule.id}|${mf.blockId}`;
    const existing = byKey.get(k);
    let match: { start: number; end: number; matchedText: string } | null = null;
    for (const p of rule.detect.anyRegex ?? []) {
      match = locateInBlock(block, p);
      if (match) break;
    }

    if (existing) {
      // 兜底已在：用模型文本丰富解释/改写，法律依据与 verified 仍取规则库。
      byKey.set(k, {
        ...existing,
        explanation: mf.explanation || existing.explanation,
        askTalk: mf.askTalk || existing.askTalk,
        rewrite: mf.rewrite || existing.rewrite,
        matchStart: existing.matchStart ?? match?.start,
        matchEnd: existing.matchEnd ?? match?.end,
        matchedText: existing.matchedText ?? match?.matchedText,
      });
    } else {
      byKey.set(k, {
        ruleId: rule.id,
        blockId: mf.blockId,
        kind: "exist",
        severity: rule.severity,
        title: rule.title,
        explanation: mf.explanation || rule.why,
        askTalk: mf.askTalk || rule.askTalk,
        rewrite: mf.rewrite || undefined,
        aiSuggested: false,
        matchStart: match?.start,
        matchEnd: match?.end,
        matchedText: match?.matchedText,
        legalBasis: rule.legalBasis,
        verified: rule.verified,
      });
    }
  }

  return [...byKey.values()];
}