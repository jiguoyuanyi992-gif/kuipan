import type { ContractType, RiskRule, RuleScene } from "../types";

const RENT_HINTS = ["租金", "押金", "出租", "承租", "房东", "房屋", "租期", "月租"];
const INTERN_HINTS = [
  "实习",
  "兼职",
  "用人单位",
  "劳务",
  "试用期",
  "工资",
  "薪酬",
  "岗位",
  "离职",
];

// 本地类型判定（兜底）。M3 由模型主判，可手动改选后重新分析。
export function detectType(text: string): ContractType {
  const rent = RENT_HINTS.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
  const intern = INTERN_HINTS.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
  if (rent === 0 && intern === 0) return "other";
  return rent >= intern ? "rent" : "internship";
}

// 「其他」走通用规则集；租房/实习各自叠加 common。
export function scenesFor(type: ContractType): RuleScene[] {
  switch (type) {
    case "rent":
      return ["rent", "common"];
    case "internship":
      return ["internship", "common"];
    default:
      return ["common"];
  }
}

export function rulesForScene(rules: RiskRule[], type: ContractType): RiskRule[] {
  const allowed = new Set<RuleScene>(scenesFor(type));
  return rules.filter((r) => allowed.has(r.scene));
}