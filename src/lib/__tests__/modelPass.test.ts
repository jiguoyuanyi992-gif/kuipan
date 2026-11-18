import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeAll, mergeAmounts } from "../analyze";
import { runModelPass, stripFences } from "../modelPass";
import { chunk } from "@/src/core/chunk";
import type { AmountTerms, Block } from "@/src/core/types";

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

describe("runModelPass extractedTerms 跨批合并", () => {
  it("字段分散在不同批次时按字段合并（首批只有 termMonths 也能补齐金额）", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n++;
      const extractedTerms =
        n % 2 === 1
          ? { termMonths: 12 }
          : { monthlyRent: "1,500", deposit: 4500 };
      return modelResponse({ contractType: "rent", findings: [], extractedTerms });
    }) as unknown as typeof fetch;
    const result = await runModelPass(blocks(20), [], () => {}, fetchImpl);
    expect(result.extractedTerms).toEqual({
      monthlyRent: 1500,
      deposit: 4500,
      termMonths: 12,
      penalty: undefined,
    });
  });

  it("全部批次都无 extractedTerms → 空对象（全 undefined），不报错", async () => {
    const fetchImpl = vi.fn(async () =>
      modelResponse({ contractType: "rent", findings: [] }),
    ) as unknown as typeof fetch;
    const result = await runModelPass(blocks(8), [], () => {}, fetchImpl);
    expect(result.extractedTerms).toEqual({
      monthlyRent: undefined,
      deposit: undefined,
      penalty: undefined,
      termMonths: undefined,
    });
  });
});

describe("analyzeAll 金额期限模型兜底", () => {
  // 本地正则抽不到的特殊写法：月租「租金:1500元/月」、押金「保证金」、期限「服务期」。
  const specialText = `第一条 费用
租金:1500元/月，乙方另付保证金4500元，违约方支付违约金3000元。

第二条 期限
服务期自2024年1月1日至2024年12月31日。
`;

  it("正则抽不到时用模型值填空，倍数按最终值重算", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        modelResponse({
          contractType: "rent",
          findings: [],
          extractedTerms: { monthlyRent: 1500, deposit: 4500, penalty: 3000, termMonths: 12 },
        }),
      ),
    );
    const final = await analyzeAll(specialText, "paste", undefined, undefined, () => {});
    expect(final.modelStatus).toBe("done");
    expect(final.amounts.monthlyRent).toBe(1500);
    expect(final.amounts.deposit).toBe(4500);
    expect(final.amounts.depositMonths).toBe(3);
    expect(final.amounts.penaltyMonths).toBe(2);
    expect(final.amounts.termMonths).toBe(12);
  });

  it("模型返回空 extractedTerms 时 amounts 保持本地值，不报错", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => modelResponse({ contractType: "rent", findings: [], extractedTerms: {} })),
    );
    const final = await analyzeAll(specialText, "paste", undefined, undefined, () => {});
    expect(final.modelStatus).toBe("done");
    expect(final.amounts.monthlyRent).toBeUndefined();
    expect(final.amounts.deposit).toBeUndefined();
    expect(final.amounts.termMonths).toBeUndefined();
  });

  it("正则能抽到时本地值优先，模型值不覆盖", async () => {
    // 本地正则可抽到「月租金为人民币2000元，押金6000元」→ depositMonths=3。
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        modelResponse({
          contractType: "rent",
          findings: [],
          extractedTerms: { monthlyRent: 9999, deposit: 1, termMonths: 1 },
        }),
      ),
    );
    const text = `第一条 租赁期限
租期12个月，月租金为人民币2000元，押金6000元。
`;
    const final = await analyzeAll(text, "paste", undefined, undefined, () => {});
    expect(final.amounts.monthlyRent).toBe(2000);
    expect(final.amounts.deposit).toBe(6000);
    expect(final.amounts.depositMonths).toBe(3);
    expect(final.amounts.termMonths).toBe(12);
  });
});

describe("mergeAmounts 单元", () => {
  const local: AmountTerms = { monthlyRent: 2000, currency: "CNY" };

  it("本地缺失字段用模型值补，倍数按合并后重算", () => {
    const m = mergeAmounts(local, { deposit: 6000 });
    expect(m.monthlyRent).toBe(2000);
    expect(m.deposit).toBe(6000);
    expect(m.depositMonths).toBe(3);
  });

  it("monthlyRent 为 0 时不产生 Infinity 倍数", () => {
    const m = mergeAmounts({ currency: "CNY" }, { monthlyRent: 0, deposit: 6000 });
    expect(m.depositMonths).toBeUndefined();
  });
});
