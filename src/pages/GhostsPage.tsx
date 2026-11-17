import { useEffect, useRef, useState } from "react";
import ghostsJson from "../../data/ghosts.json";
import { AssetImage, assetUrl } from "@/src/components/AssetImage";

interface Ghost {
  id: string;
  name: string;
  metaphor: string;
  scenes: string[];
  strategy: string;
}

const ghosts = ghostsJson as Ghost[];

function ghostImage(id: string): string {
  return `ghost-${id}.png`;
}

function ghostName(id: string): string {
  return ghosts.find((g) => g.id === id)?.name ?? "";
}

const BURN_MS = 500;
const CARD_AT = 0.5;

type Phase = "idle" | "burn" | "fade";

interface EngineState {
  raf: number;
  t0: number;
  dur: number;
  target: string;
  cardSwapped: boolean;
}

// 八卦卦象（自下而上三条爻，1=阳爻连，0=阴爻断），先天八卦序
const BAGUA: number[][] = [
  [1, 1, 1], // 乾
  [0, 1, 1], // 巽
  [0, 1, 0], // 坎
  [1, 1, 0], // 兑
  [0, 0, 0], // 坤
  [1, 0, 0], // 震
  [0, 0, 1], // 艮
  [1, 0, 1], // 离
];

// 单卦三爻：横画沿切向排布、由镜缘外圈向内圈读（上爻在外）
function Trigram({ lines }: { lines: number[] }) {
  return (
    <>
      {[2, 1, 0].map((i) => {
        const y = 2.4 + (2 - i) * 2.2;
        return lines[i] === 1 ? (
          <rect key={i} x={57} y={y} width={8} height={1.3} rx={0.3} />
        ) : (
          <g key={i}>
            <rect x={57} y={y} width={3.3} height={1.3} rx={0.3} />
            <rect x={61.7} y={y} width={3.3} height={1.3} rx={0.3} />
          </g>
        );
      })}
    </>
  );
}

// 卦间回纹：方形螺旋细线，克制点缀
function Huifen() {
  return (
    <path
      transform="translate(61 5.5)"
      d="M-2.4 2.4 H2.4 V-2.4 H-0.8 V0.9 H1"
      fill="none"
      strokeWidth={0.9}
    />
  );
}

function MirrorFrameSvg() {
  return (
    <>
      <svg className="ghost-rim" viewBox="0 0 122 122" aria-hidden="true" focusable="false">
        <defs>
          {/* 火绒线扰动：不规则炭火线 */}
          <filter
            id="ghost-fire-jag"
            x="-30%"
            y="-260%"
            width="160%"
            height="620%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence type="fractalNoise" baseFrequency="0.05 0.14" numOctaves="2" seed="7" result="noise">
              <animate attributeName="seed" values="7;3;11;5;7" dur="0.32s" calcMode="discrete" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          {/* 火舌扰动：更强的不规则起伏 + 种子跳变动效，烧纸火苗感 */}
          <filter
            id="ghost-flame-jag"
            x="-40%"
            y="-60%"
            width="180%"
            height="220%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence type="fractalNoise" baseFrequency="0.035 0.09" numOctaves="3" seed="3" result="noise">
              <animate attributeName="seed" values="3;11;5;13;7;3" dur="0.42s" calcMode="discrete" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="16" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <radialGradient id="ghost-knob-grad" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#8a6f42" />
            <stop offset="60%" stopColor="#5c4a28" />
            <stop offset="100%" stopColor="#332814" />
          </radialGradient>
        </defs>
        <g fill="#b08c46" opacity="0.85">
          {BAGUA.map((lines, k) => (
            <g key={k} transform={`rotate(${k * 45 + 22.5} 61 61)`}>
              <Trigram lines={lines} />
            </g>
          ))}
        </g>
        <g stroke="#8f7338" opacity="0.6">
          {BAGUA.map((_, k) => (
            <g key={k} transform={`rotate(${k * 45} 61 61)`}>
              <Huifen />
            </g>
          ))}
        </g>
      </svg>
      {/* 镜钮 + 朱砂丝绦：绦从钮系出，沿镜缘外侧垂下一小段 */}
      <svg className="ghost-knob" viewBox="0 0 122 122" aria-hidden="true" focusable="false">
        <path
          d="M61 7 A58.5 58.5 0 0 1 93.2 11"
          fill="none"
          stroke="var(--site-accent)"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <circle cx="93.2" cy="11" r="1.6" fill="#a5302a" />
        <path d="M93.2 12.6 L90.7 18.2 H95.7 Z" fill="var(--site-accent)" />
        <path
          d="M91.7 18.2 v2.1 M93.2 18.2 v2.5 M94.7 18.2 v2.1"
          stroke="var(--site-accent)"
          strokeWidth={0.9}
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="61" cy="4" r="4.2" fill="url(#ghost-knob-grad)" stroke="#241a0d" strokeWidth={0.8} />
        <circle cx="61" cy="4" r="1.4" fill="#241a0d" />
      </svg>
    </>
  );
}

export function GhostsPage() {
  const first = ghosts[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(first);
  const [shownId, setShownId] = useState(first);
  const [oldId, setOldId] = useState(first);
  const [newId, setNewId] = useState(first);
  const [phase, setPhase] = useState<Phase>("idle");

  const faceRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EngineState | null>(null);
  const fadeTimerRef = useRef<number | null>(null);

  // 预加载全部鬼像，切换动画途中不出现空白
  useEffect(() => {
    for (const g of ghosts) {
      const url = assetUrl(ghostImage(g.id));
      if (url) new Image().src = url;
    }
    return () => {
      if (engineRef.current) cancelAnimationFrame(engineRef.current.raf);
      if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const setBurnVar = (v: number) => faceRef.current?.style.setProperty("--burn", String(v));

  const tick = () => {
    const st = engineRef.current;
    if (!st) return;
    const t = Math.min(1, (performance.now() - st.t0) / st.dur);
    setBurnVar(t);
    if (!st.cardSwapped && t >= CARD_AT) {
      // 火边扫到镜面中线：文字卡同步换成新鬼（150ms 淡入）
      st.cardSwapped = true;
      setShownId(st.target);
    }
    if (t < 1) {
      st.raf = requestAnimationFrame(tick);
      return;
    }
    engineRef.current = null;
    setBurnVar(0);
    setOldId(st.target);
    setShownId(st.target);
    setPhase("idle");
  };

  const startBurn = (target: string, fromId: string) => {
    setOldId(fromId);
    setNewId(target);
    setBurnVar(0);
    setPhase("burn");
    engineRef.current = { raf: 0, t0: performance.now(), dur: BURN_MS, target, cardSwapped: false };
    engineRef.current.raf = requestAnimationFrame(tick);
  };

  const selectGhost = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    const st = engineRef.current;
    if (fadeTimerRef.current !== null) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // 减弱动效：关闭火焰，150ms 淡入淡出
      if (st) cancelAnimationFrame(st.raf);
      const cur = st ? st.target : shownId;
      engineRef.current = null;
      setBurnVar(0);
      setOldId(cur);
      setNewId(id);
      setShownId(id);
      setPhase("fade");
      fadeTimerRef.current = window.setTimeout(() => {
        fadeTimerRef.current = null;
        setOldId(id);
        setPhase("idle");
      }, 170);
      return;
    }

    // 动画中再点：立刻结束当前焚烧，以已显形的鬼为旧鬼重新起烧，不排队、无残影
    startBurn(id, st ? st.target : shownId);
  };

  const ghost = ghosts.find((g) => g.id === shownId) ?? ghosts[0];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-6 sm:px-5 sm:py-8">
      <header className="space-y-1 text-center">
        <h1 className="font-title text-3xl">捉鬼录</h1>
        <p className="text-sm text-muted-foreground">
          照妖镜前，套路现形。点一只鬼，看它的原形与应对。
        </p>
      </header>

      {!ghost ? (
        <p className="text-sm text-muted-foreground">整理中</p>
      ) : (
        <>
          {/* 圆形青铜照妖镜：镜缘八卦纹 + 镜钮丝绦，镜中一次火边扫过、烧旧露新 */}
          <div className="ghost-mirror">
            <MirrorFrameSvg />
            <div className="ghost-face" data-phase={phase} ref={faceRef}>
              <div className="ghost-layer ghost-old">
                <AssetImage
                  name={ghostImage(oldId)}
                  alt={`${ghostName(oldId)}画像`}
                  className="ghost-img"
                  placeholderColor="#241d14"
                  loading="eager"
                  placeholder={
                    <span className="vertical-rl font-title text-4xl" style={{ color: "var(--site-gold)" }}>
                      {ghostName(oldId)}
                    </span>
                  }
                />
              </div>
              <div className="ghost-layer ghost-new" aria-hidden="true">
                <AssetImage
                  name={ghostImage(newId)}
                  alt=""
                  className="ghost-img"
                  placeholderColor="#241d14"
                  loading="eager"
                  placeholder={
                    <span className="vertical-rl font-title text-4xl" style={{ color: "var(--site-gold)" }}>
                      {ghostName(newId)}
                    </span>
                  }
                />
              </div>
              <div className="ghost-fire" aria-hidden="true">
                <div className="ghost-fire-glow" />
                <div className="ghost-char" />
                <div className="ghost-ash" />
                <div className="ghost-flames" />
                <div className="ghost-emberline" />
              </div>
              <div className="ghost-sheen" aria-hidden="true" />
            </div>
          </div>

          {/* 信息卡：鬼名 / 比喻 / 常出没 / 应对策略（火边扫到中线处换内容，150ms 淡入） */}
          <section
            key={shownId}
            className="ghost-card-swap paper w-full space-y-3 rounded-[var(--site-radius)] border border-border p-4 sm:p-5"
          >
            <div className="flex items-center gap-3">
              <span className="seal h-9 w-9 shrink-0 text-sm" aria-hidden>
                鬼
              </span>
              <h2 className="font-title text-2xl">{ghost.name}</h2>
            </div>
            <dl className="space-y-2.5 text-sm leading-relaxed">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">比喻</dt>
                <dd>{ghost.metaphor}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">常出没</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {ghost.scenes.map((s) => (
                    <span
                      key={s}
                      className="rounded border px-2 py-0.5 text-xs"
                      style={{ borderColor: "var(--paper-border)", color: "var(--paper-muted)" }}
                    >
                      {s}
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">应对策略</dt>
                <dd style={{ color: "var(--risk-high)" }}>{ghost.strategy}</dd>
              </div>
            </dl>
          </section>

          {/* 缩略图一排，点击切换 */}
          <nav aria-label="切换鬼" className="flex flex-wrap justify-center gap-4">
            {ghosts.map((g) => {
              const on = g.id === selectedId;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => selectGhost(g.id)}
                  aria-pressed={on}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span
                    className="rounded-full p-1"
                    style={{
                      border: `2px solid ${on ? "var(--site-accent)" : "var(--site-border)"}`,
                      backgroundColor: on ? "var(--site-surface)" : "transparent",
                    }}
                  >
                    <AssetImage
                      name={ghostImage(g.id)}
                      alt=""
                      className="h-14 w-14 rounded-full object-cover"
                      placeholderColor="#241d14"
                      placeholder={
                        <span className="font-title text-lg" style={{ color: "var(--site-gold)" }}>
                          {g.name.slice(0, 1)}
                        </span>
                      }
                    />
                  </span>
                  <span
                    className="font-title text-xs"
                    style={{ color: on ? "var(--site-fg)" : "var(--site-muted)" }}
                  >
                    {g.name}
                  </span>
                </button>
              );
            })}
          </nav>
        </>
      )}
    </main>
  );
}
