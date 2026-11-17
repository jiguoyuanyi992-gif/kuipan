import { useEffect, useMemo, useRef, useState } from "react";
import contractsJson from "../../data/contracts.json";
import { Checklist } from "@/src/components/Checklist";
import { ruleById } from "@/src/core/rules";
import { actionsForType } from "@/src/core/fallback/actions";
import { ruleIdForTrap, trapById, type TrapCategory } from "@/src/core/traps";
import { CONTRACT_TYPES } from "@/src/core/types";
import type { ContractType, RiskRule, TrapEntry } from "@/src/core/types";

interface ContractTypeEntry {
  id: string;
  label: string;
  checklist?: TrapCategory;
  // 法条只存 rule_id，原文永远从规则库读取，不复制进本文件。
  ruleIds: string[];
  trapIds: string[];
}

const contractTypes = (contractsJson as { types: ContractTypeEntry[] }).types;

function typeForTrap(trapId: string): ContractTypeEntry | undefined {
  return contractTypes.find((t) => t.trapIds.includes(trapId));
}

// 典例分析里的重要词显眼变红：只做展示层强调，不改数据。
const RED_WORDS = [
  "自动续费",
  "最终解释权",
  "随时解除",
  "个人账户",
  "培训贷",
  "服务费",
  "资料费",
  "管理费",
  "担保费",
  "续期费",
  "违约金",
  "零元学",
  "试用期",
  "押金",
  "续费",
  "扣款",
  "分期",
  "利率",
  "中介",
  "证件",
  "无薪",
  "高薪",
  "合计",
  "口头",
].sort((a, b) => b.length - a.length);
const RED_RE = new RegExp(`(${RED_WORDS.join("|")})`, "g");

function RedText({ text }: { text: string }) {
  const parts = text.split(RED_RE);
  return (
    <>
      {parts.map((p, i) =>
        RED_WORDS.includes(p) ? (
          <span key={i} className="font-medium" style={{ color: "var(--risk-high)" }}>
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="list-disc space-y-1 pl-5 text-[15px] leading-[1.7]">
      {items.map((t, i) => (
        <li key={i}>
          <RedText text={t} />
        </li>
      ))}
    </ul>
  );
}

function CaseStudy({
  trap,
  hasAnalysis,
  onCheckRule,
  focused,
  caseRef,
}: {
  trap: TrapEntry;
  hasAnalysis: boolean;
  onCheckRule: (ruleId: string, title: string) => void;
  focused: boolean;
  caseRef?: (el: HTMLElement | null) => void;
}) {
  const ruleId = ruleIdForTrap(trap);
  const rule = ruleId ? ruleById(ruleId) : undefined;
  const title = rule?.title ?? trap.oneLiner;
  return (
    <article
      ref={caseRef}
      data-trap-id={trap.id}
      className="scroll-mt-4 space-y-3 rounded-[var(--site-radius)] border-t-2 pt-4"
      style={{ borderColor: focused ? "var(--site-accent)" : "var(--paper-border)" }}
    >
      {/* 上方：左侧典例来源链接，右侧标题与一句话概要 */}
      <div className="flex gap-3">
        <a
          href={trap.caseSourceUrl}
          target="_blank"
          rel="noreferrer"
          title={`查看典例来源：${title}`}
          className="flex h-24 w-20 shrink-0 items-center justify-center rounded border"
          style={{ borderColor: "var(--paper-border)", backgroundColor: "#e3d6bc" }}
        >
          <span
            className="vertical-rl font-title text-xs"
            style={{ color: "var(--site-accent)" }}
          >
            典例来源
          </span>
        </a>
        <div className="min-w-0 space-y-1">
          <h3 className="font-title text-base leading-snug">{title}</h3>
          <p className="text-[15px] leading-[1.7] text-muted-foreground">
            <RedText text={trap.oneLiner} />
          </p>
        </div>
      </div>

      {/* 下方整宽：分析文字，全部来自现有陷阱库与规则库字段 */}
      <div className="space-y-2.5">
        {trap.story && (
          <p className="text-[15px] leading-[1.7] text-muted-foreground">{trap.story}</p>
        )}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">哪个条款是坑</p>
          <BulletList items={trap.traits} />
        </div>
        {rule?.why && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">为什么</p>
            <p className="text-[15px] leading-[1.7]">
              <RedText text={rule.why} />
            </p>
          </div>
        )}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">签前怎么办</p>
          <BulletList items={trap.beforeSign} />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">被坑后怎么办</p>
          <BulletList items={trap.afterHit} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        {ruleId ? (
          <button
            type="button"
            onClick={() => onCheckRule(ruleId, trap.oneLiner)}
            className="rounded-[var(--site-radius)] border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--site-accent)", color: "var(--site-accent)" }}
          >
            {hasAnalysis ? "用我的合同检查这一项" : "粘贴合同，检查这一项"}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">
            这类不在合同检测范围内，供浏览学习。
          </span>
        )}
      </div>
    </article>
  );
}

interface Props {
  // 从结果页「查看同类案例」跳转过来时，选中对应类型并滚动到该典例。
  focusTrapId: string | null;
  hasAnalysis: boolean;
  onBack: () => void;
  onCheckRule: (ruleId: string, title: string) => void;
}

export function ContractsPage({ focusTrapId, hasAnalysis, onBack, onCheckRule }: Props) {
  const focusTrap = focusTrapId ? trapById(focusTrapId) : undefined;
  const [typeId, setTypeId] = useState<string>(
    () => (focusTrap && typeForTrap(focusTrap.id)?.id) || contractTypes[0]?.id || "",
  );
  const focusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!focusTrap) return;
    const t = typeForTrap(focusTrap.id);
    if (t) setTypeId(t.id);
  }, [focusTrap]);

  useEffect(() => {
    if (focusTrap) focusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusTrap, typeId]);

  const type = contractTypes.find((t) => t.id === typeId) ?? contractTypes[0];

  // 法律依据只从规则库按 rule_id 读取，且只显示 verified=true 的条目。
  const verifiedRules = useMemo<RiskRule[]>(
    () =>
      (type?.ruleIds ?? [])
        .map((id) => ruleById(id))
        .filter((r): r is RiskRule => !!r && r.verified),
    [type],
  );

  const cases = useMemo<TrapEntry[]>(
    () =>
      (type?.trapIds ?? [])
        .map((id) => trapById(id))
        .filter((t): t is TrapEntry => !!t),
    [type],
  );

  if (!type) return null;
  const scene: ContractType = (CONTRACT_TYPES as readonly string[]).includes(type.id)
    ? (type.id as ContractType)
    : "other";

  return (
    <div className="qq-page flex-1">
      <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-4 py-6 sm:px-5 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-[var(--site-radius)] border border-border px-3 py-1.5 text-sm hover:border-[var(--site-gold)]"
          >
            ← 返回
          </button>
          <h1 className="font-title text-2xl">照契</h1>
        </div>
        <span className="text-xs text-muted-foreground">先选类型，再展开卷轴</span>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="合同类型">
        {contractTypes.map((t) => {
          const on = t.id === type.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTypeId(t.id)}
              className="qq-tab"
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 选定类型后，清单+卷轴这一组自上而下展开（350ms，prefers-reduced-motion 下关闭） */}
      <div key={type.id} className="qq-unroll flex flex-col gap-5">
      {/* 检查清单在卷轴上方，勾选状态沿用原 localStorage key */}
      {type.checklist && <Checklist category={type.checklist} />}

      {/* 卷轴：上下木轴（CSS 绘制，两端轴头）+ 左右裱边 + 宣纸色纸面 */}
      <div className="qq-scroll">
        <div className="qq-rod" aria-hidden />
        <div className="qq-mount">
        <div className="paper qq-paper space-y-6 px-4 py-5 sm:px-6">
          <h2 className="flex items-center gap-2 font-title text-xl">
            <span className="seal h-7 w-7 text-xs" aria-hidden>
              契
            </span>
            {type.label}
          </h2>

          <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-title text-base">
                <span className="seal h-5 w-5 text-[10px]" aria-hidden>
                  契
                </span>
                注意事项（法律依据）
              </h3>
              {verifiedRules.length === 0 ? (
                <div className="space-y-1 text-[15px] leading-[1.7] text-muted-foreground">
                  <p className="font-medium">签前怎么办</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {actionsForType(scene).map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <ul className="space-y-3">
                  {verifiedRules.map((r) => (
                    <li key={r.id} className="space-y-1 border-l-2 pl-3" style={{ borderColor: "var(--site-accent)" }}>
                      <p className="font-title text-[15px]">{r.title}</p>
                      {r.legalBasis.map((lb, i) => (
                        <div key={i} className="space-y-0.5">
                          <p className="text-[15px] leading-[1.7]">
                            {lb.law} {lb.article}：{lb.quote}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {lb.sourceUrl ? (
                              <a
                                href={lb.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="underline hover:text-[var(--site-accent)]"
                              >
                                来源：{lb.source}
                              </a>
                            ) : (
                              <>来源：{lb.source}</>
                            )}
                          </p>
                          {lb.reprintUrl && (
                            <p className="text-[11px] text-muted-foreground">
                              参考转载（不作依据）：
                              <a
                                href={lb.reprintUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="underline hover:text-[var(--site-accent)]"
                              >
                                {new URL(lb.reprintUrl).hostname}
                              </a>
                            </p>
                          )}
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="qq-col-divide space-y-4">
              <h3 className="flex items-center gap-2 font-title text-base">
                <span className="seal h-5 w-5 text-[10px]" aria-hidden>
                  契
                </span>
                典例分析
              </h3>
              {cases.length === 0 ? (
                <p className="text-sm text-muted-foreground">整理中</p>
              ) : (
                cases.map((trap) => (
                  <CaseStudy
                    key={trap.id}
                    trap={trap}
                    hasAnalysis={hasAnalysis}
                    onCheckRule={onCheckRule}
                    focused={trap.id === focusTrapId}
                    caseRef={
                      trap.id === focusTrapId
                        ? (el) => {
                            focusRef.current = el;
                          }
                        : undefined
                    }
                  />
                ))
              )}
            </section>
          </div>
        </div>
        </div>
        <div className="qq-rod" aria-hidden />
      </div>
      </div>
    </main>
    </div>
  );
}