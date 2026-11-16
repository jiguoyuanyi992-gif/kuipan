// 平台无关核心类型。无 React、无网络、无 Node API。
// 数据契约权威来源：AGENTS.md「数据契约」节。

export type RuleScene = "rent" | "internship" | "common";
export type ContractType = "rent" | "internship" | "other";
export type Severity = "high" | "medium" | "low";

export interface LegalBasis {
  law: string;
  article: string;
  quote: string;
  source: string;
  effectiveOn?: string;
}

export interface DetectSpec {
  // 任一正则命中即存在性命中
  anyRegex?: string[];
  // 每个内层数组需全部关键词同现（组内 AND），任一组满足即命中（组间 OR）
  allKeywords?: string[][];
  // 每个内层数组代表一类必备条款的多种表述；整份合同中该组零命中 → 缺失性命中
  absentOf?: string[][];
}

export interface RiskRule {
  id: string;
  scene: RuleScene;
  title: string;
  severity: Severity;
  detect: DetectSpec;
  traits: string[];
  why: string;
  askTalk: string;
  sourceCase?: string;
  legalBasis: LegalBasis[];
  // 默认 false；只有用户本人复核后才能置 true，执行层不得自行置 true。
  verified: boolean;
  reviewer?: string;
  reviewNote?: string;
}

export interface TrapEntry {
  id: string;
  scene: RuleScene;
  oneLiner: string;
  // 脱敏案例；无真实案例时留空字符串，前端隐藏该区块，不得编造。
  story: string;
  traits: string[];
  beforeSign: string[];
  afterHit: string[];
  legalBasis: LegalBasis[];
  verified: boolean;
  reviewer?: string;
}

export type BlockKind = "clause" | "preamble" | "signature";

export interface Block {
  // 稳定编号，如 "b1"；切块与编号由本地完成，模型只引用 blockId。
  id: string;
  index: number;
  text: string;
  // 原文字符区间，左闭右开 [start, end)，不得越界。
  start: number;
  end: number;
  kind: BlockKind;
}

export type ContractSource = "paste" | "docx" | "pdf" | "photo" | "example";

export interface ContractDoc {
  type: ContractType;
  text: string;
  blocks: Block[];
  source: ContractSource;
  fileName?: string;
  // 扫描版 PDF 提取不到文字时为 true，前端提示改用粘贴。
  scanned?: boolean;
}

export type FindingKind = "exist" | "absent" | "ai";

export interface Finding {
  ruleId: string;
  // 缺失性命中为 null（针对整份合同）；存在性/模型命中指向具体块。
  blockId: string | null;
  kind: FindingKind;
  severity: Severity;
  title: string;
  explanation: string;
  askTalk: string;
  rewrite?: string;
  // true = 模型独立建议（其他可疑条款），不附法律依据，前端弱样式。
  aiSuggested: boolean;
  // 命中句在原文中的区间（存在性二次定位用），左闭右开。
  matchStart?: number;
  matchEnd?: number;
  matchedText?: string;
  // 永远只从规则库按 ruleId 读取，模型不参与生成。
  legalBasis: LegalBasis[];
  verified: boolean;
}

// 模型原始返回项（硬校验对象）。模型只给 ruleId + blockId，不给字符 offset。
export interface ModelFinding {
  ruleId: string;
  blockId: string;
  explanation: string;
  askTalk: string;
  rewrite: string;
  aiSuggested: boolean;
}

export type OverallLevel = "high" | "medium" | "low" | "none";

export interface OverallRisk {
  level: OverallLevel;
  // 档位名：需重点留意 / 建议留意 / 暂未发现明显风险（不得出现「安全」）。
  label: string;
  // 理由句由本地模板拼接，占位词取规则库 title，不由模型填。
  reason: string;
}

export interface AmountTerms {
  // 本地抽取，供概览卡使用；发模型时换成带比例占位符。
  monthlyRent?: number;
  deposit?: number;
  depositMonths?: number;
  penalty?: number;
  penaltyMonths?: number;
  termMonths?: number;
  currency: string;
}

export interface RedactionResult {
  // 脱敏后文本（姓名/身份证/手机号/住址已移除，金额/期限换比例占位符）。
  redactedText: string;
  // 本地抽取的金额与期限，供概览卡。
  amounts: AmountTerms;
  // 被移除的敏感项类别计数（不含原值，绝不回显）。
  removed: { name: number; idCard: number; phone: number; address: number };
}