// 2026-11-18 照契卷轴改造 QA：合卷初始态 / 800ms 展卷下轴下行 / 换卷先收后展 /
// 清单并入纸面 + localStorage 保留 / 签条三角 / 375 无横向滚动 / reduced-motion 即时 / 结果页跳入直展。
// 用法：node dev/照契卷轴qa.mjs [url]（配合 npm run preview + node dev/function-fixture.mjs）
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const URL_BASE = process.argv[2] ?? "http://127.0.0.1:4174/";
const live = /^https:/.test(URL_BASE);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9225;
const outDir = join(tmpdir(), "qqy-scroll");
mkdirSync(outDir, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), "qqy-scroll-profile")}`,
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
function record(scope, step, ok, detail = "") {
  results.push({ scope, step, ok, detail: String(detail).slice(0, 260) });
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

async function setVp(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
}
async function gotoZhaoqi() {
  await send("Page.navigate", { url: URL_BASE });
  await sleep(live ? 4000 : 1400);
  await evaluate(`(() => { const b=[...document.querySelectorAll('header nav button')].find(x=>x.innerText.startsWith('照契')); b.click(); return true; })()`);
  await sleep(500);
}

// 探测脚本：合卷态 / 轴几何 / 清单 / 三角
const SHELL_PROBE = `(() => {
  const rods=[...document.querySelectorAll('.qq-rod')];
  const wrap=document.querySelector('.qq-rollwrap');
  const closed=document.querySelector('.qq-closed-tag');
  const paper=document.querySelector('.qq-rollwrap .qq-paper');
  const sel=document.querySelector('.qq-tab[aria-selected="true"]');
  const tabAfter=sel?getComputedStyle(sel,'::after'):null;
  return {
    rodCount:rods.length,
    rodH:rods[0]?Math.round(rods[0].getBoundingClientRect().height):0,
    closedText:closed?closed.innerText.trim():null,
    open:wrap?wrap.dataset.open:null,
    paperOpacity:paper?Number(getComputedStyle(paper).opacity).toFixed(2):null,
    checklistInPaper:!!document.querySelector('.qq-paper .chk-list'),
    standalonePanel:!!document.querySelector('.chk-panel'),
    divider:!!document.querySelector('.qq-paper .qq-divider'),
    triangle:tabAfter?{bt:tabAfter.borderTopColor,h:parseFloat(tabAfter.height)}:null,
    overflowX:document.scrollingElement.scrollWidth>document.documentElement.clientWidth,
    // 下轴（第2根）底边相对纸面底部的距离：展开后下轴应紧贴纸底部下方
    bottomRodGap:(()=>{ if(!paper||rods.length<2) return null;
      const rb=rods[1].getBoundingClientRect(), pb=paper.getBoundingClientRect();
      return Math.round(rb.top-pb.bottom); })(),
  };
})()`;

async function clickTab(label) {
  await evaluate(`(() => { const b=[...document.querySelectorAll('.qq-tab')].find(x=>x.innerText.includes('${label}')); b.click(); return true; })()`);
}

// ============ 1366 桌面 ============
await setVp(1366, 900);
await gotoZhaoqi();
let s = await evaluate(SHELL_PROBE);
record("1366", "closed-initial", s.closedText === "请选类型，展开卷轴" && s.rodCount === 2 && s.open === null && s.paperOpacity === null, JSON.stringify(s));
await shot("closed-1366");

// 点租房 → 下轴应随纸面下行：采样 bottom 轴 top 位置序列，应单调增后稳定
await clickTab("租房");
const trace = await evaluate(`(() => new Promise((resolve)=>{
  const pts=[]; let last=performance.now();
  const iv=setInterval(()=>{
    const rods=document.querySelectorAll('.qq-rod');
    const wrap=document.querySelector('.qq-rollwrap');
    if(rods.length>=2&&wrap){
      const r=rods[rods.length-1].getBoundingClientRect();
      pts.push(Math.round(r.top));
    }
    if(performance.now()-last>1200||pts.length>90){clearInterval(iv);resolve(pts);}
  },50);
}))()`);
const rising = trace.length > 6 && trace[trace.length - 1] > trace[2] + 150;
await sleep(200);
s = await evaluate(SHELL_PROBE);
record("1366", "expand-rod-follows", rising && s.open === "true" && s.rodCount === 2 && s.bottomRodGap >= 0 && s.bottomRodGap <= 40, `trace=${trace[0]}→${trace[trace.length - 1]} gap=${s.bottomRodGap}`);
record("1366", "checklist-in-paper", s.checklistInPaper && !s.standalonePanel && s.divider, JSON.stringify(s));
record("1366", "tab-triangle", s.triangle && s.triangle.bt === "rgb(178, 58, 46)" && s.triangle.h > 0, JSON.stringify(s.triangle));
record("1366", "rod-26px", s.rodH >= 24 && s.rodH <= 28, String(s.rodH));
record("1366", "no-overflow-x", !s.overflowX, String(s.overflowX));
await shot("open-rent-1366");

// 清单勾选 + 刷新保留（localStorage key 不变）。先清掉旧勾选保证可重复运行。
await evaluate(`(() => { Object.keys(localStorage).filter(k=>k.startsWith('qqy:checklist')).forEach(k=>localStorage.removeItem(k)); return true; })()`);
await evaluate(`(() => { const cb=document.querySelector('.qq-paper .chk-list input[type=checkbox]'); cb.click(); return true; })()`);
const keys = await evaluate("Object.keys(localStorage).filter(k=>k.startsWith('qqy:checklist'))");
record("1366", "checklist-storage-key", keys.length > 0 && keys.every((k) => k.startsWith("qqy:checklist:")), JSON.stringify(keys));
await gotoZhaoqi();
await clickTab("租房");
await sleep(1100);
const persisted = await evaluate(`!!document.querySelector('.qq-paper .chk-list input[type=checkbox]:checked')`);
record("1366", "checklist-persist-refresh", persisted, String(persisted));

// 换卷：点实习 → 应先收（data-open=false）再展，且类型标题变
const swap = await evaluate(`(() => new Promise((resolve)=>{
  const b=[...document.querySelectorAll('.qq-tab')].find(x=>x.innerText.includes('实习'));
  b.click();
  let sawClosed=false; const t0=performance.now();
  const iv=setInterval(()=>{
    const w=document.querySelector('.qq-rollwrap');
    if(w){ if(w.dataset.open==='false') sawClosed=true;
      if(sawClosed&&w.dataset.open==='true'){clearInterval(iv);resolve({sawClosed});return;} }
    if(performance.now()-t0>4000){clearInterval(iv);resolve({sawClosed,timeout:true});}
  },40);
}))()`);
await sleep(950);
const h2 = await evaluate(`(document.querySelector('.qq-paper > h2')||{}).innerText||''`);
record("1366", "swap-collapse-then-expand", swap.sawClosed && h2.includes("实习"), JSON.stringify({ ...swap, h2: h2.slice(0, 20) }));

// 点已选中类型：不折叠
await clickTab("实习");
await sleep(300);
const still = await evaluate(`document.querySelector('.qq-rollwrap')?.dataset.open`);
record("1366", "same-type-noop", still === "true", String(still));

// 长内容类型（贷款分期/套餐等，取最后一个类型）
await evaluate(`(() => { const tabs=[...document.querySelectorAll('.qq-tab')]; tabs[tabs.length-1].click(); return tabs[tabs.length-1].innerText; })()`);
await sleep(1500);
const lastH2 = await evaluate(`(document.querySelector('.qq-paper > h2')||{}).innerText||''`);
const lastProbe = await evaluate(SHELL_PROBE);
record("1366", "long-type-open", lastH2.length > 0 && lastProbe.open === "true" && lastProbe.bottomRodGap >= 0 && lastProbe.bottomRodGap <= 40, `h2=${lastH2} gap=${lastProbe.bottomRodGap}`);

// ============ 375×812 ============
await setVp(375, 812);
await gotoZhaoqi();
s = await evaluate(SHELL_PROBE);
record("375", "closed-initial", s.closedText === "请选类型，展开卷轴" && !s.overflowX, JSON.stringify({ c: s.closedText, o: s.overflowX }));
await clickTab("租房");
await sleep(1100);
s = await evaluate(SHELL_PROBE);
// 轴头伸出量：伪元素 left 相对 .qq-scroll 的偏移，滚动容器不得被撑宽
const knobs = await evaluate(`(() => {
  const scroll=document.querySelector('.qq-scroll'); const rod=scroll.querySelector('.qq-rod');
  const rr=rod.getBoundingClientRect(), sr=scroll.getBoundingClientRect();
  const l=getComputedStyle(rod,'::before'), r=getComputedStyle(rod,'::after');
  return { rodLeft:Math.round(rr.left-sr.left), beforeLeft:l.left, afterRight:r.right,
    overflowX:document.scrollingElement.scrollWidth>document.documentElement.clientWidth };
})()`);
record("375", "open-no-overflow", s.open === "true" && !s.overflowX && !knobs.overflowX, JSON.stringify(knobs));
record("375", "checklist-in-paper", s.checklistInPaper && !s.standalonePanel, JSON.stringify({ c: s.checklistInPaper, p: s.standalonePanel }));
await shot("open-rent-375");
const tabsRow = await evaluate(`(() => { const t=[...document.querySelectorAll('.qq-tab')]; const tops=t.map(b=>Math.round(b.getBoundingClientRect().top)); const h=innerHeight;
  const offscreen=t.filter(b=>{const r=b.getBoundingClientRect();return r.right>innerWidth+1||r.left<-1;}).length;
  return {rows:new Set(tops).size, offscreen}; })()`);
record("375", "tabs-wrap-not-cramped", tabsRow.offscreen === 0, JSON.stringify(tabsRow));

// ============ prefers-reduced-motion ============
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await setVp(1366, 900);
await gotoZhaoqi();
await clickTab("租房");
await sleep(120); // 几乎立刻应完整展开
const rm = await evaluate(`(() => {
  const w=document.querySelector('.qq-rollwrap'); const p=document.querySelector('.qq-paper');
  const rods=[...document.querySelectorAll('.qq-rod')];
  return { open:w?w.dataset.open:null, opacity:p?Number(getComputedStyle(p).opacity).toFixed(2):null,
    trans:getComputedStyle(w).transitionDuration,
    rodBottomGap:(()=>{const rb=rods[1].getBoundingClientRect(),pb=p.getBoundingClientRect();return Math.round(rb.top-pb.bottom);})() };
})()`);
record("reduced-motion", "instant-open", rm.open === "true" && rm.opacity === "1.00" && rm.trans === "0s" && rm.rodBottomGap >= 0 && rm.rodBottomGap <= 40, JSON.stringify(rm));
await shot("reduced-motion-1366");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "" }] });

// ============ 结果页「查看同类案例」跳入直展 ============
if (!live) {
  await gotoZhaoqi(); // 先回首页清 state
  await send("Page.navigate", { url: URL_BASE });
  await sleep(1400);
  await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('高命中演示合同')); b.click(); return true; })()`);
  await sleep(3500);
  const jump = await evaluate(`(() => {
    const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.includes('查看同类案例'));
    if(!b) return 'no-jump-button';
    b.click(); return 'clicked'; })()`);
  await sleep(700);
  const after = await evaluate(`(() => {
    const w=document.querySelector('.qq-rollwrap'); const paper=document.querySelector('.qq-paper');
    const focused=[...document.querySelectorAll('article[data-trap-id]')];
    return { onZ:!!paper, open:w?w.dataset.open:null, cases:focused.length,
      h2:paper?paper.querySelector(':scope > h2').innerText:'' }; })()`);
  record("jump", "direct-open-located", jump === "clicked" && after.onZ && after.open === "true" && after.cases > 0, JSON.stringify({ jump, ...after }));
  await shot("jump-1366");
}

const noise = ["/functions/v1/app"];
const appErrors = consoleErrors.filter((e) => !noise.some((p) => e.includes(p)));
record("console", "0-error", appErrors.length === 0, appErrors.join(" | "));

writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log("screenshots:", outDir);
ws.close();
chrome.kill();
process.exit(results.filter((r) => !r.ok).length ? 1 : 0);
