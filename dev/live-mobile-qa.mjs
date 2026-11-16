// 线上手机宽度复验：非 headless Chrome + CDP 设备模拟，跑通「照片 → 识别 → 核对 → 分析」并出 375×667 截图。
// 用法：node dev/live-mobile-qa.mjs （输出目录 %TEMP%qqy-live-mobile）
// 为什么不用 headless：Sites 网关对 headless 的 /functions 调用返回 403 BOT_DETECTED，页面本身能打开。
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = "https://qianqian-yicha-odzma4gogrf.qoder.zone/";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9228;
const JPG = join(process.cwd(), "dev", "fixtures", "contract-photo.jpg").replace(/\//g, "\\");
const out = join(tmpdir(), "qqy-live-mobile");
mkdirSync(out, { recursive: true });

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), "qqy-live-mobile-profile")}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--window-size=420,900",
  "--window-position=40,40",
  "about:blank",
]);

async function getWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("chrome devtools not reachable");
}

const ws = new WebSocket(await getWsUrl());
await new Promise((r) => (ws.onopen = r));
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const m = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (m.result?.exceptionDetails) return "EVAL_ERR " + JSON.stringify(m.result.exceptionDetails).slice(0, 200);
  return m.result?.result?.value;
};
const shot = async (name) => {
  const m = await send("Page.captureScreenshot", { format: "png" });
  if (!m.result?.data) return console.log("shot failed", name, JSON.stringify(m).slice(0, 160));
  writeFileSync(join(out, `${name}.png`), Buffer.from(m.result.data, "base64"));
  return join(out, `${name}.png`);
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 375,
  height: 667,
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Page.navigate", { url: BASE });
await sleep(4000);
console.log("loaded:", await evaluate("document.title"));

const doc = await send("DOM.getDocument");
const nodeId = (
  await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: 'input[type="file"]' })
).result.nodeId;
await send("DOM.setFileInputFiles", { nodeId, files: [JPG] });
await sleep(900);
console.log("thumb:", await evaluate(`document.querySelectorAll('img[alt*="合同照片"]').length`));
await shot("01-thumb");

console.log(
  "click:",
  await evaluate(
    `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('识别成文字')); if(!b) return 'none'; b.click(); return 'ok'; })()`,
  ),
);
let text = "";
for (let i = 0; i < 25; i++) {
  await sleep(2000);
  const running = await evaluate(
    `(() => [...document.querySelectorAll('button')].some(x=>/识别中/.test(x.innerText)))()`,
  );
  text = String(await evaluate(`document.querySelector('#contract').value`));
  if (!running && text.length > 0) break;
}
console.log("recognized-chars:", text.length);
console.log(
  "state:",
  await evaluate(
    `document.body.innerText.split('\\n').filter(l=>/已识别|核对|失败|没有|模糊/.test(l)).join(' | ')`,
  ),
);
await shot("02-recognized");

writeFileSync(join(out, "recognized.txt"), text);

console.log(
  "analyze:",
  await evaluate(
    `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='开始分析'); if(!b) return 'none'; b.click(); return 'ok'; })()`,
  ),
);
let gotResult = false;
for (let i = 0; i < 20; i++) {
  await sleep(2000);
  const body = String(await evaluate("document.body.innerText"));
  if (body.includes("分析结果")) {
    gotResult = true;
    break;
  }
}
console.log("result-visible:", gotResult);
console.log(
  "overview-card:",
  String(
    await evaluate(
      `(() => { const m=[...document.querySelectorAll('main section')][0]; return m ? m.innerText.replace(/\\n+/g,' / ') : 'no-card'; })()`,
    ),
  ).slice(0, 400),
);
await shot("03-result");

console.log("out:", out);
ws.close();
chrome.kill();
