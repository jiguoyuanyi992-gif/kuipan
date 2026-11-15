import type { RiskRule } from "../types";
import rulesJson from "./rules.json";

// M1 假规则（verified 全 false，仅用于打通流程与测试）。
// M4 由用户案例 + 权威依据替换为真实规则库；web 与 function 共用同一份 JSON。
export const rules = rulesJson as unknown as RiskRule[];

export function ruleById(id: string): RiskRule | undefined {
  return rules.find((r) => r.id === id);
}