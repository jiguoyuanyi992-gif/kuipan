import { useEffect, useMemo, useRef, useState } from "react";
import contractsJson from "../../data/contracts.json";
import { Checklist } from "@/src/components/Checklist";
import { PdfViewer } from "@/src/components/PdfViewer";
import { ruleById } from "@/src/core/rules";
import { actionsForType } from "@/src/core/fallback/actions";
import { ruleIdForTrap, trapById, type TrapCategory } from "@/src/core/traps";
import { localSourceFor } from "@/src/core/traps/sources";
import { CONTRACT_TYPES } from "@/src/core/types";
import type { ContractType, RiskRule, TrapEntry } from "@/src/core/types";

export interface DocView {
  src: string;
  page?: number;
  url: string;
  title: string;
}

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
  onOpenDoc,
}: {
  trap: TrapEntry;
  hasAnalysis: boolean;
  onCheckRule: (ruleId: string, title: string) => void;
  focused: boolean;
  caseRef?: (el: HTMLElement | null) => void;
  onOpenDoc: (view: DocView) => void;
}) {
  const ruleId = ruleIdForTrap(trap);
  const rule = ruleId ? ruleById(ruleId) : undefined;
  const title = rule?.title ?? trap.oneLiner;
  const local = localSourceFor(trap.caseSourceUrl);
  return (
    <article
      ref={caseRef}
      data-trap-id={trap.id}
      className="scroll-mt-4 space-y-3 rounded-[var(--site-radius)] border-t-2 pt-4"
      style={{ borderColor: focused ? "var(--site-accent)" : "var(--paper-border)" }}
    >
      {/* 上方：左侧典例来源（本地托管走阅读器，其余保持直链），右侧标题与一句话概要 */}
      <div className="flex gap-3">
        {local ? (
          <button
            type="button"
            onClick={() =>
              onOpenDoc({
                src: local.path,
                page: local.page,
                url: trap.caseSourceUrl!,
                title,
              })
            }
            title={`查看典例来源：${title}`}
            className="flex h-24 w-20 shrink-0 cursor-pointer items-center justify-center rounded border"
            style={{ borderColor: "var(--paper-border)", backgroundColor: "#e3d6bc" }}
          >
            <span
              className="vertical-rl font-title text-xs"
              style={{ color: "var(--site-accent)" }}
            >
              典例来源
            </span>
          </button>
        ) : (
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
        )}
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

// 合卷(未选类型) → 点击展开(800ms) → 点另一类型先收卷(400ms)再展卷。
type RollPhase = "closed" | "opening" | "open" | "collapsing";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ContractsPage({ focusTrapId, hasAnalysis, onBack, onCheckRule }: Props) {
  const focusTrap = focusTrapId ? trapById(focusTrapId) : undefined;
  const initialType = (focusTrap && typeForTrap(focusTrap.id)?.id) || null;
  const [typeId, setTypeId] = useState<string | null>(initialType);
  const [phase, setPhase] = useState<RollPhase>(initialType ? "open" : "closed");
  const pendingRef = useRef<string | null>(null);
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const focusRef = useRef<HTMLElement | null>(null);
  const [docView, setDocView] = useState<DocView | null>(null);

  useEffect(() => {
    if (!focusTrap) return;
    const t = typeForTrap(focusTrap.id);
    if (t) {
      setTypeId(t.id);
      setPhase("open");
    }
  }, [focusTrap]);

  useEffect(() => {
    if (focusTrap) focusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusTrap, typeId]);

  // 收卷期间不响应新点击，只记录最后一次；400ms 后换数据再展卷。
  useEffect(() => {
    if (phase !== "collapsing") return;
    const timer = setTimeout(() => {
      if (pendingRef.current) setTypeId(pendingRef.current);
      pendingRef.current = null;
      // 先以 0fr 渲染一帧，再触发 800ms 展开过渡。
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase("open")));
    }, 400);
    return () => clearTimeout(timer);
  }, [phase]);

  function selectType(id: string) {
    if (id === typeId && phase !== "closed") return; // 点已选中的类型：不折叠
    if (prefersReducedMotion()) {
      setTypeId(id);
      setPhase("open");
      return;
    }
    if (phase === "collapsing") {
      pendingRef.current = id;
      return;
    }
    if (typeId === null) {
      setTypeId(id);
      setPhase("opening");
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase("open")));
    } else {
      pendingRef.current = id;
      setPhase("collapsing");
    }
    // 卷轴顶部不在视口内时，把签条栏滚到视口上方附近（不强制滚到下轴）。
    const rect = tabBarRef.current?.getBoundingClientRect();
    if (rect && (rect.bottom < 0 || rect.top > window.innerHeight)) {
      tabBarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const type = typeId ? contractTypes.find((t) => t.id === typeId) : undefined;

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

  const scene: ContractType = type && (CONTRACT_TYPES as readonly string[]).includes(type.id)
    ? (type.id as ContractType)
    : "other";

  // opening/collapsing 都以合起高度渲染，open 才展开——保证首帧 0fr 后再触发过渡。
  const dataOpen = phase === "open" ? "true" : "false";

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

      <div ref={tabBarRef} className="scroll-mt-4 flex flex-wrap gap-2 pb-2" role="tablist" aria-label="合同类型">
        {contractTypes.map((t) => {
          const on = t.id === typeId;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => selectType(t.id)}
              className="qq-tab"
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 卷轴：上下木轴（CSS 绘制，两端短圆柱轴头）+ 深红绫边 + 暗棕裱边 + 宣纸色纸面。
          合卷时两轴贴合，中间一条签条；展开时上轴固定，下轴随纸面底边下行。 */}
      <div className="qq-scroll flex flex-col" role="tabpanel" aria-live="polite" aria-label="合同卷轴">
        <div className="qq-rod" aria-hidden />
        {type && <div className="qq-silk" aria-hidden />}
        {type ? (
          <div className="qq-rollwrap" data-open={dataOpen}>
            <div className="qq-rolltrack">
              <div className="qq-mount">
              <div className="qq-paper paper space-y-5 px-4 py-5 sm:px-6 sm:space-y-6">
                {type.checklist && (
                  <>
                    <Checklist category={type.checklist} embedded />
                    <div className="qq-divider" aria-hidden />
                  </>
                )}
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
                          onOpenDoc={setDocView}
                        />
                      ))
                    )}
                  </section>
                </div>
              </div>
              </div>
              {/* 下轴＋绫边贴住展卷的前沿：随 clip 底边下行，完全展开后落回纸尾 */}
              <div className="qq-rollfoot">
                <div className="qq-silk" aria-hidden />
                <div className="qq-rod" aria-hidden />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="qq-closed-tag" aria-hidden>
              <span>请选类型，展开卷轴</span>
            </div>
            <div className="qq-rod" aria-hidden />
          </>
        )}
      </div>
    </main>
      {docView && (
        <PdfViewer
          src={docView.src}
          page={docView.page}
          title={docView.title}
          sourceUrl={docView.url}
          onClose={() => setDocView(null)}
        />
      )}
    </div>
  );
}