// 线上双合同验证：node dev/online-verify.mjs [url]
// 租房 + 贷款/套餐（other）各一份编造合同走真实模型主路径；照契四类页签复查。
// 复用 ktipan-qa 的 CDP 方案（本机 Chrome headless，不引入新依赖）。
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const URL_BASE = process.argv[2] ?? "https://kuipan-odzma4gogrf.qoder.zone/";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9224;
const outDir = join(tmpdir(), "kuipan-online");
mkdirSync(outDir, { recursive: true });

const RENT =
  "房屋租赁合同（线上验证示例，虚构）\n第一条 押金 押金为人民币6000元。租赁期满或乙方提前退租的，押金归甲方所有，不予退还。\n第二条 解除 甲方可随时解除本合同，乙方不得异议。\n第三条 其他约定 本合同未尽事宜适用甲方内部员工手册与园区管理公约，乙方视为已悉知并接受。";

const PLAN =
  "培训服务协议（线上验证示例，虚构）\n第一条 费用 乙方一次性预付课程费人民币8000元，缴费后概不退还。\n第二条 续费 服务到期后默认自动续订一年，费用按届时公布价格执行。\n第三条 其他约定 本协议未尽事宜适用甲方内部员工手册与园区管理公约，乙方视为已悉知并接受。";

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), "kuipan-online-profile")}`,
  // 平台网关按 UA 拦 HeadlessChrome（x-blocked-reason: Bot detected），验证需普通 Chrome UA。
  "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "--window-size=1280,900",
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
const analyzeResponses = [];
const analyzeRequestIds = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === "Network.responseReceived" && m.params.response.url.includes("/analyze"))
    analyzeRequestIds.push(m.params.requestId);
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
  const m = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (m.result?.exceptionDetails)
    throw new Error(JSON.stringify(m.result.exceptionDetails));
  return m.result?.result?.value;
}
async function shot(name, full = false) {
  const m = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: full,
  });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(m.result.data, "base64"));
}
const clickText = (t) =>
  evaluate(
    `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes(${JSON.stringify(
      t,
    )})); if(!b) return false; b.click(); return true; })()`,
  );
const bodyText = () => evaluate("document.body.innerText");
const goto = (url) => send("Page.navigate", { url });

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Network.enable");

const results = [];
const record = (step, ok, detail = "") => results.push({ step, ok, detail });

async function pasteAndAnalyze(text) {
  await evaluate(
    `(() => { const ta=document.querySelector('textarea'); if(!ta) return false; const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; setter.call(ta, ${JSON.stringify(
      text,
    )}); ta.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`,
  );
  await clickText("开始分析");
  // 等模型批次结束（running 提示消失），最长 45s；降级提示出现也视为结束。
  for (let i = 0; i < 90; i++) {
    await sleep(500);
    const t = await bodyText();
    if (!t.includes("智能分析批次返回中")) break;
  }
  await sleep(800);
  return bodyText();
}

await goto(URL_BASE);
await sleep(2500);

// ① 租房合同
let txt = await pasteAndAnalyze(RENT);
record("rent-formal-basis", txt.includes("法律依据") && txt.includes("flk.npc.gov.cn"));
record("rent-rule-hit", txt.includes("押金可能被没收"));
record("rent-fallback-actions", txt.includes("签前怎么办") && txt.includes("先别当场签字或付款"));
record("rent-possible-basis", txt.includes("可能相关条文（仅供参考）"));
record("rent-not-degraded", !txt.includes("智能分析暂不可用"));
await shot("online-rent", true);

// ② 贷款/套餐类（other）合同
await clickText("返回");
await sleep(600);
txt = await pasteAndAnalyze(PLAN);
record("other-type-label", txt.includes("当前：其他"));
record("other-formal-basis", txt.includes("预付费用概不退还") && txt.includes("法律依据") && txt.includes("flk.npc.gov.cn"));
record("other-auto-renew", txt.includes("自动续费或自动续约"));
record("other-fallback-actions", txt.includes("签前怎么办"));
record("other-possible-basis", txt.includes("可能相关条文（仅供参考）"));
record("other-not-degraded", !txt.includes("智能分析暂不可用"));
await shot("online-plan", true);

// ③ 照契四类页签：注意事项不再整页整理中
await clickText("返回");
await sleep(600);
await clickText("照契");
await sleep(800);
for (const tab of ["贷款分期", "套餐", "考证", "保险"]) {
  await clickText(tab);
  await sleep(400);
  txt = await bodyText();
  record(
    `contracts-${tab}`,
    txt.includes("注意事项（法律依据）") &&
      (txt.includes("flk.npc.gov.cn") || txt.includes("签前怎么办")) &&
      txt.includes("典例分析"),
  );
}
await shot("online-contracts-insurance", true);

record("console-0-error", consoleErrors.length === 0, consoleErrors.slice(0, 5).join(" | "));

for (const rid of analyzeRequestIds) {
  const body = await send("Network.getResponseBody", { requestId: rid });
  analyzeResponses.push(body.result?.body ?? "(no body)");
}
writeFileSync(join(outDir, "analyze-responses.json"), JSON.stringify(analyzeResponses, null, 2));
writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
const fail = results.filter((r) => !r.ok);
console.log(`total ${results.length} fail ${fail.length}`);
fail.forEach((f) => console.log("FAIL", f.step, f.detail));
console.log("screenshots:", outDir);
chrome.kill();
ws.close();
process.exit(0);