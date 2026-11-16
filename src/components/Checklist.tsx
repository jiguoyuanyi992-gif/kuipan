import { useEffect, useState } from "react";
import {
  CATEGORY_LABEL,
  checklistFor,
  type TrapCategory,
} from "@/src/core/traps";

interface Props {
  category: TrapCategory;
}

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

  useEffect(() => {
    if (list) save(list.storageKey, checked);
  }, [checked, category, list]);

  if (!list) return null;
  const done = list.items.filter((it) => checked[it.id]).length;

  return (
    <section
      className="space-y-3 rounded-[var(--site-radius)] border border-border p-4"
      style={{ backgroundColor: "var(--site-surface)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-title text-base">{CATEGORY_LABEL[category]} · 签约前检查清单</h3>
        <span className="text-xs text-muted-foreground">
          已核对 {done} / {list.items.length}
        </span>
      </div>
      <ul className="space-y-1">
        {list.items.map((it) => {
          const on = !!checked[it.id];
          return (
            <li key={it.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-sm leading-relaxed hover:bg-background">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    setChecked((prev) => ({ ...prev, [it.id]: e.target.checked }))
                  }
                  className="mt-1 shrink-0 accent-[var(--site-accent)]"
                />
                <span className={on ? "text-muted-foreground line-through" : undefined}>
                  {it.label}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        勾选只保存在你自己的浏览器里，可以随时清空重填；截图分享时记得别带上合同内容。
      </p>
    </section>
  );
}
