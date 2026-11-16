import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeAll } from "../analyze";
import { runModelPass, stripFences } from "../modelPass";
import { chunk } from "@/src/core/chunk";
import type { Block } from "@/src/core/types";

function blocks(n: number): Block[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `b${i + 1}`,
    index: i,
    text: `第${i + 1}条 测试内容`,
    start: 0,
    end: 0,
    kind: "clause" as const,
  }));
}

function modelResponse(content: unknown): Response {
  return Response.json({ ok: true, content: JSON.stringify(content) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stripFences", () => {
  it("剥掉 ```json 围栏", () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripFences('{"a":1}')).toBe('{"a":1}');
  });
});

describe("runModelPass 批次预算与流式回调", () => {
  it("每批成功即回调 onPartial，总调用 ≤8", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(url));
      const body = JSON.parse(String(init?.body)) as { prompt: string };
      const firstBlock = /\[(b\d+)\]/.exec(body.prompt)?.[1] ?? "b1";
      return modelResponse({
        contractType: "rent",
        findings: [
          {
            ruleId: "",
            blockId: firstBlock,
            explanation: "建议留意。",
            askTalk: "问一下。",
            rewrite: "",
            aiSuggested: true,
          },
        ],
      });
    }) as unknown as typeof fetch;

    const seen: number[] = [];
    const result = await runModelPass(blocks(20), [], (f) => seen.push(f.length), fetchImpl);
    expect(result.totalBatches).toBeLessThanOrEqual(8);
    expect(calls.length).toBe(result.totalBatches);
    expect(result.okBatches).toBe(result.totalBatches);
    expect(result.contractTypes.length).toBe(result.totalBatches);
    // 每次回调都比上一次多（累计到达）
    expect(seen.length).toBe(result.totalBatches);
    expect(seen[seen.length - 1]).toBeGreaterThanOrEqual(seen[0]);
  });

  it("全部批次失败 → 抛错（由调用方降级）", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    await expect(runModelPass(blocks(3), [], () => {}, fetchImpl)).rejects.toThrow(
      /unavailable/,
    );
  });

  it("部分失败不抛错，ok 批次照常回调", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n++;
      if (n === 1) throw new TypeError("boom");
      return modelResponse({ contractType: "rent", findings: [] });
    }) as unknown as typeof fetch;
    const result = await runModelPass(blocks(20), [], () => {}, fetchImpl);
    expect(result.okBatches).toBe(result.totalBatches - 1);
  });
});

describe("analyzeAll 主路径 + 降级", () => {
  const text = `第一条 租赁期限
租期12个月，月租金为人民币2000元，押金6000元。

第二条 押金
乙方提前退租的，押金不予退还。
`;

  it("模型命中合并进正则结果，状态 running→done", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { prompt: string };
      const blockId = /\[(b\d+)\]/.exec(body.prompt)?.[1] ?? "b1";
      return modelResponse({
        contractType: "internship",
        findings: [
          {
            ruleId: "",
            blockId,
            explanation: "该条存在不对等安排，建议留意。",
            askTalk: "双方权利是否对等？",
            rewrite: "",
            aiSuggested: true,
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchImpl);

    const updates: string[] = [];
    const final = await analyzeAll(text, "paste", undefined, undefined, (a) =>
      updates.push(a.modelStatus),
    );
    expect(final.modelStatus).toBe("done");
    expect(updates[0]).toBe("running");
    // 正则兜底命中仍在（押金不予退还）。
    expect(final.findings.some((f) => f.ruleId === "rent-deposit-forfeit")).toBe(true);
    // 模型建议并入（其他可疑条款）。
    expect(final.findings.some((f) => f.aiSuggested)).toBe(true);
    // AI 判定类型暴露给页面小标签，不自动改 doc.type。
    expect(final.aiType).toBe("internship");
    expect(final.doc.type).toBe("rent");
  });

  it("Function 不可用 → 只显示正则结果 + unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("failed to fetch");
      }),
    );
    let last = "";
    const final = await analyzeAll(text, "paste", undefined, undefined, (a) => {
      last = a.modelStatus;
    });
    expect(final.modelStatus).toBe("unavailable");
    expect(last).toBe("unavailable");
    // 正则结果不受影响。
    expect(final.findings.some((f) => f.ruleId === "rent-deposit-forfeit")).toBe(true);
    expect(chunk(text).length).toBeGreaterThan(0);
  });

  it("畸形模型返回按失败处理", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, content: "我觉得有风险" })),
    );
    const final = await analyzeAll(text, "paste", undefined, undefined, () => {});
    expect(final.modelStatus).toBe("unavailable");
  });
});
