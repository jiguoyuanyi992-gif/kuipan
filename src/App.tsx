import { useState } from "react";
import { DISCLAIMER } from "@/src/components/Disclaimer";
import { InputPage } from "@/src/pages/InputPage";
import { ResultPage } from "@/src/pages/ResultPage";
import { analyzeText, type Analysis } from "@/src/lib/analyze";
import type { ContractSource, ContractType } from "@/src/core/types";

export default function App() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);

  function handleAnalyze(
    text: string,
    source: ContractSource,
    fileName?: string,
  ) {
    setBusy(true);
    setAnalysis(analyzeText(text, source, fileName));
    setBusy(false);
    window.scrollTo({ top: 0 });
  }

  function handleReanalyze(type: ContractType) {
    if (!analysis) return;
    setAnalysis(
      analyzeText(
        analysis.doc.text,
        analysis.doc.source,
        analysis.doc.fileName,
        type,
      ),
    );
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
          onBack={() => setAnalysis(null)}
          onReanalyze={handleReanalyze}
        />
      ) : (
        <InputPage busy={busy} onAnalyze={handleAnalyze} />
      )}
    </div>
  );
}