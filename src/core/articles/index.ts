import articlesJson from "./articles.json";
import { LEGAL_BASIS_SOURCE } from "../legalSource";

export interface ArticleEntry {
  id: string;
  law: string;
  article: string;
  quote: string;
  summary: string;
  scenes: string[];
  source: string;
  sourceUrl?: string;
  effectiveOn?: string;
  verified: boolean;
  reviewer?: string;
  reviewNote?: string;
}

// 封闭条文清单：模型只能从中选 id，法律依据原文仍只按 ruleId 从规则库读取。
export const articles: ArticleEntry[] = (articlesJson as unknown as ArticleEntry[]).map(
  (a) => ({ ...a, source: LEGAL_BASIS_SOURCE }),
);

export function articleById(id: string): ArticleEntry | undefined {
  return articles.find((a) => a.id === id);
}

export function articlesForType(type: string): ArticleEntry[] {
  return articles.filter(
    (a) => a.verified && (a.scenes.includes(type) || a.scenes.includes("other")),
  );
}