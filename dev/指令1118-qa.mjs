// 2026-11-18 指令验收 QA：首页首屏可见性 + 导航副标题 + 判官提示条三态。
// 用法：node dev/指令1118-qa.mjs [url]（配合 npm run preview + node dev/function-fixture.mjs）
// 环境变量：QQY_EXPECT=degraded 时改测 unavailable 提示条。
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const URL_BASE = process.argv[2] ?? "http://127.0.0.1:4173/";
// 线上模式：真实模型延迟天然可捕捉 running；不打本地 Fetch 拦截。
// 平台网关按 UA 拦 headless，必须覆盖为普通 Chrome UA。
const live = /^https:/.test(URL_BASE);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9224;
const outDir = join(tmpdir(), "qqy-1118");
mkdirSync(outDir, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), "qqy-1118-profile")}`,
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
// Fetch 拦截：analyze 请求在页面侧 pause 指定毫秒后原样转发，让 running 态可稳定捕捉；
// failAnalyze 时直接回 500，模拟智能分析不可用。
let throttleMs = 0;
let failAnalyze = false;
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
  if (m.method === "Fetch.requestPaused") handlePaused(m.params).catch(() => {});
};
async function handlePaused({ requestId, request }) {
  const isAnalyze = /\/analyze(\?|$)/.test(request.url);
  if (isAnalyze && failAnalyze) {
    await send("Fetch.fulfillRequest", {
      requestId,
      responseCode: 500,
      responseHeaders: [{ name: "content-type", value: "application/json" }],
      body: Buffer.from(JSON.stringify({ ok: false, error: "qa_injected_500" })).toString("base64"),
    });
    return;
  }
  if (!isAnalyze || throttleMs === 0) {
    await send("Fetch.continueRequest", { requestId });
    return;
  }
  await sleep(throttleMs);
  const init = { method: request.method, headers: request.headers };
  if (request.postData !== undefined) init.body = request.postData;
  const res = await fetch(request.url, init);
  const body = await res.arrayBuffer();
  const headers = [];
  for (const [k, v] of res.headers.entries()) headers.push({ name: k, value: v });
  await send("Fetch.fulfillRequest", {
    requestId,
    responseCode: res.status,
    responseHeaders: headers,
    body: Buffer.from(body).toString("base64"),
  });
}
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
const bodyText = () => evaluate("document.body.innerText");

const results = [];
function record(scope, step, ok, detail = "") {
  results.push({ scope, step, ok, detail: String(detail).slice(0, 260) });
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

async function setVp(width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: false,
  });
}
async function gotoHome() {
  await send("Page.navigate", { url: URL_BASE });
  await sleep(live ? 4000 : 1400);
}

// —— 三态提示条（点击演示合同，页面内轮询抓 running→done） ——
const BANNER_PROBE = `(() => {
  const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('高命中演示合同'));
  if(!b) return Promise.resolve({err:'no demo button'});
  b.click();
  return new Promise((resolve)=>{
    const out={};
    const t0=performance.now();
    const iv=setInterval(()=>{
      const el=document.querySelector('.judge-banner');
      if(el){
        const r=el.getBoundingClientRect();
        const st=el.getAttribute('data-status');
        if(st==='running' && !out.running)
          out.running={text:el.innerText.replace(/\\n/g,' '),h:r.height,brush:!!el.querySelector('.judge-brush')};
        if(st==='done' && !out.done)
          out.done={text:el.innerText.replace(/\\n/g,' '),h:r.height,stamp:!!el.querySelector('.judge-stamp')};
      }
      if(out.done||performance.now()-t0>25000){clearInterval(iv);resolve(out);}
    },20);
  });
})()`;

// —— degraded：unavailable 提示条 ——
const UNAVAIL_PROBE = `(() => {
  const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('高命中演示合同'));
  if(!b) return Promise.resolve({err:'no demo button'});
  b.click();
  return new Promise((resolve)=>{
    const t0=performance.now();
    const iv=setInterval(()=>{
      const el=document.querySelector('.judge-banner[data-status="unavailable"]');
      if(el){clearInterval(iv);resolve({text:el.innerText.replace(/\\n/g,' '),h:el.getBoundingClientRect().height});}
      else if(performance.now()-t0>20000){clearInterval(iv);resolve(null);}
    },50);
  });
})()`;

if ((process.env.QQY_EXPECT ?? "") === "degraded") {
  failAnalyze = true;
  await send("Fetch.enable", { patterns: [{ urlPattern: "*analyze*" }] });
  await setVp(1280, 900);
  await gotoHome();
  const u = await evaluate(UNAVAIL_PROBE);
  record("unavailable", "banner-shown", !!u && u.text.includes("智能分析暂不可用"), JSON.stringify(u));
  await sleep(300);
  const txt = await bodyText();
  record("unavailable", "page-not-blank", txt.includes("分析结果") && txt.includes("需重点留意"));
  await shot("unavailable-1280");
  await setVp(375, 812);
  await gotoHome();
  await shot("unavailable-375-input");
} else {
  // —— 首屏可见性 + 导航副标题：两个视口 ——
  for (const vp of [{ n: "800x1016", w: 800, h: 1016 }, { n: "375x812", w: 375, h: 812 }]) {
    await setVp(vp.w, vp.h);
    await gotoHome();
    await shot(`input-${vp.n}`);
    const fold = await evaluate(`(() => {
      const vis=(t)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes(t));
        if(!b) return {t, found:false};
        const r=b.getBoundingClientRect();
        return {t, found:true, top:Math.round(r.top), bottom:Math.round(r.bottom), inFold:r.top>=0&&r.bottom<=innerHeight};};
      const h2=[...document.querySelectorAll('h2')].find(x=>x.textContent.includes('先用示例试试'));
      const hr=h2?h2.getBoundingClientRect():null;
      return {
        upload:vis('上传 Word / PDF / 照片'),
        demo:vis('高命中演示合同'),
        rent:vis('租房'),
        exampleHeading:hr?{top:Math.round(hr.top),inFold:hr.top>=0&&hr.bottom<=innerHeight}:null,
        innerH:innerHeight};
    })()`);
    record(vp.n, "fold-upload", fold.upload.found && fold.upload.inFold, JSON.stringify(fold.upload));
    record(vp.n, "fold-demo-btn", fold.demo.found && fold.demo.inFold, JSON.stringify(fold.demo));
    record(vp.n, "fold-example-heading", !!fold.exampleHeading && fold.exampleHeading.inFold, JSON.stringify(fold.exampleHeading));

    const nav = await evaluate(`(() => {
      const nav=document.querySelector('header nav');
      const btns=[...nav.querySelectorAll('button')];
      const tops=btns.map(b=>Math.round(b.getBoundingClientRect().top));
      const right=Math.round(nav.getBoundingClientRect().right);
      const subs=btns.map(b=>b.innerText.split('\\n')[1]||'');
      return {count:btns.length, oneRow:tops.every(t=>Math.abs(t-tops[0])<=2), right,
        overflowX:document.scrollingElement.scrollWidth>document.documentElement.clientWidth,
        subs};
    })()`);
    record(vp.n, "nav-one-row", nav.count === 3 && nav.oneRow, JSON.stringify(nav));
    record(vp.n, "nav-subs", nav.subs.join("|") === "呈上合同|收费套路|典例清单", JSON.stringify(nav.subs));
    record(vp.n, "nav-no-overflow", !nav.overflowX && nav.right <= vp.w, `right=${nav.right} w=${vp.w}`);
  }

  // —— running→done 三态（analyze 注入 2.5s 延迟：running 截图 + 375 溢出检查） ——
  if (!live) {
    throttleMs = 2500;
    await send("Fetch.enable", { patterns: [{ urlPattern: "*analyze*" }] });
  }
  await setVp(1280, 900);
  await gotoHome();
  await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('高命中演示合同')); if(!b) return false; b.click(); return true; })()`);
  await sleep(700);
  const run = await evaluate(`(() => {const el=document.querySelector('.judge-banner[data-status="running"]'); if(!el) return null; const r=el.getBoundingClientRect(); return {text:el.innerText.replace(/\\n/g,' '),h:r.height,brush:!!el.querySelector('.judge-brush')};})()`);
  record("banner", "running-shown", !!run && run.text.includes("判官审阅中") && run.brush, JSON.stringify(run));
  await shot("banner-running-1280");
  const done = await evaluate(`(() => new Promise((resolve)=>{const t0=performance.now();const iv=setInterval(()=>{const el=document.querySelector('.judge-banner[data-status="done"]'); if(el){clearInterval(iv);const r=el.getBoundingClientRect();resolve({text:el.innerText.replace(/\\n/g,' '),h:r.height,stamp:!!el.querySelector('.judge-stamp')});}else if(performance.now()-t0>25000){clearInterval(iv);resolve(null);}},50);}))()`);
  record("banner", "done-shown", !!done && done.text.includes("判决已下，共查出") && done.stamp, JSON.stringify(done));
  record("banner", "same-height", !!run && !!done && Math.abs(run.h - done.h) < 1, `${run?.h} vs ${done?.h}`);
  await sleep(4800); // 等 done 动效收尾（4s 延迟 + 0.5s 过渡）
  const quiet = await evaluate(`(() => {const el=document.querySelector('.judge-banner[data-status="done"]');const c=getComputedStyle(el);return {h:el.getBoundingClientRect().height, shadow:c.boxShadow, bg:c.backgroundColor};})()`);
  record("banner", "settled-thin-bar", String(quiet.shadow).includes("201, 58, 46"), JSON.stringify(quiet));
  await shot("banner-done-1280");

  await setVp(375, 812);
  await gotoHome();
  const b375 = await evaluate(BANNER_PROBE);
  record("banner-375", "running-shown", !!b375.running && b375.running.text.includes("判官审阅中"), JSON.stringify(b375.running));
  record("banner-375", "done-shown", !!b375.done && b375.done.text.includes("判决已下"), JSON.stringify(b375.done));
  const overflow375 = await evaluate("document.scrollingElement.scrollWidth>document.documentElement.clientWidth");
  record("banner-375", "no-page-overflow", !overflow375, String(overflow375));
  await sleep(600);
  await shot("banner-done-375");
  throttleMs = 0;
  if (!live) await send("Fetch.disable");

  // —— 改选类型重新分析：应重新进入 running ——
  if (!live) {
    throttleMs = 2500;
    await send("Fetch.enable", { patterns: [{ urlPattern: "*analyze*" }] });
  }
  await setVp(1280, 900);
  await gotoHome();
  await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('高命中演示合同')); b.click(); return true; })()`);
  await sleep(3500); // 第一次 done
  await evaluate(`(() => { const sel=document.querySelector('select'); const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set; set.call(sel,'internship'); sel.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  await sleep(400);
  const reRunning = await evaluate(`(() => {const el=document.querySelector('.judge-banner[data-status="running"]'); return el?el.innerText.replace(/\\n/g,' '):null;})()`);
  record("reanalyze", "back-to-running", !!reRunning && reRunning.includes("判官审阅中"), String(reRunning));
  if (!live) await send("Fetch.disable");
  throttleMs = 0;

  // —— prefers-reduced-motion：静态兜底，不播动效 ——
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  if (!live) {
    throttleMs = 2500;
    await send("Fetch.enable", { patterns: [{ urlPattern: "*analyze*" }] });
  }
  await gotoHome();
  await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('高命中演示合同')); b.click(); return true; })()`);
  await sleep(700);
  const rmRunning = await evaluate(`(() => {
    const el=document.querySelector('.judge-banner[data-status="running"]');
    if(!el) return null;
    const seal=el.querySelector('.judge-seal-pulse');
    return {sealAnim:getComputedStyle(seal).animationName, brushAnim:getComputedStyle(el.querySelector('.judge-brush'),'::after').animationName};
  })()`);
  record("reduced-motion", "running-static", !!rmRunning && rmRunning.sealAnim === "none" && rmRunning.brushAnim === "none", JSON.stringify(rmRunning));
  const rmDone = await evaluate(`(() => new Promise((resolve)=>{const t0=performance.now();const iv=setInterval(()=>{const el=document.querySelector('.judge-banner[data-status="done"]'); if(el){clearInterval(iv);resolve({stampAnim:getComputedStyle(el.querySelector('.judge-stamp')).animationName, bannerAnim:getComputedStyle(el).animationName});}else if(performance.now()-t0>25000){clearInterval(iv);resolve(null);}},50);}))()`);
  record("reduced-motion", "done-static", !!rmDone && rmDone.stampAnim === "none" && rmDone.bannerAnim === "none", JSON.stringify(rmDone));
  await shot("banner-reduced-motion");
  if (!live) await send("Fetch.disable");
  throttleMs = 0;
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "" }] });
}

// 降级/本地 fixture 的 5xx 是环境噪音，只核对应用自身错误。
const noise = ["/functions/v1/app"];
const appErrors = consoleErrors.filter((e) => !noise.some((p) => e.includes(p)));
record("console", "0-error", appErrors.length === 0, appErrors.join(" | "));

writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log("screenshots:", outDir);
ws.close();
chrome.kill();
process.exit(results.filter((r) => !r.ok).length ? 1 : 0);
