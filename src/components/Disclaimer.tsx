export const DISCLAIMER =
  "本工具由学生团队开发，用于提示合同中可能存在的风险，不构成法律意见，不能替代律师或专业机构的审查。分析时，脱敏后的合同文本会发送给 AI 服务处理。最终是否签约，请你自己判断，必要时拨打 12348 法律服务热线，或向你所在学校的法律援助中心、法学院咨询。";

// 页头一行摘要（375px 单行放得下）：完整文案始终在每个页面页脚逐字出现。
export const DISCLAIMER_SUMMARY = "风险提示，不构成法律意见；完整说明见页脚。";

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-muted-foreground ${className}`}>
      {DISCLAIMER}
    </p>
  );
}