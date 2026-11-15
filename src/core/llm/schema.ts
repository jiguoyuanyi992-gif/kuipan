import { z } from "zod";

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
  })
  .strict();

export const modelResponseSchema = z
  .object({
    contractType: z.enum(["rent", "internship", "other"]),
    findings: z.array(modelFindingSchema),
  })
  .strict();

export type ModelResponse = z.infer<typeof modelResponseSchema>;

export interface ParseResult {
  ok: boolean;
  data?: ModelResponse;
  errorClass?: "json" | "schema";
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
  return { ok: true, data: res.data };
}