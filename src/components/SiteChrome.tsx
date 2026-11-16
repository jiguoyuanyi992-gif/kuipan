import { assetUrl, hasAsset } from "./AssetImage";
import { DISCLAIMER } from "./Disclaimer";

export type NavKey = "input" | "ghosts" | "contracts";

const NAV_ITEMS: { key: NavKey; label: string }[] = [
  { key: "input", label: "首页" },
  { key: "ghosts", label: "捉鬼录" },
  { key: "contracts", label: "照契" },
];

export function SiteHeader({
  active,
  onNav,
}: {
  active: NavKey;
  onNav: (key: NavKey) => void;
}) {
  const sealBg = assetUrl("seal-red.png");
  return (
    <header className="border-b border-border bg-[var(--site-bg)]">
      <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={() => onNav("input")}
          className="flex items-center gap-3 text-left"
          aria-label="馗判 · 回到首页"
        >
          <span
            className="seal h-11 w-11 shrink-0 text-base"
            style={
              sealBg
                ? { backgroundImage: `url(${sealBg})`, backgroundSize: "cover" }
                : undefined
            }
          >
            {Array.from("馗判").map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </span>
          <span>
            <span className="block font-title text-xl leading-tight">
              馗判
              <span className="ml-2 align-middle text-[10px] tracking-widest text-muted-foreground">
                KUÍ PÀN
              </span>
            </span>
            <span className="block text-xs text-muted-foreground">
              签字之前，先照一照
            </span>
          </span>
        </button>

        <nav aria-label="主导航" className="flex gap-1">
          {NAV_ITEMS.map((item) => {
            const on = item.key === active;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNav(item.key)}
                aria-current={on ? "page" : undefined}
                className="border-b-2 px-3 py-1.5 font-title text-base"
                style={{
                  borderColor: on ? "var(--site-accent)" : "transparent",
                  color: on ? "var(--site-fg)" : "var(--site-muted)",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

// 页脚固定提示行 + 展开区：完整免责声明逐字保留，照片隐私说明一并收在这里。
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-4 sm:px-5">
        <p className="text-sm font-medium" style={{ color: "var(--site-gold)" }}>
          AI参考意见，不构成法律意见。
        </p>
        <details className="mt-1.5">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            完整免责声明与照片隐私说明
          </summary>
          <div className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p>{DISCLAIMER}</p>
            <p>照片会发送给 AI 服务用于识别文字，识别后立即丢弃，不保存。</p>
          </div>
        </details>
        {hasAsset("seal-red.png") && (
          <img
            src="/assets/seal-red.png"
            alt=""
            aria-hidden
            className="mt-3 h-8 w-8 opacity-80"
          />
        )}
      </div>
    </footer>
  );
}