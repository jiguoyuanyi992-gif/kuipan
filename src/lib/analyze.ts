import { chunk } from "@/src/core/chunk";
import { extractAmounts } from "@/src/core/redact";
import { runRegex } from "@/src/core/regex";
import { overallRisk } from "@/src/core/risk";
import { rules } from "@/src/core/rules";
import { detectType, rulesForScene } from "@/src/core/scene";
import type {
  AmountTerms,
  ContractDoc,
  ContractSource,
  ContractType,
  Finding,
  OverallRisk,
  Severity,
} from "@/src/core/types";

export interface Analysis {
  doc: ContractDoc;
  findings: Finding[];
  overall: OverallRisk;
  amounts: AmountTerms;
}

// M2 由正则兜底驱动；M3 接入模型语义匹配主路径并合并去重。
export function analyzeText(
  text: string,
  source: ContractSource,
  fileName?: string,
  typeOverride?: ContractType,
): Analysis {
  const type = typeOverride ?? detectType(text);
  const doc: ContractDoc = {
    type,
    text,
    blocks: chunk(text),
    source,
    fileName,
  };
  const findings = runRegex(rulesForScene(rules, type), doc);
  return {
    doc,
    findings,
    overall: overallRisk(findings),
    amounts: extractAmounts(text),
  };
}

const RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

// 某条款块的最高风险档（用于目录圆点与原文背色）。
export function blockSeverity(
  blockId: string,
  findings: Finding[],
): Severity | null {
  let top: Severity | null = null;
  for (const f of findings) {
    if (f.blockId !== blockId) continue;
    if (!top || RANK[f.severity] > RANK[top]) top = f.severity;
  }
  return top;
}