import type { Severity } from "@/src/core/types";

export interface RiskStyle {
  color: string;
  bg: string;
  icon: string;
  label: string;
}

export const RISK_STYLE: Record<Severity, RiskStyle> = {
  high: {
    color: "var(--risk-high)",
    bg: "var(--risk-high-bg)",
    icon: "⚠",
    label: "需重点留意",
  },
  medium: {
    color: "var(--risk-medium)",
    bg: "var(--risk-medium-bg)",
    icon: "!",
    label: "建议留意",
  },
  low: {
    color: "var(--risk-low)",
    bg: "var(--risk-low-bg)",
    icon: "○",
    label: "可留意",
  },
};

export const NONE_STYLE = {
  color: "var(--risk-low)",
  icon: "✓",
  label: "暂未发现明显风险",
};

export const TYPE_LABEL: Record<string, string> = {
  rent: "租房",
  internship: "实习兼职",
  other: "其他",
};