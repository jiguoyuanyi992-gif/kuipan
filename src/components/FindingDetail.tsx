import type { ContractType, Finding } from "@/src/core/types";
import { actionsForType } from "@/src/core/fallback/actions";
import { trapsForRuleId } from "@/src/core/traps";
import { RiskBadge } from "./RiskBadge";

interface Props {
  finding: Finding;
  // 无法律依据时的「签前怎么办」按当前分析的合同类型取场景补充。
  contractType?: ContractType;
  // 双向跳转：风险详情 → 陷阱库同类案例。
  onViewCases?: (trapId: string) => void;
}

export function FindingDetail({
  finding,
  contractType = "other",
  onViewCases,
}: Props) {
  const weak = finding.aiSuggested;
  const hasBasis = finding.verified && finding.legalBasis.length > 0;
  const cases = finding.aiSuggested ? [] : trapsForRuleId(finding.ruleId);
  return (
    <div
      data-rule-id={finding.ruleId}
      className="space-y-2 rounded-[var(--site-radius)] border border-border p-3 text-sm"
      style={{
        backgroundColor: weak ? "transparent" : "var(--site-surface)",
        borderLeft: weak
          ? "1px dashed var(--site-border)"
          : "3px solid var(--site-accent)",
        opacity: weak ? 0.85 : 1,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-title text-[15px]">{finding.title}</span>
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

      {hasBasis && (
        <div className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
          <p className="font-medium">法律依据</p>
          {finding.legalBasis.map((lb, i) => (
            <div key={i} className="space-y-0.5">
              <p>
                {lb.law} {lb.article}：{lb.quote}
              </p>
              <p className="text-[11px]">
                {lb.sourceUrl ? (
                  <a
                    href={lb.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-[var(--site-accent)]"
                  >
                    来源：{lb.source}
                  </a>
                ) : (
                  <>来源：{lb.source}</>
                )}
              </p>
              {lb.reprintUrl && (
                <p className="text-[11px]">
                  参考转载（不作依据）：
                  <a
                    href={lb.reprintUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-[var(--site-accent)]"
                  >
                    {new URL(lb.reprintUrl).hostname}
                  </a>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {finding.aiSuggested && (finding.possibleBasis?.length ?? 0) > 0 && (
        <div
          className="space-y-1 border-t border-dashed pt-2 text-xs text-muted-foreground"
          style={{ borderColor: "var(--site-border)" }}
        >
          <p className="font-medium">可能相关条文（仅供参考）</p>
          {finding.possibleBasis!.map((lb, i) => (
            <div key={i} className="space-y-0.5">
              <p>
                {lb.law} {lb.article}：{lb.quote}
              </p>
              <p className="text-[11px]">
                {lb.sourceUrl ? (
                  <a
                    href={lb.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-[var(--site-accent)]"
                  >
                    来源：{lb.source}
                  </a>
                ) : (
                  <>来源：{lb.source}</>
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      {!hasBasis && (
        <div className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
          {!finding.aiSuggested && finding.legalBasis.length > 0 && (
            <p>这一项的原文依据正在逐条复核，复核完成后才在这里显示。</p>
          )}
          <p className="font-medium">签前怎么办</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {actionsForType(contractType).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {cases.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {cases.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onViewCases?.(t.id)}
              className="rounded-[var(--site-radius)] border px-2.5 py-1 text-xs hover:border-[var(--site-accent)]"
              style={{ borderColor: "var(--site-accent)", color: "var(--site-accent)" }}
            >
              查看同类案例
            </button>
          ))}
        </div>
      )}
    </div>
  );
}