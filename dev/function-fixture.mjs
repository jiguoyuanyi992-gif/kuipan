// 本地 Function fixture：Deno 未安装时，用 Node 模拟 /functions/v1/app/analyze 与 /ocr。
// 只喂编造示例合同做流程级验证（合并、流式、降级、识别），不接百炼。
// 用法：node dev/function-fixture.mjs  （vite dev/preview 已把 /functions/v1/app 代理到 127.0.0.1:8000）
// 环境变量：QQY_EXPECT=degraded 关掉 analyze 假模型；QQY_OCR=fail 让识别返回失败码。
import { createServer } from "node:http";

const FAKE_PATTERNS = [
  { ruleId: "rent-deposit-forfeit", re: /押金[^。]*(不予退还|归甲方)/ },
  { ruleId: "common-unilateral-terminate", re: /(随时解除|最终解释权)/ },
];

// 与 dev/fixtures/contract-photo.jpg 内容一致的编造文本（示例，虚构）。
const FAKE_OCR_TEXT = [
  "房屋租赁合同（示例，虚构）",
  "甲方（出租方）：李某某 电话 138-0000-0000",
  "乙方（承租方）：王小明 身份证号 110101200001010000",
  "第一条 租赁期限自 2026 年 3 月 1 日至 2027 年 2 月 28 日，共 12 个月。月租金人民币 1500 元。",
  "第二条 押金人民币 4500 元。租赁期满或乙方提前退租的，押金归甲方所有，不予退还。",
  "第三条 租金由乙方一次性支付一年，交给甲方委托的中介公司账户，甲方不得直接向乙方收取租金。",
  "第四条 乙方提前退租的，应按三个月租金标准向甲方支付违约金；甲方提前收回房屋的，无需支付任何费用。",
  "第五条 甲方有权随时进入出租房屋检查使用情况，乙方不得拒绝。",
  "第六条 本合同未尽事宜由甲方解释，甲方保留最终解释权。",
  "签订日期：2026 年 2 月 20 日 签订地点：某大学南门外",
].join("\n");

function reply(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:8000");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return reply(res, 405, { ok: false, error: "method_not_allowed" });

  let raw = "";
  for await (const chunk of req) raw += chunk;

  if (url.pathname.endsWith("/ocr")) {
    if (process.env.QQY_OCR === "fail") return reply(res, 502, { ok: false, error: "ocr_empty" });
    let image = "";
    try {
      image = JSON.parse(raw).image ?? "";
    } catch {
      return reply(res, 400, { ok: false, error: "bad_json" });
    }
    if (!String(image).startsWith("data:image/")) {
      return reply(res, 400, { ok: false, error: "bad_image" });
    }
    return reply(res, 200, { ok: true, text: FAKE_OCR_TEXT, model: "fixture-ocr" });
  }

  if (!url.pathname.endsWith("/analyze")) {
    return reply(res, 404, { ok: false, error: "not_found" });
  }
  let prompt = "";
  try {
    prompt = JSON.parse(raw).prompt ?? "";
  } catch {
    return reply(res, 400, { ok: false, error: "bad_json" });
  }

  // 假模型：按行扫 [bN] 条款块，命中模式即返回对应 finding。
  const findings = [];
  for (const line of prompt.split("\n")) {
    const m = /^\[(b\d+)\]\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, blockId, text] = m;
    for (const { ruleId, re } of FAKE_PATTERNS) {
      if (re.test(text)) {
        findings.push({
          ruleId,
          blockId,
          explanation: "该条存在不对等安排，建议签约前问清解除与退还是否对等。",
          askTalk: "解除和退还条件能不能写对等？",
          rewrite: "建议改为：双方解除条件对等，提前15日书面通知。",
          aiSuggested: false,
        });
      }
    }
    if (findings.every((f) => f.blockId !== blockId) && /其它|其他约定/.test(text)) {
      findings.push({
        ruleId: "",
        blockId,
        explanation: "该条表述笼统，建议留意口头承诺是否写入。",
        askTalk: "口头承诺能否写进合同？",
        rewrite: "",
        aiSuggested: true,
      });
    }
  }

  const content = JSON.stringify({ contractType: "rent", findings });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, content }));
});

server.listen(8000, "127.0.0.1", () => {
  console.log("fixture function listening on http://127.0.0.1:8000");
});
