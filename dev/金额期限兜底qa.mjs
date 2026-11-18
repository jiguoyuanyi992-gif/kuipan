// 2026-11-18 指令「金额期限提取兜底」验收 QA（线上真实模型）。
// 用法：node dev/金额期限兜底qa.mjs https://kuipan-odzma4gogrf.qoder.zone
// 用例 A：本地正则抽不到的特殊写法（租金:1500元/月、保证金、服务期起止日期）→ 模型兜底应填上数值。
// 用例 B：高命中演示合同 → 本地正则值优先，不被模型覆盖、不回归。
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const URL_BASE = process.argv[2] ?? "http://127.0.0.1:4173/";
const live = /^https:/.test(URL_BASE);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9226;
const outDir = join(tmpdir(), "qqy-terms");
mkdirSync(outDir, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), "qqy-terms-profile")}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "about:blank",
]);

async function getWsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("chrome devtools not reachable");
}

const ws = new WebSocket(await getWsUrl());
await new Promise((r) => (ws.onopen = r));
let msgId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
  if (m.method === "Runtime.exceptionThrown")
    consoleErrors.push(m.params.exceptionDetails?.text ?? "exception");
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error")
    consoleErrors.push(`${m.params.entry.text} @ ${m.params.entry.url ?? ""}`);
};
function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const m = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (m.result?.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails));
  return m.result?.result?.value;
}
async function shot(name) {
  const m = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(m.result.data, "base64"));
}

const results = [];
function record(step, ok, detail = "") {
  results.push({ step, ok, detail: String(detail).slice(0, 300) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}  ${String(detail).slice(0, 200)}`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

async function gotoHome() {
  await send("Page.navigate", { url: URL_BASE });
  await sleep(live ? 4000 : 1400);
}

// 概览卡四字段读取（dt 标签 → dd 文本）。
const READ_AMOUNTS = `(() => {
  const dls=[...document.querySelectorAll('dl')];
  for(const dl of dls){
    const dts=[...dl.querySelectorAll('dt')].map(x=>x.textContent.trim());
    if(dts.includes('押金')&&dts.includes('期限')){
      const out={};
      [...dl.children].forEach(div=>{
        const dt=div.querySelector('dt')?.textContent.trim();
        const dd=div.querySelector('dd')?.textContent.trim();
        if(dt) out[dt]=dd;
      });
      return out;
    }
  }
  return null;
})()`;

async function waitForAmounts(pred, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const a = await evaluate(READ_AMOUNTS);
    if (a && pred(a)) return a;
    await sleep(400);
  }
  return await evaluate(READ_AMOUNTS);
}

const SPECIAL_TEXT = `房屋使用协议（示例，虚构）
第一条 费用
租金:1500元/月，乙方另付保证金4500元，任何一方提前解约需支付违约金3000元。

第二条 期限
服务期自2024年1月1日起至2024年12月31日止。

第三条 其他
承租期内水电费由乙方承担。
`;

const PASTE_AND_RUN = `(async (text) => {
  const ta=document.querySelector('textarea');
  if(!ta) return {err:'no textarea'};
  const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
  setter.call(ta,text);
  ta.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(r=>setTimeout(r,150));
  const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('开始分析'));
  if(!b) return {err:'no analyze button'};
  b.click();
  return {ok:true};
})`;

// —— 用例 A：特殊写法 → 模型兜底 ——
await gotoHome();
const pasted = await evaluate(`${PASTE_AND_RUN}(${JSON.stringify(SPECIAL_TEXT)})`);
if (pasted.err) {
  record("A-粘贴触发分析", false, pasted.err);
} else {
  const a = await waitForAmounts(
    (x) => x["期限"] && x["期限"] !== "—",
    live ? 30_000 : 15_000,
  );
  record("A-概览卡出现", !!a, JSON.stringify(a));
  record("A-月租兜底=¥1,500", a && a["月租 / 金额"] === "¥1,500", a?.["月租 / 金额"]);
  record("A-押金兜底=¥4,500（月租×3）", a && a["押金"]?.includes("¥4,500") && a["押金"]?.includes("×3"), a?.["押金"]);
  record("A-期限兜底=12 个月", a && a["期限"] === "12 个月", a?.["期限"]);
  record("A-违约金=¥3,000", a && a["违约金"] === "¥3,000", a?.["违约金"]);
  const degraded = await evaluate("document.body.innerText.includes('智能分析暂不可用')");
  record("A-未走降级（模型返回已合并）", !degraded);
  await shot("amounts-A-special-fallback");
}

// —— 用例 B：高命中演示合同，本地正则值优先 ——
await gotoHome();
const demo = await evaluate(`(() => {
  const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('高命中演示合同'));
  if(!b) return {err:'no demo button'};
  b.click();
  return {ok:true};
})()`);
if (demo.err) {
  record("B-点击演示合同", false, demo.err);
} else {
  const b = await waitForAmounts(
    (x) => x["押金"] && x["押金"] !== "—",
    live ? 30_000 : 15_000,
  );
  record("B-概览卡出现", !!b, JSON.stringify(b));
  record("B-正则优先：月租未被模型覆盖", b && b["月租 / 金额"] === "¥2,000", b?.["月租 / 金额"]);
  record("B-正则优先：押金含倍数", b && b["押金"]?.includes("×") , b?.["押金"]);
  await shot("amounts-B-demo-local-first");
}

// —— 控制台 ——
const appErrors = consoleErrors.filter((e) => !/favicon|net::ERR_/i.test(e));
record("控制台应用级 0 error", appErrors.length === 0, appErrors.join(" | "));

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
ws.close();
chrome.kill();
process.exit(results.every((r) => r.ok) ? 0 : 1);
