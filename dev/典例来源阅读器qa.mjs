// 2026-11-18 典例来源本地托管+内置阅读器验收 QA：弹层渲染、翻页、关闭、双视口、控制台 0 error。
// 用法：node dev/典例来源阅读器qa.mjs [url]（配合 npm run preview；线上复验传 https 地址）
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const URL_BASE = process.argv[2] ?? "http://127.0.0.1:4173/";
const live = /^https:/.test(URL_BASE);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9227;
const outDir = join(tmpdir(), "qqy-docviewer");
mkdirSync(outDir, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), "qqy-docviewer-profile")}`,
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
      const page = (await res.json()).find((t) => t.type === "page");
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
function record(scope, step, ok, detail = "") {
  results.push({ scope, step, ok, detail: String(detail).slice(0, 260) });
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

async function setVp(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
}

// 进入照契 → 选类型 → 点第一个「典例来源」。返回是否成功。
const OPEN_FLOW = (typeName) => `(() => {
  const click=(t)=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes(t));if(!b)return false;b.click();return true;};
  if(!click('照契')) return {err:'no nav 照契'};
  return new Promise((resolve)=>{
    setTimeout(()=>{
      if(!click(${JSON.stringify(typeName)})) { resolve({err:'no tab'}); return; }
      setTimeout(()=>{
        const ok=click('典例来源');
        resolve({openedTile:ok});
      },1000);
    },900);
  });
})()`;

// 等弹层渲染完成：canvas 有尺寸 + 页码指示。
const WAIT_RENDER = `(() => new Promise((resolve)=>{
  const t0=performance.now();
  const iv=setInterval(()=>{
    const dlg=document.querySelector('[role="dialog"]');
    if(!dlg){ if(performance.now()-t0>20000){clearInterval(iv);resolve({err:'no dialog'});} return; }
    if(dlg.innerText.includes('加载失败')){clearInterval(iv);resolve({err:'load-failed'});return;}
    const c=dlg.querySelector('canvas');
    const ind=dlg.innerText.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
    if(c && c.width>100 && c.height>100 && ind){clearInterval(iv);resolve({w:c.width,h:c.height,cur:+ind[1],total:+ind[2]});}
    else if(performance.now()-t0>25000){clearInterval(iv);resolve({err:'timeout',hasCanvas:!!c,cw:c?c.width:0});}
  },100);
}))()`;

async function runViewerChecks(vpName, w, h) {
  await setVp(w, h);
  await send("Page.navigate", { url: URL_BASE });
  await sleep(live ? 4000 : 1500);
  const flow = await evaluate(OPEN_FLOW("租房"));
  record(vpName, "open-tile", !!flow.openedTile, JSON.stringify(flow));
  if (!flow.openedTile) return;
  const r = await evaluate(WAIT_RENDER);
  record(vpName, "canvas-rendered", !!r && !r.err && r.w > 100 && r.total > 0, JSON.stringify(r));
  record(vpName, "target-page-6", !!r && r.cur === 6, `cur=${r?.cur}`); // 首个租房典例=广东示范文本 p6（押金抵扣/返还）
  await shot(`viewer-${vpName}`);
  if (r && !r.err) {
    // 翻页：下一页 → cur+1；上一页回来。
    await evaluate(`(() => {const b=[...document.querySelectorAll('[role="dialog"] button')].find(x=>x.innerText.includes('下一页'));b.click();return true;})()`);
    await sleep(1500);
    const r2 = await evaluate(`(() => {const d=document.querySelector('[role=\\"dialog\\"]');const m=d.innerText.match(/(\\d+)\\s*\\/\\s*(\\d+)/);const c=d.querySelector('canvas');return {cur:+m[1],w:c.width};})()`);
    record(vpName, "next-page", r2.cur === r.cur + 1 && r2.w > 100, JSON.stringify(r2));
    await evaluate(`(() => {const b=[...document.querySelectorAll('[role="dialog"] button')].find(x=>x.innerText.includes('上一页'));b.click();return true;})()`);
    await sleep(1200);
    const r3 = await evaluate(`(() => {const d=document.querySelector('[role=\\"dialog\\"]');const m=d.innerText.match(/(\\d+)\\s*\\/\\s*(\\d+)/);return +m[1];})()`);
    record(vpName, "prev-page", r3 === r.cur, `cur=${r3}`);
    // Esc 关闭
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(400);
    const gone = await evaluate(`!document.querySelector('[role="dialog"]')`);
    record(vpName, "esc-close", !!gone);
  }
}

await runViewerChecks("1280x900", 1280, 900);
await runViewerChecks("375x812", 375, 812);

const noise = ["/functions/v1/app"];
const appErrors = consoleErrors.filter((e) => !noise.some((p) => e.includes(p)));
record("console", "0-error", appErrors.length === 0, appErrors.join(" | "));

writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log("screenshots:", outDir);
ws.close();
chrome.kill();
process.exit(results.filter((r) => !r.ok).length ? 1 : 0);
