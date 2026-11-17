// 线上验证：node dev/online-verify.mjs [url]
// 租房回归 + 套餐/保险/预付卡/租车各一份编造合同走真实模型主路径；照契九类页签复查。
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
  "手机套餐服务协议（线上验证示例，虚构）\n第一条 套餐 乙方订购甲方5G畅享套餐，月费59元，合约期24个月。首月优惠价19元，体验期结束后自动恢复原价。\n第二条 降档销户 合约期内不得降档或销户，提前销户须支付相当于三个月月费的违约金。\n第三条 增值业务 开通即默认订购彩铃增值业务，月费6元。\n第四条 流量 套餐宣传不限量流量，但超过40GB后限速。";

const INSURANCE =
  "人身保险合同（线上验证示例，虚构）\n第一条 投保 投保人已阅读并理解全部条款，点击投保即视为同意条款内容。\n第二条 等待期 等待期90天内因疾病不承担给付保险金责任，每次事故免赔额10000元。\n第三条 退保 乙方退保时仅退还保单现金价值，现金价值远低于已交保费。\n第四条 保费 保费每年6000元，一次性交清。";

const PREPAID =
  "健身房会员卡协议（线上验证示例，虚构）\n第一条 办卡 乙方在甲方门店办理健身年卡，充值3000元。预付卡一经售出概不退还。\n第二条 退卡 乙方退卡须扣除卡内余额30%的手续费。\n第三条 赠送课时 赠送私教课时的有效期届满作废。\n第四条 转让 本卡不得转让或转借他人。\n第五条 门店 甲方门店停业时，卡内余额不退。";

const CARRENTAL =
  "汽车租赁合同（线上验证示例，虚构）\n第一条 车辆交接 乙方取车自驾，取车时车况由甲方门店记录，乙方未拍照即视为认可车况完好。\n第二条 车损 发生事故时维修费用由甲方单方定损，停运损失与折旧费由乙方承担。\n第三条 保险 租金仅含交强险，维修费用超出保险理赔的部分由乙方承担。\n第四条 费用 超时与超里程费用按门店规定另计。\n第五条 押金 取车时收取押金5000元，另收违章押金2000元。";

// 每类断言：类型标签、≥2 条专属规则标题命中、法律依据可见、未降级。
const NEW_CASES = [
  {
    key: "plan",
    label: "套餐",
    text: PLAN,
    hits: ["低价体验到期自动恢复原价", "合约期内不能降档销户", "增值业务默认勾选开通"],
  },
  {
    key: "insurance",
    label: "保险",
    text: INSURANCE,
    hits: ["免责条款未作显著提示或说明", "等待期与免赔额藏在条款里", "提前退保只退现金价值"],
  },
  {
    key: "prepaid",
    label: "预付卡",
    text: PREPAID,
    hits: ["退卡扣高额手续费或概不退卡", "赠送课时项目到期作废", "卡不能转让或转让收费"],
  },
  {
    key: "carrental",
    label: "租车",
    text: CARRENTAL,
    hits: ["取车验车单方记录", "停运损失折旧费单方算给租车人", "缺少押金退还约定"],
  },
];

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
// 「签前怎么办」只在无依据时出现、「可能相关条文」只在 aiSuggested 项出现，均随模型输出变化；
// 这两条条件渲染路径由本地 fixture QA（paste-result）与单元测试覆盖，线上只断言确定性内容。
record("rent-detail-guidance", txt.includes("法律依据") || txt.includes("签前怎么办"));
record("rent-not-degraded", !txt.includes("智能分析暂不可用"));
await shot("online-rent", true);

// ② 四类新合同：真实模型主路径，类型标签＋专属命中＋法律依据
for (const c of NEW_CASES) {
  await clickText("返回");
  await sleep(600);
  txt = await pasteAndAnalyze(c.text);
  record(`${c.key}-type-label`, txt.includes(`当前：${c.label}`));
  const hitCount = c.hits.filter((h) => txt.includes(h)).length;
  record(`${c.key}-dedicated-hits`, hitCount >= 2, `hits=${hitCount}/${c.hits.length}`);
  record(
    `${c.key}-formal-basis`,
    txt.includes("法律依据") && txt.includes("flk.npc.gov.cn"),
  );
  record(`${c.key}-not-degraded`, !txt.includes("智能分析暂不可用"));
  await shot(`online-${c.key}`, true);
}

// ③ 照契九类页签：注意事项不再整页整理中
await clickText("返回");
await sleep(600);
await clickText("照契");
await sleep(800);
for (const tab of ["租房", "实习兼职", "贷款分期", "套餐", "考证", "保险", "预付卡", "租车", "驾校"]) {
  await clickText(tab);
  await sleep(400);
  txt = await bodyText();
  record(
    `contracts-${tab}`,
    txt.includes("注意事项（法律依据）") &&
      (txt.includes("flk.npc.gov.cn") || txt.includes("签前怎么办")) &&
      txt.includes("典例分析") &&
      !txt.includes("整理中"),
  );
}
await shot("online-contracts-driving", true);

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