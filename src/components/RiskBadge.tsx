import type { Severity } from "@/src/core/types";
import { RISK_STYLE } from "./riskMeta";

export function RiskBadge({
  severity,
  className = "",
}: {
  severity: Severity;
  className?: string;
}) {
  const s = RISK_STYLE[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${className}`}
      style={{ color: s.color, backgroundColor: s.bg, border: `1px solid ${s.color}` }}
    >
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}