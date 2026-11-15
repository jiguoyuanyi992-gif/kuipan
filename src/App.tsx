export default function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 p-8">
      <header className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">签前一查</h1>
        <p className="text-base text-muted-foreground">大学生合同防坑助手</p>
      </header>
      <p className="text-sm text-muted-foreground">站点建设中，核心功能即将上线。</p>
      <footer className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
        本工具由学生团队开发，用于提示合同中可能存在的风险，不构成法律意见，不能替代律师或专业机构的审查。分析时，脱敏后的合同文本会发送给 AI 服务处理。最终是否签约，请你自己判断，必要时拨打 12348 法律服务热线，或向你所在学校的法律援助中心、法学院咨询。
      </footer>
    </main>
  );
}