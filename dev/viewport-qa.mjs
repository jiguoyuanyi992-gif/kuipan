// 双视口 golden-path 实测：node dev/viewport-qa.mjs [url]
// 用本机 Chrome headless + CDP（Node 内置 WebSocket），不引入新依赖。
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const URL_BASE = process.argv[2] ?? "http://127.0.0.1:4173/";
const CHROME =
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9222;
const outDir = join(tmpdir(), "qqy-qa");
mkdirSync(outDir, { recursive: true });
const fixture = (n) =>
  join(process.cwd(), "dev", "fixtures", n).replace(/\//g, "\\");

const PASTE =
  "房屋租赁合同（粘贴示例，虚构）\n第一条 押金 押金为人民币6000元。租赁期满，押金归甲方所有。\n第二条 解除 甲方可随时解除本合同。";

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), "qqy-qa-profile")}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
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
  const m = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (m.result?.exceptionDetails)
    throw new Error(JSON.stringify(m.result.exceptionDetails));
  return m.result?.result?.value;
}
async function shot(name) {
  const m = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(m.result.data, "base64"));
}
const clickText = (t) =>
  evaluate(
    `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes(${JSON.stringify(
      t,
    )})); if(!b) return false; b.click(); return true; })()`,
  );
const bodyText = () => evaluate("document.body.innerText");

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("DOM.enable");

const results = [];
function record(viewport, step, ok, detail = "") {
  results.push({ viewport, step, ok, detail });
}

async function setFiles(selector, file) {
  const doc = await send("DOM.getDocument");
  const q = await send("DOM.querySelector", {
    nodeId: doc.result.root.nodeId,
    selector,
  });
  await send("DOM.setFileInputFiles", {
    nodeId: q.result.nodeId,
    files: [file],
  });
}

for (const vp of [
  { name: "mobile", width: 375, height: 667, mobile: false },
  { name: "desktop", width: 1280, height: 900, mobile: false },
]) {
  consoleErrors.length = 0;
  await send("Emulation.setDeviceMetricsOverride", {
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: 1,
    mobile: vp.mobile,
  });
  await send("Page.navigate", { url: URL_BASE });
  await sleep(1200);
  // 每次从干净存储开始，避免上一轮/另一视口的勾选干扰断言。
  await evaluate("localStorage.clear()");
  await send("Page.navigate", { url: URL_BASE });
  await sleep(1200);
  await shot(`${vp.name}-1-input`);
  record(vp.name, "input-load", (await bodyText()).includes("签前一查"));

  // 示例一键试用
  await clickText("高命中演示合同");
  await sleep(600);
  let txt = await bodyText();
  record(vp.name, "demo-result", txt.includes("需重点留意") && txt.includes("缺失的条款"));

  // M3 模型主路径 / 降级路径（QQY_EXPECT=degraded 时无 fixture）
  await sleep(1500);
  txt = await bodyText();
  if ((process.env.QQY_EXPECT ?? "model") === "degraded") {
    record(vp.name, "demo-model-degraded", txt.includes("智能分析暂不可用"));
  } else {
    record(
      vp.name,
      "demo-model-merged",
      txt.includes("AI 生成") && !txt.includes("智能分析暂不可用"),
    );
  }
  const marks = await evaluate("document.querySelectorAll('mark').length");
  record(vp.name, "demo-highlights", marks > 0, `marks=${marks}`);
  await shot(`${vp.name}-2-demo-top`);
  await evaluate("window.scrollTo(0, document.body.scrollHeight)");
  await sleep(300);
  await shot(`${vp.name}-3-demo-bottom`);

  // 目录跳转
  await evaluate("window.scrollTo(0, 0)");
  await sleep(300);
  const jumped = await evaluate(
    `(() => { const before=window.scrollY; const nav=document.querySelector('nav'); const btns=[...nav.querySelectorAll('button')]; const b=btns[btns.length-1]; b.click(); const el=document.getElementById('b6'); const top0=el?el.getBoundingClientRect().top:null; return new Promise(r=>setTimeout(()=>r({before, after:window.scrollY, n:btns.length, top0, top1:el?el.getBoundingClientRect().top:null, docH:document.body.scrollHeight, winH:window.innerHeight}),1500)); })()`,
  );
  record(vp.name, "toc-jump", jumped && jumped.after !== jumped.before, JSON.stringify(jumped));

  // 类型改选
  await evaluate(
    `(() => { const sel=document.querySelector('select'); const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set; set.call(sel,'internship'); sel.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`,
  );
  await sleep(400);
  txt = await bodyText();
  record(vp.name, "type-reselect", txt.includes("当前：实习兼职"));

  // 返回 → 粘贴
  await clickText("返回");
  await sleep(400);
  await evaluate(
    `(() => { const ta=document.querySelector('textarea'); const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; set.call(ta, ${JSON.stringify(
      PASTE,
    )}); ta.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`,
  );
  await clickText("开始分析");
  await sleep(600);
  txt = await bodyText();
  record(vp.name, "paste-result", txt.includes("押金可能被没收"));
  await shot(`${vp.name}-4-paste`);

  // 上传 PDF
  await clickText("返回");
  await sleep(400);
  await setFiles('input[type="file"]', fixture("contract.pdf"));
  await sleep(1500);
  await clickText("开始分析");
  await sleep(600);
  txt = await bodyText();
  record(vp.name, "upload-pdf", txt.includes("押金归甲方所有") && txt.includes("需重点留意"));
  await shot(`${vp.name}-5-pdf`);

  // 上传扫描版 PDF → 提示
  await clickText("返回");
  await sleep(400);
  await setFiles('input[type="file"]', fixture("scanned.pdf"));
  await sleep(1200);
  txt = await bodyText();
  record(vp.name, "scanned-pdf-hint", txt.includes("这是扫描版 PDF"));
  await shot(`${vp.name}-6-scanned`);

  // 上传 DOCX
  await clickText("返回");
  await sleep(400);
  await setFiles('input[type="file"]', fixture("contract.docx"));
  await sleep(1200);
  await clickText("开始分析");
  await sleep(600);
  txt = await bodyText();
  record(vp.name, "upload-docx", txt.includes("押金归甲方所有"));
  await shot(`${vp.name}-7-docx`);

  // 照片 → 识别成文字 → 填回文本框（不自动分析）→ 进入现有分析流程
  await clickText("返回");
  await sleep(400);
  await setFiles('input[type="file"]', fixture("contract-photo.jpg"));
  await sleep(600);
  const thumbs = await evaluate(`document.querySelectorAll('img[alt*="合同照片"]').length`);
  record(vp.name, "photo-thumb", thumbs === 1, `thumbs=${thumbs}`);
  await shot(`${vp.name}-7b-photo-thumb`);

  await clickText("识别成文字");
  await sleep(1500);
  const ocrText = await evaluate(`document.querySelector('#contract').value`);
  txt = await bodyText();
  if ((process.env.QQY_OCR ?? "") === "fail") {
    record(
      vp.name,
      "photo-ocr-error-hint",
      txt.includes("识别") && (txt.includes("模糊") || txt.includes("粘贴")),
      txt.slice(0, 80).replace(/\n/g, " "),
    );
    await shot(`${vp.name}-7c-photo-error`);
    // 失败后引导粘贴：粘贴仍可正常进入分析
    await evaluate(
      `(() => { const ta=document.querySelector('textarea'); const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; set.call(ta, ${JSON.stringify(
        PASTE,
      )}); ta.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`,
    );
    await clickText("开始分析");
    await sleep(700);
    txt = await bodyText();
    record(vp.name, "photo-fail-paste-fallback", txt.includes("押金可能被没收"));
  } else {
    record(
      vp.name,
      "photo-ocr-filled",
      ocrText.includes("第二条 押金人民币 4500 元") && txt.includes("先核对"),
      `chars=${ocrText.length}`,
    );
    record(
      vp.name,
      "photo-no-auto-analyze",
      !txt.includes("总体风险") && !txt.includes("分析结果"),
    );
    await shot(`${vp.name}-7c-photo-ocr`);

    const removed = await evaluate(
      `(() => { const b=document.querySelector('button[aria-label^="删除第"]'); if(!b) return false; b.click(); return true; })()`,
    );
    await sleep(300);
    const thumbsAfter = await evaluate(
      `document.querySelectorAll('img[alt*="合同照片"]').length`,
    );
    record(vp.name, "photo-remove", removed === true && thumbsAfter === 0, `after=${thumbsAfter}`);

    await clickText("开始分析");
    await sleep(900);
    txt = await bodyText();
    record(
      vp.name,
      "photo-into-analysis",
      txt.includes("押金归甲方所有") && txt.includes("需重点留意"),
    );
    await shot(`${vp.name}-7d-photo-result`);
  }

  // M4c 陷阱库：结果页 →「查看同类案例」→ 陷阱库 →「用我的合同检查这一项」→ 结果页
  await clickText("查看同类案例");
  await sleep(800);
  txt = await bodyText();
  record(
    vp.name,
    "traps-jump-from-result",
    txt.includes("签约前检查清单") && txt.includes("被坑后怎么办"),
    txt.slice(0, 60).replace(/\n/g, " "),
  );
  await shot(`${vp.name}-8-traps`);

  const checkedBack = await evaluate(
    `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('用我的合同检查这一项')); if(!b) return false; b.click(); return true; })()`,
  );
  await sleep(900);
  txt = await bodyText();
  record(
    vp.name,
    "traps-jump-to-result",
    checkedBack && txt.includes("分析结果"),
  );

  // 陷阱库新结构：默认折叠 + 手风琴 + 更多陷阱（关键词检索按用户要求移除）
  await clickText("浏览陷阱库");
  await sleep(600);
  txt = await bodyText();
  const noSearch = !(await evaluate(
    `!!document.querySelector('input[aria-label="检索陷阱条目"]')`,
  ));
  record(
    vp.name,
    "traps-collapsed-default",
    txt.includes("签约前检查清单") &&
      txt.includes("最常见的 3 个坑") &&
      !txt.includes("识别特征") &&
      noSearch,
    `noSearch=${noSearch}`,
  );

  // 折叠态首屏可见卡片数（375px 视口要求 ≥2）
  const visibleCards = await evaluate(
    `(() => [...document.querySelectorAll('[data-trap-id]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }).length)()`,
  );
  record(vp.name, "traps-cards-above-fold", visibleCards >= 2, `visible=${visibleCards}`);
  await shot(`${vp.name}-9-traps-collapsed`);

  await clickText("贷款分期");
  await sleep(300);
  txt = await bodyText();
  record(
    vp.name,
    "traps-loan-category",
    txt.includes("签约前检查清单") && txt.includes("分期"),
  );

  // 展开一张 → 再展开另一张：只允许一张展开
  await clickText("租房");
  await sleep(300);
  await clickText("押金可能被没收");
  await sleep(300);
  txt = await bodyText();
  const expandedOnce = txt.includes("识别特征") && txt.includes("签约前要问");
  const liBefore = await evaluate(
    `(() => document.querySelectorAll('[data-trap-id="trap-rent-deposit-forfeit"] li').length)()`,
  );
  await evaluate(
    `(() => { const b=[...document.querySelectorAll('[data-trap-id="trap-rent-deposit-forfeit"] button')].find((x)=>x.textContent.includes('查看全部')); if(!b) return false; b.click(); return true; })()`,
  );
  await sleep(200);
  const liAfter = await evaluate(
    `(() => document.querySelectorAll('[data-trap-id="trap-rent-deposit-forfeit"] li').length)()`,
  );
  record(
    vp.name,
    "traps-view-all",
    expandedOnce && liAfter > liBefore,
    `${liBefore}->${liAfter}`,
  );
  await clickText("违约金偏高");
  await sleep(300);
  const openCount = await evaluate(
    `(() => [...document.querySelectorAll('[data-trap-id] button[aria-expanded]')].filter((b) => b.getAttribute('aria-expanded') === 'true').length)()`,
  );
  record(vp.name, "traps-accordion-single", openCount === 1, `open=${openCount}`);
  await shot(`${vp.name}-9b-traps-expanded`);

  await clickText("更多陷阱");
  await sleep(300);
  txt = await bodyText();
  record(vp.name, "traps-more-group", txt.includes("非居住空间单独出租"));

  // 清单勾选 + localStorage 持久化（刷新后仍在）
  await clickText("租房");
  await sleep(300);
  const before = await evaluate(
    `(() => { const c=document.querySelector('input[type=checkbox]'); if(!c) return null; return c.checked; })()`,
  );
  const clicked = await evaluate(
    `(() => { const c=document.querySelector('input[type=checkbox]'); if(!c) return null; c.click(); return true; })()`,
  );
  await sleep(400);
  const after = await evaluate(
    `(() => { const c=document.querySelector('input[type=checkbox]'); return c ? c.checked : null; })()`,
  );
  const diag = await evaluate(
    `(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(k=>k[0].startsWith('qqy:checklist')))))()`,
  );
  record(
    vp.name,
    "checklist-toggle",
    clicked === true && after === !before,
    `before=${before} after=${after} ls=${diag}`,
  );

  await send("Page.navigate", { url: URL_BASE });
  await sleep(1200);
  await clickText("浏览陷阱库");
  await sleep(600);
  const persisted = await evaluate(
    "(() => { const c=document.querySelector('input[type=checkbox]'); return c ? c.checked : null; })()",
  );
  record(vp.name, "checklist-persisted", persisted === after, `persisted=${persisted} after=${after}`);
  await shot(`${vp.name}-10-traps-checklist`);

  // 无分析时「检查这一项」应回输入页并给出提示
  await send("Page.navigate", { url: URL_BASE });
  await sleep(1200);
  await clickText("浏览陷阱库");
  await sleep(600);
  // 检查按钮只在展开的卡片里出现，先展开一张。
  await clickText("押金可能被没收");
  await sleep(300);
  const checkNoAnalysis = await evaluate(
    `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('粘贴合同，检查这一项')); if(!b) return false; b.click(); return true; })()`,
  );
  await sleep(500);
  txt = await bodyText();
  record(
    vp.name,
    "traps-check-to-input",
    checkNoAnalysis && txt.includes("分析结果会检查这一项"),
  );

  // 降级模式下 analyze 端点的 5xx 是「本地没跑 Function」的环境噪音，不算应用错误。
  // QQY_OCR=fail 时 /ocr 的 5xx 同样是我们故意注入的失败，只核对页面提示，不算应用错误。
  const noisePaths = [];
  if ((process.env.QQY_EXPECT ?? "model") === "degraded") {
    noisePaths.push("/functions/v1/app/analyze");
  }
  if ((process.env.QQY_OCR ?? "") === "fail") {
    noisePaths.push("/functions/v1/app/ocr");
  }
  const appErrors = consoleErrors.filter((e) => !noisePaths.some((p) => e.includes(p)));
  record(vp.name, "console-0-error", appErrors.length === 0, appErrors.join(" | ").slice(0, 300));
}

writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log("screenshots:", outDir);
ws.close();
chrome.kill();
const failed = results.filter((r) => !r.ok);
process.exit(failed.length ? 1 : 0);