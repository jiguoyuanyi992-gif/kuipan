import { z } from "zod";
import { CONTRACT_TYPES } from "../types";
import type { ExtractedTerms } from "../types";

// 模型只允许返回 ruleId + blockId + 文本建议。
// .strict() 拒绝任何额外字段（尤其字符 offset/start/end —— 模型给的 offset 会幻觉，一律不采信）。
export const modelFindingSchema = z
  .object({
    ruleId: z.string(),
    blockId: z.string(),
    explanation: z.string(),
    askTalk: z.string(),
    rewrite: z.string(),
    aiSuggested: z.boolean(),
    articleIds: z.array(z.string()).default([]),
  })
  .strict();

// 金额期限兜底提取：接受 number / 数字字符串（含千分位），null 与脏值归一为 undefined。
// 不加 .strict()：extractedTerms 里的多余键不值得让整批 findings 陪葬。
const termNumber = z
  .union([z.number(), z.string(), z.null()])
  .transform((v): number | undefined => {
    if (v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  });

export const extractedTermsSchema = z.object({
  monthlyRent: termNumber.optional(),
  deposit: termNumber.optional(),
  penalty: termNumber.optional(),
  termMonths: termNumber.optional(),
});

export const modelResponseSchema = z
  .object({
    contractType: z.enum(CONTRACT_TYPES),
    findings: z.array(modelFindingSchema),
    extractedTerms: extractedTermsSchema.optional(),
  })
  .strict();

export type ModelResponse = z.infer<typeof modelResponseSchema>;

export interface ParseResult {
  ok: boolean;
  data?: ModelResponse;
  errorClass?: "json" | "schema";
  // 归一化后的兜底提取值（脏值/缺失时为 {}），由前端与本地抽取合并。
  extractedTerms?: ExtractedTerms;
}

// 畸形返回（非 JSON / 缺字段 / 类型错 / 带 offset）一律拒绝，失败只用规则结果。
export function parseModelResponse(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, errorClass: "json" };
  }
  const res = modelResponseSchema.safeParse(json);
  if (!res.success) return { ok: false, errorClass: "schema" };
  const { monthlyRent, deposit, penalty, termMonths } =
    res.data.extractedTerms ?? {};
  return {
    ok: true,
    data: res.data,
    extractedTerms: { monthlyRent, deposit, penalty, termMonths },
  };
}