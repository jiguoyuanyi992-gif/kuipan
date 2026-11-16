import { useRef, useState } from "react";
import { SiteFooter, SiteHeader, type NavKey } from "@/src/components/SiteChrome";
import { ContractsPage } from "@/src/pages/ContractsPage";
import { GhostsPage } from "@/src/pages/GhostsPage";
import { InputPage } from "@/src/pages/InputPage";
import { ResultPage } from "@/src/pages/ResultPage";
import { analyzeAll, type Analysis } from "@/src/lib/analyze";
import type { ContractSource, ContractType } from "@/src/core/types";

// 四个视图用状态切换，不引入客户端深路由（站点 spa=false）。
type View = "input" | "result" | "ghosts" | "contracts";

export default function App() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [view, setView] = useState<View>("input");
  const [focusTrapId, setFocusTrapId] = useState<string | null>(null);
  const [highlightRuleId, setHighlightRuleId] = useState<string | null>(null);
  const [checkHint, setCheckHint] = useState<string | null>(null);
  // 每次分析一个代次号；返回/改选重分析都会作废上一代回调，避免旧批次覆盖新结果。
  const runId = useRef(0);

  function start(
    text: string,
    source: ContractSource,
    fileName?: string,
    typeOverride?: ContractType,
  ) {
    const my = ++runId.current;
    setHighlightRuleId(null);
    setCheckHint(null);
    setView("result");
    window.scrollTo({ top: 0 });
    void analyzeAll(text, source, fileName, typeOverride, (a) => {
      if (runId.current === my) setAnalysis(a);
    });
  }

  function nav(key: NavKey) {
    setFocusTrapId(null);
    setView(key);
    window.scrollTo({ top: 0 });
  }

  // 结果页「查看同类案例」→ 照契对应合同类型的卷轴。
  function openContracts(trapId: string | null) {
    setFocusTrapId(trapId);
    setView("contracts");
    window.scrollTo({ top: 0 });
  }

  // 典例「用我的合同检查这一项」：有结果回结果页定位，否则回首页带提示。
  function checkRule(ruleId: string, title: string) {
    setFocusTrapId(null);
    if (analysis) {
      setHighlightRuleId(ruleId);
      setCheckHint(null);
      setView("result");
      window.scrollTo({ top: 0 });
    } else {
      setHighlightRuleId(null);
      setCheckHint(`粘贴或选择一份合同，分析结果会检查这一项：${title}`);
      setView("input");
      window.scrollTo({ top: 0 });
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <SiteHeader active={view === "result" ? "input" : view} onNav={nav} />

      {view === "result" && analysis ? (
        <ResultPage
          analysis={analysis}
          highlightRuleId={highlightRuleId}
          onBack={() => {
            runId.current++;
            setAnalysis(null);
            setHighlightRuleId(null);
            setView("input");
          }}
          onReanalyze={(type) =>
            start(
              analysis.doc.text,
              analysis.doc.source,
              analysis.doc.fileName,
              type,
            )
          }
          onViewCases={(trapId) => openContracts(trapId)}
          onOpenContracts={() => openContracts(null)}
        />
      ) : view === "ghosts" ? (
        <GhostsPage />
      ) : view === "contracts" ? (
        <ContractsPage
          focusTrapId={focusTrapId}
          hasAnalysis={!!analysis}
          onBack={() => setView(analysis ? "result" : "input")}
          onCheckRule={checkRule}
        />
      ) : (
        <InputPage
          checkHint={checkHint}
          onAnalyze={(text, source, fileName) => start(text, source, fileName)}
        />
      )}

      <SiteFooter />
    </div>
  );
}