import { CONTRACT_TYPES } from "../types";
import type { ContractType, RiskRule, RuleScene } from "../types";

// 每类 6～10 个关键词，命中最多者胜；全 0 返回 other。
// 边界避重叠：plan 不收「办卡/充值」（归 prepaid）、cert 不收「驾校/驾驶」（归 driving）、
// loan 用「借款/本金/利息」等借贷词，培训服务合同里的「培训费/报名费」归 cert。
// 某类内容被跳过时关键词表留空数组，判定自然落不到该类。
const TYPE_KEYWORDS: Record<Exclude<ContractType, "other">, string[]> = {
  rent: ["租金", "押金", "出租", "承租", "房东", "房屋", "租期", "月租"],
  internship: [
    "实习",
    "兼职",
    "用人单位",
    "劳务",
    "试用期",
    "工资",
    "薪酬",
    "岗位",
    "离职",
  ],
  loan: ["借款", "贷款", "放款", "本金", "利息", "年化", "出借人", "借款人", "分期还款"],
  plan: ["套餐", "话费", "宽带", "流量", "资费", "订阅", "合约期", "销户", "月费", "自动续费"],
  cert: ["考研", "考公", "职业资格", "资格证", "包过", "报名费", "教材费", "考试费", "培训费", "课程费"],
  insurance: ["保险", "投保人", "被保险人", "保险人", "保费", "保单", "免责条款", "等待期", "免赔额", "犹豫期"],
  prepaid: ["预付卡", "办卡", "充值", "健身房", "美容", "美发", "私教", "疗程", "次卡", "门店"],
  carrental: ["租车", "取车", "还车", "车辆", "里程", "违章", "自驾", "车损", "折旧费", "异地还车"],
  driving: ["驾校", "驾驶证", "驾照", "教练", "练车", "学车", "科目", "补考", "驾驶培训", "训练场地"],
};

// 本地类型判定（兜底）。M3 由模型主判，可手动改选后重新分析。
// 同分时按 CONTRACT_TYPES 顺序取先者（沿用旧版 rent 优先于 internship 的行为）。
export function detectType(text: string): ContractType {
  let best: ContractType = "other";
  let bestScore = 0;
  for (const type of CONTRACT_TYPES) {
    if (type === "other") continue;
    const keywords = TYPE_KEYWORDS[type];
    const score = keywords.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return best;
}

// 「其他」走通用规则集；其余类型各自叠加 common。
export function scenesFor(type: ContractType): RuleScene[] {
  if (type === "other") return ["common"];
  return [type, "common"];
}

export function rulesForScene(rules: RiskRule[], type: ContractType): RiskRule[] {
  const allowed = new Set<RuleScene>(scenesFor(type));
  return rules.filter((r) => allowed.has(r.scene));
}