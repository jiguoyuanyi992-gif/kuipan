import { useRef, useState } from "react";
import { DISCLAIMER_SUMMARY } from "@/src/components/Disclaimer";
import { InputPage } from "@/src/pages/InputPage";
import { ResultPage } from "@/src/pages/ResultPage";
import { TrapLibraryPage } from "@/src/pages/TrapLibraryPage";
import { analyzeAll, type Analysis } from "@/src/lib/analyze";
import type { ContractSource, ContractType } from "@/src/core/types";

// 三个视图用状态切换，不引入客户端深路由（站点 spa=false）。
type View = "input" | "result" | "traps";

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

  function openTraps(trapId: string | null) {
    setFocusTrapId(trapId);
    setView("traps");
    window.scrollTo({ top: 0 });
  }

  // 陷阱条目 →「用我的合同检查这一项」。
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
    <div className="min-h-dvh bg-background text-foreground">
      <div className="border-b border-border bg-[var(--site-surface)] px-5 py-1.5">
        <p className="mx-auto max-w-[1100px] text-xs text-muted-foreground">
          {DISCLAIMER_SUMMARY}
        </p>
      </div>

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
          onViewCases={(trapId) => openTraps(trapId)}
          onOpenTraps={() => openTraps(null)}
        />
      ) : view === "traps" ? (
        <TrapLibraryPage
          focusTrapId={focusTrapId}
          hasAnalysis={!!analysis}
          onBack={() => setView(analysis ? "result" : "input")}
          onCheckRule={checkRule}
        />
      ) : (
        <InputPage
          checkHint={checkHint}
          onOpenTraps={() => openTraps(null)}
          onAnalyze={(text, source, fileName) => start(text, source, fileName)}
        />
      )}
    </div>
  );
}
