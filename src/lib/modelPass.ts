// 模型主路径运行器（有网络，故不在 src/core）。批次并行发出（总调用 ≤8 次），
// 每批成功即回调 onPartial 供页面流式合并；全部失败时抛错，由调用方降级为只显示正则结果。
import { batchBlocks, buildPrompt, parseModelResponse } from "@/src/core/llm";
import type { ArticleEntry } from "@/src/core/articles";
import type { Block, ExtractedTerms, ModelFinding, RiskRule } from "@/src/core/types";

const ENDPOINT = "/functions/v1/app/analyze";
// 单批兜底超时：网关约 60s（M0 实测），批次并行，前端 30s 判负走降级。
const BATCH_TIMEOUT_MS = 30_000;

export interface ModelPassResult {
  okBatches: number;
  totalBatches: number;
  contractTypes: string[];
  // 首批带明确数值的兜底提取（金额期限以全文档为单位，各批只需任一批提供一次）。
  extractedTerms: ExtractedTerms;
}

function hasAnyTerm(t: ExtractedTerms): boolean {
  return (
    t.monthlyRent !== undefined ||
    t.deposit !== undefined ||
    t.penalty !== undefined ||
    t.termMonths !== undefined
  );
}

// 模型偶尔会把 JSON 包在 ``` 围栏里，先剥掉再进 schema 硬校验。
export function stripFences(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  return m ? m[1] : t;
}

async function runBatch(
  blocks: Block[],
  rules: RiskRule[],
  articles: ArticleEntry[],
  fetchImpl: typeof fetch,
): Promise<{
  ok: boolean;
  findings: ModelFinding[];
  contractType?: string;
  extractedTerms?: ExtractedTerms;
}> {
  const prompt = buildPrompt(blocks, rules, articles);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, findings: [] };
    const data = (await res.json()) as { ok?: boolean; content?: string };
    if (data.ok !== true || typeof data.content !== "string") {
      return { ok: false, findings: [] };
    }
    const parsed = parseModelResponse(stripFences(data.content));
    if (!parsed.ok || !parsed.data) return { ok: false, findings: [] };
    return {
      ok: true,
      findings: parsed.data.findings,
      contractType: parsed.data.contractType,
      extractedTerms: parsed.extractedTerms,
    };
  } catch {
    return { ok: false, findings: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function runModelPass(
  blocks: Block[],
  rules: RiskRule[],
  onPartial: (findings: ModelFinding[]) => void,
  fetchImpl: typeof fetch = fetch,
  articles: ArticleEntry[] = [],
): Promise<ModelPassResult> {
  const batches = batchBlocks(blocks);
  let okBatches = 0;
  let failedBatches = 0;
  const contractTypes: string[] = [];
  // 各批只见到部分条款块，字段可能分散在不同批次——按字段跨批合并，而非只取首批。
  const extractedTerms: ExtractedTerms = {};
  await Promise.all(
    batches.map(async (batch) => {
      const result = await runBatch(batch, rules, articles, fetchImpl);
      if (result.ok) {
        okBatches++;
        if (result.contractType) contractTypes.push(result.contractType);
        if (result.extractedTerms && hasAnyTerm(result.extractedTerms)) {
          for (const key of [
            "monthlyRent",
            "deposit",
            "penalty",
            "termMonths",
          ] as const) {
            if (extractedTerms[key] === undefined && result.extractedTerms[key] !== undefined) {
              extractedTerms[key] = result.extractedTerms[key];
            }
          }
        }
        if (result.findings.length > 0) onPartial(result.findings);
      } else {
        failedBatches++;
      }
    }),
  );
  if (okBatches === 0 && failedBatches > 0) {
    throw new Error("model pass unavailable");
  }
  return { okBatches, totalBatches: batches.length, contractTypes, extractedTerms };
}
