import type { Finding, OverallLevel, OverallRisk, Severity } from "./types";

// 每档风险标识：图标 + 文字，不得只靠颜色。
export const SEVERITY_META: Record<Severity, { icon: string; label: string }> = {
  high: { icon: "⚠", label: "需重点留意" },
  medium: { icon: "!", label: "建议留意" },
  low: { icon: "○", label: "可留意" },
};

export const NONE_META = { icon: "✓", label: "暂未发现明显风险" };

const RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

function topTitles(findings: Finding[], limit = 3): string {
  const seen: string[] = [];
  for (const f of findings) {
    if (!seen.includes(f.title)) seen.push(f.title);
    if (seen.length >= limit) break;
  }
  return seen.join("、");
}

// 总体三档：存在 high → 需重点留意；最高 medium/low → 建议留意；零命中 → 暂未发现明显风险。
// 理由句由本地模板拼接，占位词取规则库 title，不由模型填。档位名不得出现「安全」。
export function overallRisk(findings: Finding[]): OverallRisk {
  if (findings.length === 0) {
    return {
      level: "none",
      label: NONE_META.label,
      reason: "暂未发现明显风险，仍建议逐条阅读并核对押金、违约与解除条款。",
    };
  }

  let level: OverallLevel = "low";
  let top: Severity = "low";
  for (const f of findings) {
    if (RANK[f.severity] > RANK[top]) top = f.severity;
  }
  level = top;

  if (top === "high") {
    const high = findings.filter((f) => f.severity === "high");
    return {
      level,
      label: "需重点留意",
      reason: `存在 ${high.length} 处需重点留意的条款，主要集中在${topTitles(high)}。`,
    };
  }

  const label = "建议留意";
  return {
    level,
    label,
    reason: `存在 ${findings.length} 处建议留意的条款，主要集中在${topTitles(findings)}。`,
  };
}