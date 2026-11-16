// 生成「手机拍的合同照片」测试素材：内容全部编造，页面标注示例虚构。
// 用法：node dev/make-photo-fixture.mjs  → dev/fixtures/contract-photo.jpg
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9226;
const outDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
mkdirSync(outDir, { recursive: true });

// 编造合同：押金没收、中介代收一年租金、单向违约金、随时解除各埋一处。
const CLAUSES = [
  ["房屋租赁合同（示例，虚构）", ""],
  ["甲方（出租方）：李某某　电话 138-0000-0000", ""],
  ["乙方（承租方）：王小明　身份证号 110101200001010000", ""],
  [
    "第一条　租赁期限自 2026 年 3 月 1 日至 2027 年 2 月 28 日，共 12 个月。月租金人民币 1500 元。",
    "",
  ],
  [
    "第二条　押金人民币 4500 元。租赁期满或乙方提前退租的，押金归甲方所有，不予退还。",
    "",
  ],
  [
    "第三条　租金由乙方一次性支付一年，交给甲方委托的中介公司账户，甲方不得直接向乙方收取租金。",
    "",
  ],
  [
    "第四条　乙方提前退租的，应按三个月租金标准向甲方支付违约金；甲方提前收回房屋的，无需支付任何费用。",
    "",
  ],
  ["第五条　甲方有权随时进入出租房屋检查使用情况，乙方不得拒绝。", ""],
  [
    "第六条　本合同未尽事宜由甲方解释，甲方保留最终解释权。",
    "",
  ],
  ["签订日期：2026 年 2 月 20 日　签订地点：某大学南门外", ""],
];

const html = `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;background:#8d8577;width:900px;height:1300px;overflow:hidden}
  .paper{position:relative;top:34px;left:26px;width:820px;height:1210px;background:#f7f4ea;
    padding:56px 60px;box-shadow:0 18px 40px rgba(0,0,0,.35);transform:rotate(-2.2deg);
    font-family:"Noto Serif SC","Songti SC",serif;color:#20201e}
  h1{font-size:34px;text-align:center;margin:0 0 26px;letter-spacing:2px}
  p{font-size:22px;line-height:1.85;margin:0 0 16px;text-align:justify}
  .meta{font-size:20px;color:#4a463c}
  .stamp{position:absolute;right:52px;bottom:44px;border:3px solid #b23a2e;color:#b23a2e;
    padding:6px 14px;font-size:18px;transform:rotate(-8deg);opacity:.85}
</style>
<div class="paper">
  <h1>${CLAUSES[0][0]}</h1>
  ${CLAUSES.slice(1, 3).map((c) => `<p class="meta">${c[0]}</p>`).join("")}
  ${CLAUSES.slice(3).map((c) => `<p>${c[0]}</p>`).join("")}
  <div class="stamp">示例，虚构</div>
</div>`;

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(process.env.TEMP ?? "/tmp", "qqy-photo")}`,
  "--no-first-run",
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

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 900,
  height: 1300,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", {
  url: "data:text/html;charset=utf-8," + encodeURIComponent(html),
});
await sleep(1500);
const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 88 });
const file = join(outDir, "contract-photo.jpg");
writeFileSync(file, Buffer.from(shot.result.data, "base64"));
console.log(file, (shot.result.data.length / 1024).toFixed(0) + "KB base64");
chrome.kill();
