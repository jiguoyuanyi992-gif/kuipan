import { useRef, useState } from "react";
import { DISCLAIMER } from "@/src/components/Disclaimer";
import { InputPage } from "@/src/pages/InputPage";
import { ResultPage } from "@/src/pages/ResultPage";
import { analyzeAll, type Analysis } from "@/src/lib/analyze";
import type { ContractSource, ContractType } from "@/src/core/types";

export default function App() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  // 每次分析一个代次号；返回/改选重分析都会作废上一代回调，避免旧批次覆盖新结果。
  const runId = useRef(0);

  function start(
    text: string,
    source: ContractSource,
    fileName?: string,
    typeOverride?: ContractType,
  ) {
    const my = ++runId.current;
    window.scrollTo({ top: 0 });
    void analyzeAll(text, source, fileName, typeOverride, (a) => {
      if (runId.current === my) setAnalysis(a);
    });
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="border-b border-border bg-[var(--site-surface)] px-5 py-2">
        <p className="mx-auto max-w-[1100px] text-xs leading-relaxed text-muted-foreground">
          {DISCLAIMER}
        </p>
      </div>

      {analysis ? (
        <ResultPage
          analysis={analysis}
          onBack={() => {
            runId.current++;
            setAnalysis(null);
          }}
          onReanalyze={(type) =>
            start(
              analysis.doc.text,
              analysis.doc.source,
              analysis.doc.fileName,
              type,
            )
          }
        />
      ) : (
        <InputPage
          onAnalyze={(text, source, fileName) => start(text, source, fileName)}
        />
      )}
    </div>
  );
}
