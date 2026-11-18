// 馗判界面双视口回归：node dev/kuipan-qa.mjs [url]
// 复用 viewport-qa 的 CDP 方案（本机 Chrome headless，不引入新依赖）。
// 覆盖：四种输入、结果页→照契跳转、典例→结果页回跳、清单勾选持久化、捉鬼录切换、控制台 0 error。
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const URL_BASE = process.argv[2] ?? "http://127.0.0.1:4173/";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9223;
const outDir = join(tmpdir(), "kuipan-qa");
mkdirSync(outDir, { recursive: true });
const fixture = (n) =>
  join(process.cwd(), "dev", "fixtures", n).replace(/\//g, "\\");

const PASTE =
  "房屋租赁合同（粘贴示例，虚构）\n第一条 押金 押金为人民币6000元。租赁期满，押金归甲方所有。\n第二条 解除 甲方可随时解除本合同。\n第三条 其他约定 双方此前的口头约定，以本合同书面内容为准。";

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), "kuipan-qa-profile")}`,
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
const hOverflow = () =>
  evaluate(
    "(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))()",
  );

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
  await evaluate("localStorage.clear()");
  await send("Page.navigate", { url: URL_BASE });
  await sleep(1200);
  let txt = await bodyText();
  record(vp.name, "home-load", txt.includes("馗判") && txt.includes("呈上生死簿"));
  record(
    vp.name,
    "demo-real-case-label",
    txt.includes("高命中演示合同（真实案例，已脱敏）") && txt.includes("案例来源"),
  );
  record(
    vp.name,
    "footer-disclaimer",
    txt.includes("AI参考意见，不构成法律意见。") &&
      (await evaluate(
        `document.querySelector('footer details').textContent.includes('12348') && document.querySelector('footer details').textContent.includes('识别后立即丢弃，不保存')`,
      )),
  );
  await shot(`${vp.name}-home`, true);
  let ov = await hOverflow();
  record(vp.name, "home-no-h-overflow", ov.sw <= ov.cw, JSON.stringify(ov));

  // 捉鬼录：默认相柳 → 点饕餮切换
  await clickText("捉鬼录");
  await sleep(400);
  txt = await bodyText();
  record(vp.name, "ghosts-default", txt.includes("相柳") && txt.includes("名目繁多的收费"));
  await clickText("饕餮");
  await sleep(650); // 等焚鬼切换动画（500ms）结束再断言与截图
  txt = await bodyText();
  record(vp.name, "ghosts-switch", txt.includes("隐藏收费与自动续费") && txt.includes("应对策略"));
  await shot(`${vp.name}-ghosts`, true);
  ov = await hOverflow();
  record(vp.name, "ghosts-no-h-overflow", ov.sw <= ov.cw, JSON.stringify(ov));

  // 照契：默认合卷，需先点租房展卷；套餐占位；贷款分期清单
  await clickText("照契");
  await sleep(400);
  txt = await bodyText();
  record(vp.name, "contracts-closed", txt.includes("请选类型，展开卷轴"));
  await clickText("租房");
  await sleep(1000); // 展卷 800ms
  txt = await bodyText();
  record(
    vp.name,
    "contracts-rent",
    txt.includes("签约前检查") && txt.includes("注意事项（法律依据）") && txt.includes("典例分析") && txt.includes("已核对 0 / 10"),
  );
  await shot(`${vp.name}-contracts`, true);
  ov = await hOverflow();
  record(vp.name, "contracts-no-h-overflow", ov.sw <= ov.cw, JSON.stringify(ov));
  await clickText("套餐");
  await sleep(1300); // 收卷 400ms + 展卷 800ms
  txt = await bodyText();
  record(vp.name, "contracts-plan-basis", txt.includes("自动续费或自动续约") && txt.includes("典例分析") && txt.includes("低价体验到期") && txt.includes("签约前检查"));
  await shot(`${vp.name}-contracts-plan`, true);
  await clickText("贷款分期");
  await sleep(1300);
  txt = await bodyText();
  record(vp.name, "contracts-loan", txt.includes("已核对 0 / 8") && txt.includes("分期") && txt.includes("预付费用概不退还"));
  await clickText("保险");
  await sleep(1300);
  txt = await bodyText();
  record(vp.name, "contracts-insurance", txt.includes("已核对 0 / 7") && txt.includes("免责条款未作显著提示或说明") && txt.includes("典例分析") && txt.includes("签约前检查"));
  await clickText("预付卡");
  await sleep(1300);
  txt = await bodyText();
  record(vp.name, "contracts-prepaid", txt.includes("已核对 0 / 7") && txt.includes("退卡扣高额手续费或概不退卡") && txt.includes("典例分析") && txt.includes("签约前检查"));
  await clickText("租车");
  await sleep(1300);
  txt = await bodyText();
  record(vp.name, "contracts-carrental", txt.includes("已核对 0 / 7") && txt.includes("取车验车单方记录") && txt.includes("典例分析") && txt.includes("签约前检查"));
  await clickText("驾校");
  await sleep(1300);
  txt = await bodyText();
  record(vp.name, "contracts-driving", txt.includes("已核对 0 / 7") && txt.includes("一费制却另收补考模拟陪练费") && txt.includes("典例分析") && txt.includes("签约前检查"));
  await clickText("租房");
  await sleep(1300);

  // 清单勾选 + 刷新持久化（沿用 qqy:checklist:* key）
  const before = await evaluate(
    `(() => { const c=document.querySelector('input[type=checkbox]'); return c ? c.checked : null; })()`,
  );
  await evaluate(
    `(() => { const c=document.querySelector('input[type=checkbox]'); if(c) c.click(); return !!c; })()`,
  );
  await sleep(400);
  const after = await evaluate(
    `(() => { const c=document.querySelector('input[type=checkbox]'); return c ? c.checked : null; })()`,
  );
  record(vp.name, "checklist-toggle", after === !before, `before=${before} after=${after}`);
  await send("Page.navigate", { url: URL_BASE });
  await sleep(1200);
  await clickText("照契");
  await sleep(400);
  await clickText("租房"); // 合卷默认收起，需展卷后才渲染清单
  await sleep(1000);
  const persisted = await evaluate(
    `(() => { const c=document.querySelector('input[type=checkbox]'); return c ? c.checked : null; })()`,
  );
  record(vp.name, "checklist-persisted", persisted === after, `persisted=${persisted}`);

  // 无分析时「粘贴合同，检查这一项」→ 首页提示
  const toInput = await clickText("粘贴合同，检查这一项");
  await sleep(400);
  txt = await bodyText();
  record(vp.name, "case-check-to-input", toInput && txt.includes("分析结果会检查这一项"));

  // 示例一键试用（模型 fixture 主路径）
  await clickText("高命中演示合同");
  await sleep(2200);
  txt = await bodyText();
  record(vp.name, "demo-result", txt.includes("需重点留意") && txt.includes("缺失的条款") && txt.includes("示例，真实案例已脱敏"));
  record(vp.name, "demo-model-merged", txt.includes("AI 生成") && !txt.includes("智能分析暂不可用"));
  const marks = await evaluate("document.querySelectorAll('mark.brush-mark').length");
  record(vp.name, "demo-brush-marks", marks > 0, `marks=${marks}`);
  await shot(`${vp.name}-result`, true);
  ov = await hOverflow();
  record(vp.name, "result-no-h-overflow", ov.sw <= ov.cw, JSON.stringify(ov));

  // 条款目录跳转：滚动目标是左栏「合同原文」独立滚动容器；内容不足一屏时容器不可滚，视为通过
  const jumped = await evaluate(
    `(() => { const sc=document.querySelector('section[aria-label="合同原文"] .overflow-y-auto'); const nav=document.querySelector('main nav'); const btns=[...nav.querySelectorAll('button')]; const b=btns[btns.length-1]; const before=sc?sc.scrollTop:window.scrollY; const scrollable=sc?sc.scrollHeight>sc.clientHeight:true; b.click(); return new Promise(r=>setTimeout(()=>{ const after=sc?sc.scrollTop:window.scrollY; r({before, after, scrollable}); },1200)); })()`,
  );
  record(vp.name, "toc-jump", jumped && (!jumped.scrollable || jumped.after !== jumped.before), JSON.stringify(jumped));

  // 类型改选
  await evaluate(
    `(() => { const sel=document.querySelector('select'); const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set; set.call(sel,'internship'); sel.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`,
  );
  await sleep(500);
  txt = await bodyText();
  record(vp.name, "type-reselect", txt.includes("当前：实习兼职"));

  // 结果页 → 照契对应类型卷轴 →「用我的合同检查这一项」→ 结果页
  await evaluate(
    `(() => { const sel=document.querySelector('select'); const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set; set.call(sel,'rent'); sel.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`,
  );
  await sleep(1500);
  await clickText("查看同类案例");
  await sleep(900);
  txt = await bodyText();
  const focusedType = await evaluate(
    `(() => { const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.getAttribute('aria-selected')==='true'); return t ? t.textContent : ''; })()`,
  );
  record(vp.name, "result-to-contracts", txt.includes("典例分析") && focusedType === "租房", `type=${focusedType}`);
  const backToResult = await clickText("用我的合同检查这一项");
  await sleep(900);
  txt = await bodyText();
  record(vp.name, "contracts-to-result", backToResult && txt.includes("分析结果"));

  // 返回 → 粘贴
  await clickText("返回");
  await sleep(400);
  await evaluate(
    `(() => { const ta=document.querySelector('textarea'); const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; set.call(ta, ${JSON.stringify(
      PASTE,
    )}); ta.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`,
  );
  await clickText("开始分析");
  await sleep(700);
  txt = await bodyText();
  record(vp.name, "paste-result", txt.includes("押金可能被没收"));
  record(vp.name, "paste-fallback-actions", txt.includes("签前怎么办") && txt.includes("先别当场签字或付款"));
  record(vp.name, "paste-possible-basis", txt.includes("可能相关条文（仅供参考）"));
  await shot(`${vp.name}-paste-result`, true);

  // 上传 PDF
  await clickText("返回");
  await sleep(400);
  await setFiles('input[type="file"]', fixture("contract.pdf"));
  await sleep(1500);
  await clickText("开始分析");
  await sleep(700);
  txt = await bodyText();
  record(vp.name, "upload-pdf", txt.includes("押金归甲方所有") && txt.includes("需重点留意"));

  // 扫描版 PDF → 提示
  await clickText("返回");
  await sleep(400);
  await setFiles('input[type="file"]', fixture("scanned.pdf"));
  await sleep(1200);
  txt = await bodyText();
  record(vp.name, "scanned-pdf-hint", txt.includes("这是扫描版 PDF"));

  // 上传 DOCX
  await clickText("返回");
  await sleep(400);
  await setFiles('input[type="file"]', fixture("contract.docx"));
  await sleep(1200);
  await clickText("开始分析");
  await sleep(700);
  txt = await bodyText();
  record(vp.name, "upload-docx", txt.includes("押金归甲方所有"));

  // 照片 → 缩略图 → 识别填回文本框（不自动分析）→ 删除 → 开始分析
  await clickText("返回");
  await sleep(400);
  await setFiles('input[type="file"]', fixture("contract-photo.jpg"));
  await sleep(600);
  const thumbs = await evaluate(`document.querySelectorAll('img[alt*="合同照片"]').length`);
  record(vp.name, "photo-thumb", thumbs === 1, `thumbs=${thumbs}`);
  await clickText("识别成文字");
  await sleep(1500);
  const ocrText = await evaluate(`document.querySelector('#contract').value`);
  txt = await bodyText();
  record(
    vp.name,
    "photo-ocr-filled",
    ocrText.includes("第二条 押金人民币 4500 元") && txt.includes("先核对"),
    `chars=${ocrText.length}`,
  );
  record(vp.name, "photo-no-auto-analyze", !txt.includes("分析结果"));
  const removed = await evaluate(
    `(() => { const b=document.querySelector('button[aria-label^="删除第"]'); if(!b) return false; b.click(); return true; })()`,
  );
  await sleep(300);
  const thumbsAfter = await evaluate(`document.querySelectorAll('img[alt*="合同照片"]').length`);
  record(vp.name, "photo-remove", removed === true && thumbsAfter === 0);
  await clickText("开始分析");
  await sleep(900);
  txt = await bodyText();
  record(vp.name, "photo-into-analysis", txt.includes("押金归甲方所有") && txt.includes("需重点留意"));

  // 素材未到位：占位色块不发请求，控制台不应有 404
  const notFound = consoleErrors.filter((e) => e.includes("404") || e.includes("Failed to load resource"));
  record(vp.name, "no-asset-404", notFound.length === 0, notFound.join(" | ").slice(0, 200));
  record(vp.name, "console-0-error", consoleErrors.length === 0, consoleErrors.join(" | ").slice(0, 300));
}

writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log("screenshots:", outDir);
ws.close();
chrome.kill();
const failed = results.filter((r) => !r.ok);
process.exit(failed.length ? 1 : 0);