import { useEffect, useState } from "react";
import { checklistFor, type TrapCategory } from "@/src/core/traps";

interface Props {
  category: TrapCategory;
  // 嵌入卷轴纸面时去掉自己的外框材质，只保留内容（2026-11-18 照契卷轴指令）。
  embedded?: boolean;
}

const KEY_ITEM_COUNT = 3;

// 重点标签：纯展示层映射，按条目 id 挂在清单句子前面，不进数据文件。
// 5 个类别色固定，全站只用这 5 种（见 docs/design-spec.md）。
type TagCat = "subject" | "money" | "evidence" | "terms" | "deadline";

const CHECKLIST_TAGS: Record<string, { text: string; cat: TagCat }> = {
  // 租房
  "rent-owner": { text: "主体身份", cat: "subject" },
  "rent-livable": { text: "房源合法", cat: "subject" },
  "rent-deposit": { text: "押金条款", cat: "money" },
  "rent-fee": { text: "费用分摊", cat: "money" },
  "rent-meter": { text: "抄表留底", cat: "evidence" },
  "rent-condition": { text: "拍照留证", cat: "evidence" },
  "rent-pay": { text: "付款对公", cat: "money" },
  "rent-penalty": { text: "违约金", cat: "terms" },
  "rent-entry": { text: "进屋通知", cat: "terms" },
  "rent-term": { text: "租期通知", cat: "deadline" },
  // 实习兼职
  "intern-written": { text: "书面协议", cat: "terms" },
  "intern-kind": { text: "三方协议", cat: "subject" },
  "intern-pay": { text: "报酬发放", cat: "money" },
  "intern-probation": { text: "试用期薪", cat: "money" },
  "intern-nofee": { text: "拒交费用", cat: "money" },
  "intern-idcard": { text: "证件原件", cat: "subject" },
  "intern-hours": { text: "工时加班", cat: "terms" },
  "intern-penalty": { text: "违约金", cat: "terms" },
  "intern-content": { text: "岗位地点", cat: "terms" },
  "intern-record": { text: "记录留底", cat: "evidence" },
  // 贷款分期
  "loan-noneed": { text: "拒绝贷款", cat: "money" },
  "loan-paper": { text: "两份文本", cat: "terms" },
  "loan-party": { text: "放款主体", cat: "subject" },
  "loan-total": { text: "总还款额", cat: "money" },
  "loan-rate": { text: "年化利率", cat: "money" },
  "loan-quit": { text: "退出条款", cat: "terms" },
  "loan-nodouble": { text: "拒绝代借", cat: "money" },
  "loan-tell": { text: "告知家人", cat: "subject" },
  // 套餐
  "plan-price": { text: "优惠后价", cat: "money" },
  "plan-term": { text: "合约期限", cat: "deadline" },
  "plan-gift": { text: "到期转收", cat: "money" },
  "plan-throttle": { text: "限速阈值", cat: "terms" },
  "plan-addon": { text: "增值业务", cat: "terms" },
  "plan-change": { text: "变更通知", cat: "terms" },
  "plan-proof": { text: "截图留证", cat: "evidence" },
  // 考证
  "cert-pass": { text: "退费条件", cat: "money" },
  "cert-refund": { text: "退课退费", cat: "money" },
  "cert-fees": { text: "费用明细", cat: "money" },
  "cert-teacher": { text: "师资课表", cat: "terms" },
  "cert-term": { text: "课时期限", cat: "deadline" },
  "cert-party": { text: "机构一致", cat: "subject" },
  "cert-proof": { text: "凭证留底", cat: "evidence" },
  // 保险
  "ins-exempt": { text: "免责条款", cat: "terms" },
  "ins-waiting": { text: "等待期限", cat: "deadline" },
  "ins-deductible": { text: "赔付比例", cat: "money" },
  "ins-hesitation": { text: "犹豫期限", cat: "deadline" },
  "ins-cashvalue": { text: "现金价值", cat: "money" },
  "ins-bundle": { text: "拒绝搭售", cat: "money" },
  "ins-party": { text: "核对留证", cat: "evidence" },
  // 预付卡
  "pp-refund": { text: "退卡条件", cat: "money" },
  "pp-shop": { text: "闭店处理", cat: "terms" },
  "pp-gift": { text: "赠课期限", cat: "deadline" },
  "pp-term": { text: "课时期限", cat: "deadline" },
  "pp-transfer": { text: "转让规则", cat: "terms" },
  "pp-amount": { text: "充值金额", cat: "money" },
  "pp-proof": { text: "凭证留底", cat: "evidence" },
  // 租车
  "cr-check": { text: "验车拍照", cat: "evidence" },
  "cr-loss": { text: "损失上限", cat: "terms" },
  "cr-deposit": { text: "押金条款", cat: "money" },
  "cr-insurance": { text: "保险理赔", cat: "terms" },
  "cr-fees": { text: "费用明细", cat: "money" },
  "cr-party": { text: "资质核对", cat: "subject" },
  "cr-proof": { text: "凭证留底", cat: "evidence" },
  // 驾校
  "dr-fees": { text: "费用明细", cat: "money" },
  "dr-refund": { text: "退学退费", cat: "money" },
  "dr-term": { text: "培训期限", cat: "deadline" },
  "dr-booking": { text: "约车规则", cat: "terms" },
  "dr-site": { text: "场地条款", cat: "terms" },
  "dr-party": { text: "资质核对", cat: "subject" },
  "dr-proof": { text: "凭证留底", cat: "evidence" },
};

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

export function Checklist({ category, embedded = false }: Props) {
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
      className={
        embedded
          ? "space-y-1.5"
          : "paper chk-panel rounded-[var(--site-radius)] p-3.5 sm:p-4"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-title text-base">
          <span className="seal h-5 w-5 text-[10px]" aria-hidden>
            契
          </span>
          {embedded ? "签约前检查" : "签约前检查清单"}
        </h2>
        <span className="text-xs text-muted-foreground">
          已核对 {done} / {list.items.length}
        </span>
      </div>
      <ul className="chk-list mt-1.5">
        {visible.map((it) => {
          const on = !!checked[it.id];
          const tag = CHECKLIST_TAGS[it.id];
          return (
            <li key={it.id} className="chk-row" data-checked={on || undefined}>
              <label className="flex min-h-[2.3rem] cursor-pointer items-center gap-2 px-1 py-1.5 hover:bg-[rgba(180,140,80,0.10)]">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    setChecked((prev) => ({ ...prev, [it.id]: e.target.checked }))
                  }
                  className="h-4 w-4 shrink-0 accent-[var(--site-accent)]"
                />
                {tag && (
                  <span className="chk-tag" data-cat={tag.cat}>
                    {tag.text}
                  </span>
                )}
                <span
                  className={`min-w-0 text-[15px] leading-[1.7] ${
                    on ? "text-muted-foreground line-through" : undefined
                  }`}
                >
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
