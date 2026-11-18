import { chunk } from "@/src/core/chunk";
import { articlesForType } from "@/src/core/articles";
import { runModelPass } from "@/src/lib/modelPass";
import { extractAmounts, redactForModel } from "@/src/core/redact";
import { runRegex } from "@/src/core/regex";
import { overallRisk } from "@/src/core/risk";
import { rules } from "@/src/core/rules";
import { mergeFindings } from "@/src/core/llm/merge";
import { detectType, rulesForScene } from "@/src/core/scene";
import { CONTRACT_TYPES } from "@/src/core/types";
import type {
  AmountTerms,
  ContractDoc,
  ContractSource,
  ContractType,
  ExtractedTerms,
  Finding,
  ModelFinding,
  OverallRisk,
  Severity,
} from "@/src/core/types";

export type ModelStatus = "idle" | "running" | "done" | "unavailable";

export interface Analysis {
  doc: ContractDoc;
  findings: Finding[];
  overall: OverallRisk;
  amounts: AmountTerms;
  modelStatus: ModelStatus;
  modelCalls?: { ok: number; total: number };
  // 模型判定类型（多数票）；与当前类型不同时页面显示小标签，可手动改选重新分析。
  aiType?: ContractType;
}

// 纯正则兜底结果（同步，立即渲染；模型批次到达后再合并）。
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
    modelStatus: "idle",
  };
}

// 模型主路径：正则结果先出，批次并行、边到边渲染；全批失败降级为只显示正则结果。
export async function analyzeAll(
  text: string,
  source: ContractSource,
  fileName: string | undefined,
  typeOverride: ContractType | undefined,
  onUpdate: (a: Analysis) => void,
): Promise<Analysis> {
  const base = analyzeText(text, source, fileName, typeOverride);
  onUpdate({ ...base, modelStatus: "running" });

  const sceneRules = rulesForScene(rules, base.doc.type);
  // 进请求体的只有脱敏后的条款块（姓名/证件/电话/住址移除，金额换带比例占位符）。
  const modelBlocks = base.doc.blocks.map((b) => ({
    ...b,
    text: redactForModel(b.text, base.amounts),
  }));

  const collected: ModelFinding[] = [];
  const mergeCurrent = () =>
    mergeFindings(base.findings, collected, rules, base.doc);

  try {
    const result = await runModelPass(
      modelBlocks,
      sceneRules,
      (partial) => {
        collected.push(...partial);
        const findings = mergeCurrent();
        onUpdate({
          ...base,
          findings,
          overall: overallRisk(findings),
          modelStatus: "running",
        });
      },
      fetch,
      articlesForType(base.doc.type),
    );
    const findings = mergeCurrent();
    const final: Analysis = {
      ...base,
      findings,
      overall: overallRisk(findings),
      amounts: mergeAmounts(base.amounts, result.extractedTerms),
      modelStatus: "done",
      modelCalls: { ok: result.okBatches, total: result.totalBatches },
      aiType: voteType(result.contractTypes),
    };
    onUpdate(final);
    return final;
  } catch {
    const degraded: Analysis = { ...base, modelStatus: "unavailable" };
    onUpdate(degraded);
    return degraded;
  }
}

// 金额期限双轨兜底：本地正则抽到了就用本地的，抽不到用模型的值填空；
// 押金/违约金倍数按合并后的最终值重算。降级路径不调用本函数，amounts 保持本地值。
export function mergeAmounts(local: AmountTerms, llm: ExtractedTerms): AmountTerms {
  const monthlyRent = local.monthlyRent ?? llm.monthlyRent;
  const deposit = local.deposit ?? llm.deposit;
  const penalty = local.penalty ?? llm.penalty;
  const termMonths = local.termMonths ?? llm.termMonths;
  const round2 = (n: number) => Number(n.toFixed(2));
  return {
    monthlyRent,
    deposit,
    depositMonths:
      deposit !== undefined && monthlyRent
        ? round2(deposit / monthlyRent)
        : undefined,
    penalty,
    penaltyMonths:
      penalty !== undefined && monthlyRent
        ? round2(penalty / monthlyRent)
        : undefined,
    termMonths,
    currency: local.currency,
  };
}

function voteType(types: string[]): ContractType | undefined {
  if (types.length === 0) return undefined;
  const count = new Map<string, number>();
  for (const t of types) count.set(t, (count.get(t) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  if ((CONTRACT_TYPES as readonly string[]).includes(top)) return top as ContractType;
  return undefined;
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