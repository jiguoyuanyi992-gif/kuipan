import type { Block, BlockKind } from "../types";

// 条款起始标记：行首「第X条」/ 数字或中文序号 / 括号序号。
// 锚定行首以避免把正文里「依据第三条」这类引用误判为新条款。
const CLAUSE_START =
  /^[ \t]*(第[一二三四五六七八九十百零〇0-9]+条|[0-9]+[.、．]|[一二三四五六七八九十]+[、．.]|（[一二三四五六七八九十0-9]+）|\([0-9]+\))/gm;

const SIGNATURE = /(签字|盖章|签署|落款|签名)/;

function signatureKind(text: string): BlockKind {
  return SIGNATURE.test(text) ? "signature" : "clause";
}

// 把原文切成带编号的条款块。切块与编号完全由本地完成，模型只引用 blockId。
// 不变量：block.text === text.slice(block.start, block.end)；区间左闭右开、连续覆盖、不越界。
export function chunk(text: string): Block[] {
  if (text.length === 0) return [];

  const starts: number[] = [];
  CLAUSE_START.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLAUSE_START.exec(text)) !== null) {
    starts.push(m.index);
    if (m.index === CLAUSE_START.lastIndex) CLAUSE_START.lastIndex++;
  }

  const bounds: number[] = [];
  if (starts.length === 0) {
    // 无条款标记：按空行分段兜底。
    const para = /\n[ \t]*\n/g;
    let last = 0;
    let p: RegExpExecArray | null;
    while ((p = para.exec(text)) !== null) {
      if (p.index > last) bounds.push(last, p.index);
      last = p.index + p[0].length;
    }
    if (last < text.length) bounds.push(last, text.length);
    if (bounds.length === 0) bounds.push(0, text.length);
  } else {
    if (starts[0] > 0) bounds.push(0, starts[0]);
    for (let i = 0; i < starts.length; i++) {
      const s = starts[i];
      const e = i + 1 < starts.length ? starts[i + 1] : text.length;
      bounds.push(s, e);
    }
  }

  const blocks: Block[] = [];
  for (let i = 0; i < bounds.length; i += 2) {
    const start = bounds[i];
    const end = bounds[i + 1];
    const slice = text.slice(start, end);
    if (slice.trim().length === 0) continue;
    const isPreamble = starts.length > 0 && start === 0 && start < starts[0];
    const kind: BlockKind = isPreamble ? "preamble" : signatureKind(slice);
    blocks.push({
      id: `b${blocks.length + 1}`,
      index: blocks.length,
      text: slice,
      start,
      end,
      kind,
    });
  }
  return blocks;
}

// 在块内用规则正则二次定位命中句，返回相对原文的绝对区间（不越界）。
export function locateInBlock(
  block: Block,
  pattern: string,
): { start: number; end: number; matchedText: string } | null {
  let re: RegExp;
  try {
    re = new RegExp(pattern, "m");
  } catch {
    return null;
  }
  const m = re.exec(block.text);
  if (!m || m[0].length === 0) return null;
  const start = block.start + m.index;
  const end = start + m[0].length;
  return { start, end, matchedText: m[0] };
}