import type { Finding } from "@/src/core/types";
import { trapsForRuleId } from "@/src/core/traps";
import { RiskBadge } from "./RiskBadge";

interface Props {
  finding: Finding;
  // 双向跳转：风险详情 → 陷阱库同类案例。
  onViewCases?: (trapId: string) => void;
}

export function FindingDetail({ finding, onViewCases }: Props) {
  const weak = finding.aiSuggested;
  const cases = finding.aiSuggested ? [] : trapsForRuleId(finding.ruleId);
  return (
    <div
      data-rule-id={finding.ruleId}
      className="space-y-2 rounded-[var(--site-radius)] border border-border p-3 text-sm"
      style={{
        backgroundColor: weak ? "transparent" : "var(--site-surface)",
        opacity: weak ? 0.85 : 1,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{finding.title}</span>
        {weak ? (
          <span className="text-xs text-muted-foreground">建议留意</span>
        ) : (
          <RiskBadge severity={finding.severity} />
        )}
        {finding.kind === "absent" && (
          <span className="text-xs text-muted-foreground">（整份合同缺失）</span>
        )}
      </div>

      <p className="leading-relaxed">{finding.explanation}</p>

      {finding.askTalk && (
        <p className="leading-relaxed">
          <span className="text-muted-foreground">签约前可以问：</span>
          {finding.askTalk}
        </p>
      )}

      {finding.rewrite && (
        <p className="leading-relaxed">
          <span className="text-muted-foreground">改写建议：</span>
          {finding.rewrite}
          <span className="ml-1 text-xs text-muted-foreground">
            （AI 生成，仅供参考）
          </span>
        </p>
      )}

      {finding.verified && finding.legalBasis.length > 0 && (
        <div className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
          <p className="font-medium">法律依据</p>
          {finding.legalBasis.map((lb, i) => (
            <p key={i}>
              {lb.law} {lb.article}：{lb.quote}
            </p>
          ))}
        </div>
      )}

      {!finding.aiSuggested &&
        !finding.verified &&
        finding.legalBasis.length > 0 && (
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">
            这一项的原文依据正在逐条复核，复核完成后才在这里显示。
          </p>
        )}

      {cases.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {cases.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onViewCases?.(t.id)}
              className="rounded-[var(--site-radius)] border px-2.5 py-1 text-xs hover:border-[var(--site-accent)]"
            >
              查看同类案例
            </button>
          ))}
        </div>
      )}
    </div>
  );
}