// 陷阱库改版截图：node dev/traps-shots.mjs [url] → %TEMP%/qqy-shots/*.png
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const URL_BASE = process.argv[2] ?? "http://127.0.0.1:4173/";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9224;
const outDir = join(tmpdir(), "qqy-shots");
mkdirSync(outDir, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), "qqy-shots-profile")}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "about:blank",
]);

async function getWsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
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
const ev = async (expression) => {
  const m = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (m.result?.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails));
  return m.result?.result?.value;
};
const shot = async (name) => {
  const m = await send("Page.captureScreenshot", { format: "png" });
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(m.result.data, "base64"));
  console.log(file);
};

await send("Page.enable");
for (const vp of [
  { name: "375", width: 375, height: 667 },
  { name: "1280", width: 1280, height: 900 },
]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: URL_BASE });
  await sleep(1200);
  await ev("localStorage.clear()");
  await send("Page.navigate", { url: URL_BASE });
  await sleep(1200);
  await ev(`(() => { const b=[...document.querySelectorAll('button')].find((x)=>x.textContent.includes('浏览陷阱库')); b.click(); return true; })()`);
  await sleep(600);
  await shot(`${vp.name}-traps-collapsed`);
  await ev(`(() => { const b=[...document.querySelectorAll('button')].find((x)=>x.textContent.includes('押金可能被没收')); b.click(); return true; })()`);
  await sleep(400);
  await shot(`${vp.name}-traps-expanded`);
}
chrome.kill();
