// 本地 Function fixture：Deno 未安装时，用 Node 模拟 /functions/v1/app/analyze。
// 只喂编造示例合同做流程级验证（合并、流式、降级），不接百炼。
// 用法：node dev/function-fixture.mjs  （vite dev/preview 已把 /functions/v1/app 代理到 127.0.0.1:8000）
import { createServer } from "node:http";

const FAKE_PATTERNS = [
  { ruleId: "rent-deposit-forfeit", re: /押金[^。]*(不予退还|归甲方)/ },
  { ruleId: "common-unilateral-terminate", re: /(随时解除|最终解释权)/ },
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:8000");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" || !url.pathname.endsWith("/analyze")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
    return;
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let prompt = "";
  try {
    prompt = JSON.parse(raw).prompt ?? "";
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "bad_json" }));
    return;
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
