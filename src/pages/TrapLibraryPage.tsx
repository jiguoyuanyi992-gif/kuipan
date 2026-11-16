import { useEffect, useMemo, useRef, useState } from "react";
import { Checklist } from "@/src/components/Checklist";
import { Disclaimer } from "@/src/components/Disclaimer";
import {
  CATEGORY_LABEL,
  ruleIdForTrap,
  searchTraps,
  trapCategory,
  trapById,
  type TrapCategory,
} from "@/src/core/traps";
import type { TrapEntry } from "@/src/core/types";

const CATEGORIES: TrapCategory[] = ["rent", "internship", "loan"];

interface Props {
  // 从结果页「查看同类案例」跳转过来时高亮并滚动到该条目。
  focusTrapId: string | null;
  hasAnalysis: boolean;
  onBack: () => void;
  // 「用我的合同检查这一项」：有结果则回到结果页定位，否则回输入页并带提示。
  onCheckRule: (ruleId: string, title: string) => void;
}

function TrapCard({
  trap,
  focused,
  hasAnalysis,
  onCheckRule,
  cardRef,
}: {
  trap: TrapEntry;
  focused: boolean;
  hasAnalysis: boolean;
  onCheckRule: (ruleId: string, title: string) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
}) {
  const ruleId = ruleIdForTrap(trap);
  return (
    <article
      ref={cardRef}
      data-trap-id={trap.id}
      className="scroll-mt-6 space-y-3 rounded-[var(--site-radius)] border border-border p-4"
      style={{
        backgroundColor: "var(--site-surface)",
        borderColor: focused ? "var(--site-accent)" : undefined,
      }}
    >
      <h4 className="font-title text-base leading-snug">{trap.oneLiner}</h4>

      {trap.story && (
        <p className="text-sm leading-relaxed text-muted-foreground">{trap.story}</p>
      )}

      <div className="space-y-1 text-sm leading-relaxed">
        <p className="text-xs text-muted-foreground">识别特征</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {trap.traits.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-1 text-sm leading-relaxed">
        <p className="text-xs text-muted-foreground">签约前要问</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {trap.beforeSign.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-1 text-sm leading-relaxed">
        <p className="text-xs text-muted-foreground">被坑后怎么办</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {trap.afterHit.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>

      {trap.verified && trap.legalBasis.length > 0 && (
        <div className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
          <p className="font-medium">法律依据</p>
          {trap.legalBasis.map((lb, i) => (
            <p key={i}>
              {lb.law} {lb.article}：{lb.quote}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        {ruleId && (
          <button
            type="button"
            onClick={() => onCheckRule(ruleId, trap.oneLiner)}
            className="rounded-[var(--site-radius)] border px-3 py-1.5 text-sm hover:border-[var(--site-accent)]"
            style={{ borderColor: "var(--site-accent)", color: "var(--site-accent)" }}
          >
            {hasAnalysis ? "用我的合同检查这一项" : "粘贴合同，检查这一项"}
          </button>
        )}
        {!ruleId && (
          <span className="text-xs text-muted-foreground">
            这类不在合同检测范围内，供浏览学习。
          </span>
        )}
      </div>
    </article>
  );
}

export function TrapLibraryPage({
  focusTrapId,
  hasAnalysis,
  onBack,
  onCheckRule,
}: Props) {
  const focusTrap = focusTrapId ? trapById(focusTrapId) : undefined;
  const [category, setCategory] = useState<TrapCategory>(
    () => (focusTrap ? trapCategory(focusTrap) : "rent"),
  );
  const [keyword, setKeyword] = useState("");
  const focusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (focusTrap) setCategory(trapCategory(focusTrap));
  }, [focusTrap]);

  useEffect(() => {
    if (focusTrap) {
      focusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focusTrap, category]);

  const list = useMemo(() => searchTraps(keyword, category), [keyword, category]);

  return (
    <main className="mx-auto w-full max-w-[1100px] px-5 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-[var(--site-radius)] border border-border px-3 py-1.5 text-sm hover:border-[var(--site-accent)]"
          >
            ← 返回
          </button>
          <h1 className="font-title text-2xl">陷阱库 · 签约前先看看</h1>
        </div>
        <span className="text-xs text-muted-foreground">
          案例为脱敏整理，供浏览学习，不构成法律意见。
        </span>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const on = c === category;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCategory(c);
                    setKeyword("");
                  }}
                  className="rounded-[var(--site-radius)] border px-3 py-1.5 text-sm"
                  style={{
                    borderColor: on ? "var(--site-accent)" : undefined,
                    color: on ? "var(--site-accent)" : undefined,
                  }}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              );
            })}
          </div>

          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按关键词查找，例如「押金」「培训费」「分期」"
            className="w-full rounded-[var(--site-radius)] border border-border bg-background p-2.5 text-sm outline-none focus:border-[var(--site-accent)]"
            aria-label="检索陷阱条目"
          />

          <p className="text-xs text-muted-foreground">
            共 {list.length} 条{keyword ? `，关键词「${keyword.trim()}」` : ""}。
          </p>

          {list.length === 0 ? (
            <p
              className="rounded-[var(--site-radius)] border border-dashed border-border p-5 text-sm text-muted-foreground"
            >
              这一类里没有匹配「{keyword.trim()}」的条目，换个说法试试，或清空关键词浏览全部。
            </p>
          ) : (
            <div className="space-y-4">
              {list.map((t) => (
                <TrapCard
                  key={t.id}
                  trap={t}
                  focused={t.id === focusTrapId}
                  hasAnalysis={hasAnalysis}
                  onCheckRule={onCheckRule}
                  cardRef={
                    t.id === focusTrapId
                      ? (el) => {
                          focusRef.current = el;
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4 md:sticky md:top-6 md:self-start">
          {/* key 强制换类时重挂载，重新从 localStorage 读该类的勾选，避免跨类串状态 */}
          <Checklist key={category} category={category} />
        </aside>
      </div>

      <footer className="mt-8 border-t border-border pt-4">
        <Disclaimer />
      </footer>
    </main>
  );
}
