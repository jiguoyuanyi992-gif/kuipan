import type { ContractDoc, Finding, RiskRule } from "../types";
import { locateInBlock } from "../chunk";

function baseFinding(rule: RiskRule): Omit<Finding, "blockId" | "kind"> {
  return {
    ruleId: rule.id,
    severity: rule.severity,
    title: rule.title,
    explanation: rule.why,
    askTalk: rule.askTalk,
    aiSuggested: false,
    legalBasis: rule.legalBasis,
    verified: rule.verified,
  };
}

function existenceHits(rule: RiskRule, doc: ContractDoc): Finding[] {
  const out: Finding[] = [];
  const patterns = (rule.detect.anyRegex ?? []).map((p) => {
    try {
      return new RegExp(p, "m");
    } catch {
      return null;
    }
  });
  const groups = rule.detect.allKeywords ?? [];

  for (const block of doc.blocks) {
    let matched: { start: number; end: number; matchedText: string } | null = null;

    for (const re of patterns) {
      if (!re) continue;
      const hit = locateInBlock(block, re.source);
      if (hit) {
        matched = hit;
        break;
      }
    }

    if (!matched) {
      for (const group of groups) {
        if (group.length === 0) continue;
        if (group.every((k) => block.text.includes(k))) {
          const first = group
            .map((k) => block.text.indexOf(k))
            .filter((i) => i >= 0)
            .sort((a, b) => a - b)[0];
          const kw = group.find((k) => block.text.indexOf(k) === first) ?? group[0];
          matched = {
            start: block.start + first,
            end: block.start + first + kw.length,
            matchedText: kw,
          };
          break;
        }
      }
    }

    if (matched) {
      out.push({
        ...baseFinding(rule),
        blockId: block.id,
        kind: "exist",
        matchStart: matched.start,
        matchEnd: matched.end,
        matchedText: matched.matchedText,
      });
    }
  }
  return out;
}

// 缺失性检查留在本地确定性执行，不交给模型。
function absenceHits(rule: RiskRule, doc: ContractDoc): Finding[] {
  const out: Finding[] = [];
  for (const group of rule.detect.absentOf ?? []) {
    if (group.length === 0) continue;
    const present = group.some((k) => doc.text.includes(k));
    if (!present) {
      out.push({ ...baseFinding(rule), blockId: null, kind: "absent" });
    }
  }
  return out;
}

export function runRegex(rules: RiskRule[], doc: ContractDoc): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const rule of rules) {
    for (const f of [...existenceHits(rule, doc), ...absenceHits(rule, doc)]) {
      const key = `${f.ruleId}|${f.blockId ?? "-"}|${f.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
    }
  }
  return out;
}