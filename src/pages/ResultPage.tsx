import type { ReactNode } from "react";
import { Disclaimer } from "@/src/components/Disclaimer";
import { FindingDetail } from "@/src/components/FindingDetail";
import { RiskBadge } from "@/src/components/RiskBadge";
import {
  NONE_STYLE,
  RISK_STYLE,
  TYPE_LABEL,
} from "@/src/components/riskMeta";
import { blockSeverity, type Analysis } from "@/src/lib/analyze";
import type { Block, ContractType, Finding } from "@/src/core/types";

interface Props {
  analysis: Analysis;
  onBack: () => void;
  onReanalyze: (type: ContractType) => void;
}

function money(n?: number): string {
  return n === undefined ? "—" : `¥${n.toLocaleString("zh-CN")}`;
}

function Highlighted({
  block,
  findings,
}: {
  block: Block;
  findings: Finding[];
}) {
  const ranges = findings
    .filter(
      (f) =>
        f.kind === "exist" &&
        f.matchStart !== undefined &&
        f.matchEnd !== undefined &&
        f.matchStart >= block.start &&
        f.matchEnd <= block.end,
    )
    .map((f) => ({
      start: f.matchStart! - block.start,
      end: f.matchEnd! - block.start,
      color: RISK_STYLE[f.severity].color,
    }))
    .sort((a, b) => a.start - b.start);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) nodes.push(block.text.slice(cursor, r.start));
    nodes.push(
      <mark
        key={i}
        style={{
          backgroundColor: "transparent",
          textDecoration: "underline",
          textDecorationColor: r.color,
          textDecorationThickness: "2px",
          textUnderlineOffset: "3px",
        }}
      >
        {block.text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < block.text.length) nodes.push(block.text.slice(cursor));
  return <>{nodes}</>;
}

export function ResultPage({ analysis, onBack, onReanalyze }: Props) {
  const { doc, findings, overall, amounts } = analysis;
  const isExample = doc.source === "example";
  const absent = findings.filter((f) => f.kind === "absent");
  const overallStyle =
    overall.level === "none" ? NONE_STYLE : RISK_STYLE[overall.level];

  return (
    <main className="mx-auto w-full max-w-[1100px] px-5 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-[var(--site-radius)] border border-border px-3 py-1.5 text-sm hover:border-[var(--site-accent)]"
          >
            ← 返回
          </button>
          <h1 className="font-title text-2xl">签前一查 · 分析结果</h1>
        </div>
        {isExample && (
          <span
            className="rounded px-2 py-1 text-xs"
            style={{
              color: "var(--site-accent)",
              backgroundColor: "var(--risk-high-bg)",
            }}
          >
            示例，虚构
          </span>
        )}
      </header>

      <section
        className="mb-6 space-y-4 rounded-[var(--site-radius)] border border-border p-5"
        style={{ backgroundColor: "var(--site-surface)" }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="inline-flex items-center gap-2 rounded px-3 py-1 text-base font-medium"
            style={{ color: overallStyle.color, backgroundColor: overall.level === "none" ? "var(--risk-low-bg)" : RISK_STYLE[overall.level].bg }}
          >
            <span aria-hidden>{overallStyle.icon}</span>
            {overall.label}
          </span>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            合同类型
            <select
              value={doc.type}
              onChange={(e) => onReanalyze(e.target.value as ContractType)}
              className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
            >
              <option value="rent">租房</option>
              <option value="internship">实习兼职</option>
              <option value="other">其他</option>
            </select>
          </label>
          <span className="text-sm text-muted-foreground">
            当前：{TYPE_LABEL[doc.type]}
          </span>
          {analysis.modelStatus === "done" &&
            analysis.aiType &&
            analysis.aiType !== doc.type && (
              <span className="rounded bg-[var(--risk-low-bg)] px-2 py-1 text-xs text-muted-foreground">
                AI 判定：{TYPE_LABEL[analysis.aiType]}，可在上方改选重新分析
              </span>
            )}
        </div>

        {analysis.modelStatus === "running" && (
          <p className="text-sm text-muted-foreground">
            智能分析批次返回中，结果将逐条补充。
          </p>
        )}
        {analysis.modelStatus === "unavailable" && (
          <p
            className="text-sm"
            style={{ color: "var(--risk-medium)" }}
          >
            智能分析暂不可用，当前显示本地规则检查结果。
          </p>
        )}

        <p className="text-sm leading-relaxed">{overall.reason}</p>

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">月租 / 金额</dt>
            <dd className="font-medium">{money(amounts.monthlyRent)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">押金</dt>
            <dd className="font-medium">
              {money(amounts.deposit)}
              {amounts.depositMonths !== undefined && (
                <span className="ml-1 text-xs text-muted-foreground">
                  （月租×{amounts.depositMonths}）
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">期限</dt>
            <dd className="font-medium">
              {amounts.termMonths === undefined ? "—" : `${amounts.termMonths} 个月`}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">违约金</dt>
            <dd className="font-medium">{money(amounts.penalty)}</dd>
          </div>
        </dl>
      </section>

      {absent.length > 0 && (
        <section className="mb-6 space-y-2">
          <h2 className="font-title text-lg">缺失的条款</h2>
          {absent.map((f, i) => (
            <FindingDetail key={`absent-${i}`} finding={f} />
          ))}
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <nav className="md:sticky md:top-6 md:self-start">
          <h2 className="mb-2 font-title text-lg">条款目录</h2>
          <ul className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible">
            {doc.blocks.map((b) => {
              const sev = blockSeverity(b.id, findings);
              const style = sev ? RISK_STYLE[sev] : null;
              const snippet = b.text.replace(/\s+/g, " ").trim().slice(0, 18);
              return (
                <li key={b.id} className="shrink-0 md:shrink">
                  <button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById(b.id)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--site-surface)]"
                  >
                    <span
                      aria-hidden
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs"
                      style={{
                        color: style ? style.color : "var(--site-muted)",
                        backgroundColor: style ? style.bg : "var(--risk-low-bg)",
                      }}
                    >
                      {style ? style.icon : "✓"}
                    </span>
                    <span className="truncate">{snippet || `条款 ${b.index + 1}`}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section className="space-y-4">
          {doc.blocks.map((b) => {
            const sev = blockSeverity(b.id, findings);
            const blockFindings = findings.filter((f) => f.blockId === b.id);
            return (
              <article
                key={b.id}
                id={b.id}
                className="scroll-mt-6 space-y-3 rounded-[var(--site-radius)] border border-border p-4"
                style={{ backgroundColor: sev ? RISK_STYLE[sev].bg : "var(--site-surface)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    条款 {b.index + 1}
                  </span>
                  {sev && <RiskBadge severity={sev} />}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  <Highlighted block={b} findings={blockFindings} />
                </p>
                {blockFindings.map((f, i) => (
                  <FindingDetail key={`${b.id}-${i}`} finding={f} />
                ))}
              </article>
            );
          })}
        </section>
      </div>

      <footer className="mt-8 border-t border-border pt-4">
        <Disclaimer />
      </footer>
    </main>
  );
}