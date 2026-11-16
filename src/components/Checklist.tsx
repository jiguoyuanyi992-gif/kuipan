import { useEffect, useState } from "react";
import { checklistFor, type TrapCategory } from "@/src/core/traps";

interface Props {
  category: TrapCategory;
}

const KEY_ITEM_COUNT = 3;

// 勾选状态只存在浏览器本地（AGENTS.md 本地存储边界），不传服务端。
function load(key: string): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function save(key: string, value: Record<string, boolean>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 无痕或存储被禁用时静默降级：勾选仍然生效，只是刷新后不保留。
  }
}

export function Checklist({ category }: Props) {
  const list = checklistFor(category);
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    load(list?.storageKey ?? `qqy:checklist:${category}`),
  );
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (list) save(list.storageKey, checked);
  }, [checked, category, list]);

  if (!list) return null;
  const done = list.items.filter((it) => checked[it.id]).length;
  // 默认只露出前 3 项，让「最常见的坑」在 375px 首屏至少露出两张；进度始终是 x / 总数。
  const visible = showAll ? list.items : list.items.slice(0, KEY_ITEM_COUNT);

  return (
    <section
      className="space-y-2 rounded-[var(--site-radius)] border border-border p-3.5"
      style={{ backgroundColor: "var(--site-surface)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-title text-base">签约前检查清单</h2>
        <span className="text-xs text-muted-foreground">
          已核对 {done} / {list.items.length}
        </span>
      </div>
      <ul className="space-y-0.5">
        {visible.map((it) => {
          const on = !!checked[it.id];
          return (
            <li key={it.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm leading-snug hover:bg-background">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    setChecked((prev) => ({ ...prev, [it.id]: e.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--site-accent)]"
                />
                <span className={on ? "text-muted-foreground line-through" : undefined}>
                  {it.label}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {list.items.length > KEY_ITEM_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="text-xs underline decoration-border underline-offset-4 hover:text-[var(--site-accent)]"
        >
          {showAll ? "收起" : `查看全部 ${list.items.length} 项`}
        </button>
      )}
      <p className="text-xs text-muted-foreground">
        勾选只存在你自己的浏览器里。
      </p>
    </section>
  );
}
