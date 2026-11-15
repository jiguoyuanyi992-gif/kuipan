import type { AmountTerms, RedactionResult } from "../types";

const NUM = String.raw`([\d,]+(?:\.\d+)?)`;
const RENT_RE = new RegExp(
  String.raw`(?:每月租金|租金每月|月租金|月租)[为是约]?(?:人民币)?${NUM}元`,
  "g",
);
const DEPOSIT_RE = new RegExp(String.raw`押金[为是约]?(?:人民币)?${NUM}元`, "g");
const PENALTY_RE = new RegExp(String.raw`违约金[为是约]?(?:人民币)?${NUM}元`, "g");
const TERM_RE = new RegExp(
  String.raw`(?:租期|租赁期限|实习期|合同期限|期限)[为是约]?([\d,]+)个月`,
  "g",
);

const ID_RE = /\d{17}[\dXx]|\d{15}/g;
const PHONE_RE = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const NAME_RE =
  /(甲方|乙方|出租方|承租方|承租人|出租人|用人单位|劳动者|实习生|员工|学生|姓名)([（(][^）)\n]{0,10}[）)])?[：:]\s*([一-龥]{2,4})(?=[，,。\s；;（(]|$)/g;
const ADDR_RE =
  /(住址|地址|住所|居住地址|房屋地址|房屋坐落|坐落)[：:]\s*([^，,。\n；;]{4,50})/g;

function parseNum(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function firstMatch(re: RegExp, text: string): number | undefined {
  re.lastIndex = 0;
  const m = re.exec(text);
  return m ? parseNum(m[1]) : undefined;
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

// 先从原文本地抽取金额与期限（供概览卡，永不离开浏览器）。
export function extractAmounts(text: string): AmountTerms {
  const monthlyRent = firstMatch(RENT_RE, text);
  const deposit = firstMatch(DEPOSIT_RE, text);
  const penalty = firstMatch(PENALTY_RE, text);
  const termMonths = firstMatch(TERM_RE, text);
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
    currency: "CNY",
  };
}

function removeSensitive(text: string): {
  text: string;
  removed: RedactionResult["removed"];
} {
  const removed = { name: 0, idCard: 0, phone: 0, address: 0 };
  let out = text;
  out = out.replace(ID_RE, () => {
    removed.idCard++;
    return "[身份证号已移除]";
  });
  out = out.replace(PHONE_RE, () => {
    removed.phone++;
    return "[手机号已移除]";
  });
  out = out.replace(NAME_RE, (_m, label, paren, _name) => {
    removed.name++;
    return `${label}${paren ?? ""}：[姓名已移除]`;
  });
  out = out.replace(ADDR_RE, (_m, label) => {
    removed.address++;
    return `${label}：[住址已移除]`;
  });
  return { text: out, removed };
}

// 金额换比例占位符（押金=月租×N），不整体抹掉，模型仍能判断倍数/比例风险。
function replaceAmounts(text: string, a: AmountTerms): string {
  let out = text;
  out = out.replace(DEPOSIT_RE, () =>
    a.depositMonths !== undefined
      ? `押金=月租×${a.depositMonths}`
      : "押金=[金额已脱敏]",
  );
  out = out.replace(PENALTY_RE, () =>
    a.penaltyMonths !== undefined
      ? `违约金=月租×${a.penaltyMonths}`
      : "违约金=[金额已脱敏]",
  );
  out = out.replace(RENT_RE, () => "月租");
  return out;
}

// 本地脱敏：移除姓名/身份证/手机号/住址；金额期限先抽取再换比例占位符。
// 原始文件不上传、不落盘；本函数纯文本进、纯文本出。
export function redact(text: string): RedactionResult {
  const amounts = extractAmounts(text);
  const { text: cleaned, removed } = removeSensitive(text);
  const redactedText = replaceAmounts(cleaned, amounts);
  return { redactedText, amounts, removed };
}