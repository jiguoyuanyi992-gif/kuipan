import { useEffect, useMemo, useRef, useState } from "react";
import { Checklist } from "@/src/components/Checklist";
import { Disclaimer } from "@/src/components/Disclaimer";
import { RiskBadge } from "@/src/components/RiskBadge";
import { ruleById } from "@/src/core/rules";
import {
  CATEGORY_LABEL,
  ruleIdForTrap,
  trapById,
  trapCategory,
  trapsByCategory,
  type TrapCategory,
} from "@/src/core/traps";
import type { Severity, TrapEntry } from "@/src/core/types";

const CATEGORIES_ALL: TrapCategory[] = ["rent", "internship", "loan"];

// 每段默认只显示最关键的 3 条，其余在「查看全部」里。
const KEY_ITEM_COUNT = 3;

// 页面层的展示优先级：哪些条目算「最常见的坑」。只决定顺序，不改陷阱库数据本身。
const PINNED_TRAP_IDS: Record<TrapCategory, string[]> = {
  rent: [
    "trap-rent-deposit-forfeit",
    "trap-rent-agent-collects-rent",
    "trap-rent-penalty-high",
  ],
  internship: [
    "trap-intern-collects-money",
    "trap-intern-unpaid-probation",
    "trap-intern-penalty-clause",
  ],
  loan: ["trap-loan-training-loan", "trap-loan-installment-fees"],
};

interface Props {
  // 从结果页「查看同类案例」跳转过来时高亮并滚动到该条目。
  focusTrapId: string | null;
  hasAnalysis: boolean;
  onBack: () => void;
  // 「用我的合同检查这一项」：有结果则回到结果页定位，否则回输入页并带提示。
  onCheckRule: (ruleId: string, title: string) => void;
}

interface TrapView {
  trap: TrapEntry;
  // 对应检测规则（贷款分期条目没有，故只做浏览学习）。
  ruleTitle?: string;
  severity?: Severity;
  hazard?: string;
}

function toView(trap: TrapEntry): TrapView {
  const ruleId = ruleIdForTrap(trap);
  const rule = ruleId ? ruleById(ruleId) : undefined;
  return {
    trap,
    // 没有对应规则时，一句话概括本身就是标题，不再重复一遍危害行。
    ruleTitle: rule?.title,
    severity: rule?.severity,
    hazard: rule ? trap.oneLiner : undefined,
  };
}

function ItemList({ items }: { items: string[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, KEY_ITEM_COUNT);
  return (
    <div className="space-y-1">
      <ul className="list-disc space-y-0.5 pl-5 text-sm leading-relaxed">
        {visible.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
      {items.length > KEY_ITEM_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs underline decoration-border underline-offset-4 hover:text-[var(--site-accent)]"
        >
          {showAll ? "收起" : `查看全部 ${items.length} 条`}
        </button>
      )}
    </div>
  );
}

function TrapBody({
  view,
  hasAnalysis,
  onCheckRule,
}: {
  view: TrapView;
  hasAnalysis: boolean;
  onCheckRule: (ruleId: string, title: string) => void;
}) {
  const { trap } = view;
  const ruleId = ruleIdForTrap(trap);
  return (
    <div className="space-y-3 border-t border-border pt-3">
      {trap.story && (
        <p className="text-sm leading-relaxed text-muted-foreground">{trap.story}</p>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">识别特征</p>
        <ItemList items={trap.traits} />
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">签约前要问</p>
        <ItemList items={trap.beforeSign} />
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">被坑后怎么办</p>
        <ItemList items={trap.afterHit} />
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
    </div>
  );
}

function TrapCard({
  view,
  expanded,
  focused,
  hasAnalysis,
  onToggle,
  onCheckRule,
  cardRef,
}: {
  view: TrapView;
  expanded: boolean;
  focused: boolean;
  hasAnalysis: boolean;
  onToggle: () => void;
  onCheckRule: Props["onCheckRule"];
  cardRef?: (el: HTMLElement | null) => void;
}) {
  const { trap } = view;
  const title = view.ruleTitle ?? trap.oneLiner;
  return (
    <article
      ref={cardRef}
      data-trap-id={trap.id}
      className="scroll-mt-4"
    >
      <div
        className="rounded-[var(--site-radius)] border border-border"
        style={{
          backgroundColor: "var(--site-surface)",
          borderColor: focused ? "var(--site-accent)" : undefined,
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left"
        >
          <span className="mt-0.5 shrink-0">
            {view.severity ? (
              <RiskBadge severity={view.severity} />
            ) : (
              <span className="inline-block rounded bg-background px-2 py-0.5 text-xs text-muted-foreground">
                {CATEGORY_LABEL[trapCategory(trap)]}
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-title text-[15px] leading-snug">{title}</span>
            {view.hazard && (
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {view.hazard}
              </span>
            )}
          </span>
          <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">
            {expanded ? "收起" : "展开"}
          </span>
        </button>

        {/* 折叠态不渲染正文：一屏能放下更多卡片，检查按钮也不会重复出现。 */}
        {expanded && (
          <div className="px-3.5 pb-3.5">
            <TrapBody view={view} hasAnalysis={hasAnalysis} onCheckRule={onCheckRule} />
          </div>
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
  // 有内容的分类才出标签；某类若全部条目都没有可展示内容就隐藏。
  const categories = useMemo(
    () =>
      CATEGORIES_ALL.filter((c) =>
        trapsByCategory(c).some(
          (t) =>
            t.story.trim() !== "" ||
            t.traits.length + t.beforeSign.length + t.afterHit.length > 0,
        ),
      ),
    [],
  );

  const focusTrap = focusTrapId ? trapById(focusTrapId) : undefined;

  const [category, setCategory] = useState<TrapCategory>(() =>
    focusTrap ? trapCategory(focusTrap) : categories[0] ?? "rent",
  );
  const [expandedId, setExpandedId] = useState<string | null>(() => focusTrapId ?? null);
  const [moreOpen, setMoreOpen] = useState(false);
  const focusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (focusTrap) setCategory(trapCategory(focusTrap));
  }, [focusTrap]);

  // 从结果页跳转过来时，直接展开对应卡片；若它在「更多陷阱」里就一并打开。
  useEffect(() => {
    if (!focusTrap) return;
    setExpandedId(focusTrap.id);
    if (!PINNED_TRAP_IDS[trapCategory(focusTrap)].includes(focusTrap.id)) {
      setMoreOpen(true);
    }
  }, [focusTrap]);

  useEffect(() => {
    if (focusTrap) focusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusTrap, category, expandedId, moreOpen]);

  const { pinned, rest } = useMemo(() => {
    const views = trapsByCategory(category).map(toView);
    const order = PINNED_TRAP_IDS[category] ?? [];
    const byId = new Map(views.map((v) => [v.trap.id, v]));
    const head = order.map((id) => byId.get(id)).filter((v): v is TrapView => !!v);
    return { pinned: head, rest: views.filter((v) => !order.includes(v.trap.id)) };
  }, [category]);

  const list = [...pinned, ...rest];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-5 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-[var(--site-radius)] border border-border px-3 py-1.5 text-sm hover:border-[var(--site-accent)]"
          >
            ← 返回
          </button>
          <h1 className="font-title text-xl sm:text-2xl">陷阱库</h1>
        </div>
        <span className="text-xs text-muted-foreground">签约前先核一遍</span>
      </header>

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const on = c === category;
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCategory(c);
                setExpandedId(null);
                setMoreOpen(false);
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

      {/* 主入口：先对着清单把自己合同的这几项打勾，再看具体坑。 */}
      {/* key 强制换类时重挂载，重新从 localStorage 读该类的勾选，避免跨类串状态 */}
      <Checklist key={category} category={category} />

      <section className="space-y-2.5">
        <h2 className="font-title text-base">最常见的 {pinned.length} 个坑</h2>
        <div className="space-y-2">
          {pinned.map((v) => (
            <TrapCard
              key={v.trap.id}
              view={v}
              expanded={expandedId === v.trap.id}
              focused={v.trap.id === focusTrapId}
              hasAnalysis={hasAnalysis}
              onToggle={() =>
                setExpandedId((prev) => (prev === v.trap.id ? null : v.trap.id))
              }
              onCheckRule={onCheckRule}
              cardRef={
                v.trap.id === focusTrapId
                  ? (el) => {
                      focusRef.current = el;
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </section>

      {rest.length > 0 && (
        <section className="space-y-2.5">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <h2 className="font-title text-base">更多陷阱（{rest.length}）</h2>
            <span className="text-xs text-muted-foreground">
              {moreOpen ? "收起" : "展开"}
            </span>
          </button>
          {moreOpen && (
            <div className="space-y-2">
              {rest.map((v) => (
                <TrapCard
                  key={v.trap.id}
                  view={v}
                  expanded={expandedId === v.trap.id}
                  focused={v.trap.id === focusTrapId}
                  hasAnalysis={hasAnalysis}
                  onToggle={() =>
                    setExpandedId((prev) => (prev === v.trap.id ? null : v.trap.id))
                  }
                  onCheckRule={onCheckRule}
                  cardRef={
                    v.trap.id === focusTrapId
                      ? (el) => {
                          focusRef.current = el;
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="mt-auto border-t border-border pt-4">
        <Disclaimer />
      </footer>
    </main>
  );
}
