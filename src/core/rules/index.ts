import { LEGAL_BASIS_SOURCE } from "../legalSource";
import type { RiskRule } from "../types";
import rulesJson from "./rules.json";

// M4 真实规则库；web 与 function 共用同一份 JSON。
// 2026-11-16 用户授权后全部 verified=true，reviewer/reviewNote 登记授权与核对底本。
// source 不手写进数据文件，加载时从唯一常量注入。
export const rules: RiskRule[] = (rulesJson as unknown as RiskRule[]).map((r) => ({
  ...r,
  legalBasis: r.legalBasis.map((lb) => ({ ...lb, source: LEGAL_BASIS_SOURCE })),
}));

export function ruleById(id: string): RiskRule | undefined {
  return rules.find((r) => r.id === id);
}