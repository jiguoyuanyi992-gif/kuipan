import { LEGAL_BASIS_SOURCE } from "../legalSource";
import checklistsJson from "./checklists.json";
import trapsJson from "./traps.json";
import { rules } from "../rules";
import type { RuleScene, TrapEntry } from "../types";

export type TrapCategory = "rent" | "internship" | "loan";

export interface ChecklistItem {
  id: string;
  label: string;
}

export interface SceneChecklist {
  id: TrapCategory;
  label: string;
  storageKey: string;
  items: ChecklistItem[];
}

export const traps: TrapEntry[] = (trapsJson as unknown as TrapEntry[]).map((t) => ({
  ...t,
  legalBasis: t.legalBasis.map((lb) => ({ ...lb, source: LEGAL_BASIS_SOURCE })),
}));
export const checklists = checklistsJson as unknown as {
  categories: SceneChecklist[];
};

export const CATEGORY_LABEL: Record<TrapCategory, string> = {
  rent: "租房",
  internship: "实习兼职",
  loan: "贷款分期",
};

// 贷款分期条目只做浏览与学习，不参与合同检测，因此按 id 前缀归类。
export function trapCategory(trap: TrapEntry): TrapCategory {
  if (trap.id.startsWith("trap-loan-")) return "loan";
  return trap.scene === "rent" ? "rent" : "internship";
}

export function trapsByCategory(category: TrapCategory): TrapEntry[] {
  return traps.filter((t) => trapCategory(t) === category);
}

export function trapById(id: string): TrapEntry | undefined {
  return traps.find((t) => t.id === id);
}

// 陷阱条目 ↔ 检测规则：约定 trap id = "trap-" + rule id。
export function ruleIdForTrap(trap: TrapEntry): string | undefined {
  const candidate = trap.id.replace(/^trap-/, "");
  return rules.some((r) => r.id === candidate) ? candidate : undefined;
}

export function trapsForRuleId(ruleId: string): TrapEntry[] {
  return traps.filter((t) => ruleIdForTrap(t) === ruleId);
}

export function checklistFor(category: TrapCategory): SceneChecklist | undefined {
  return checklists.categories.find((c) => c.id === category);
}

// 浏览页检索：命中的是条目自身的展示字段，不涉及任何上传内容。
export function searchTraps(keyword: string, category?: TrapCategory): TrapEntry[] {
  const pool = category ? trapsByCategory(category) : traps;
  const kw = keyword.trim();
  if (!kw) return pool;
  return pool.filter((t) => {
    const haystack = [t.oneLiner, t.story, ...t.traits, ...t.beforeSign, ...t.afterHit].join(
      "|",
    );
    return haystack.includes(kw);
  });
}

export type { TrapEntry, RuleScene };
