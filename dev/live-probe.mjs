// 线上 Function + 百炼真实响应质量抽查（只用编造示例合同）。
// 用法：node dev/live-probe.mjs [baseUrl]
import { readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "https://qianqian-yicha-odzma4gogrf.qoder.zone";
const rules = JSON.parse(
  readFileSync("src/core/rules/rules.json", "utf8"),
);

const demo = readFileSync("src/core/examples/demo.ts", "utf8");
const text = demo.match(/`([\s\S]*?)`/)[1];
const pieces = text
  .split(/\n\s*\n/)
  .map((p) => p.replace(/\s+/g, " ").trim())
  .filter((p) => p.length > 0);
const blocks = pieces.map((t, i) => ({ id: `b${i + 1}`, text: t }));

const ruleLines = rules
  .map((r) => `- ruleId=${r.id}｜${r.title}｜识别特征：${r.traits.join("；")}`)
  .join("\n");
const blockLines = blocks.map((b) => `[${b.id}] ${b.text}`).join("\n");

const prompt = [
  "你是合同风险条款识别助手。下面给出若干规则（含白话识别特征）和一份已脱敏合同的条款块。",
  "任务：判断每个条款块是否语义命中某条规则；命中则返回该 ruleId 与 blockId。",
  "",
  "严格约束：",
  "1. 禁止引用、罗列或杜撰任何法律条文、法条编号、案例号。法律依据由系统另行提供，与你无关。",
  "2. 只返回 ruleId 与 blockId，禁止返回字符 offset、start、end、位置索引等任何定位字段。",
  "3. 措辞用「存在……风险，建议……」，不下法律结论，不使用「违法/无效/一定/肯定/必然/安全/保证/承诺/没问题」等词。",
  "4. 未命中任何规则但你认为可疑的条款，aiSuggested=true、ruleId 留空字符串，措辞「建议留意」。",
  "5. rewrite 为条款改写建议，仅供参考；askTalk 为签约前可以问对方的话。",
  "",
  "只输出 JSON，格式：",
  '{"contractType":"rent|internship|other","findings":[{"ruleId":"","blockId":"b1","explanation":"","askTalk":"","rewrite":"","aiSuggested":false}]}',
  "",
  "规则列表：",
  ruleLines,
  "",
  "条款块：",
  blockLines,
].join("\n");

console.log("blocks:", blocks.length, "promptChars:", prompt.length);
const t0 = Date.now();
const res = await fetch(`${BASE}/functions/v1/app/analyze`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: BASE,
    Referer: `${BASE}/`,
  },
  body: JSON.stringify({ prompt }),
});
const ms = Date.now() - t0;
const json = await res.json();
console.log("status:", res.status, "ms:", ms, "ok:", json.ok);
const content = json.content ?? "";
console.log("raw content (first 600):", content.slice(0, 600));
let parsed = null;
try {
  parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
} catch (e) {
  console.log("JSON parse FAILED:", e.message);
}
if (parsed) {
  console.log("contractType:", parsed.contractType);
  console.log("findings:", parsed.findings?.length);
  for (const f of parsed.findings ?? []) {
    console.log(" -", f.ruleId || "(ai)", f.blockId, f.aiSuggested);
  }
}
