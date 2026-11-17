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

const OUT_MS = 250;
const IN_MS = 250;

type Phase = "idle" | "out" | "in" | "fade";

interface EngineState {
  raf: number;
  t0: number;
  from: number;
  to: number;
  dur: number;
  phase: "out" | "in";
  target: string;
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
          <filter
            id="ghost-fire-jag"
            x="-30%"
            y="-160%"
            width="160%"
            height="420%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence type="fractalNoise" baseFrequency="0.055 0.12" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="9" xChannelSelector="R" yChannelSelector="G" />
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
  const burnRef = useRef(0);
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
  const setCapVar = (v: number) => faceRef.current?.style.setProperty("--burn-cap", String(v));

  const tick = () => {
    const st = engineRef.current;
    if (!st) return;
    const t = Math.min(1, (performance.now() - st.t0) / st.dur);
    const v = st.from + (st.to - st.from) * t;
    burnRef.current = v;
    setBurnVar(v);
    if (t < 1) {
      st.raf = requestAnimationFrame(tick);
      return;
    }
    if (st.phase === "out") {
      // 旧鬼烧尽：文字卡在 250ms 处同步换成新鬼
      setShownId(st.target);
      setNewId(st.target);
      setPhase("in");
      const ins: EngineState = {
        raf: 0,
        t0: performance.now(),
        from: 0,
        to: 1,
        dur: IN_MS,
        phase: "in",
        target: st.target,
      };
      engineRef.current = ins;
      burnRef.current = 0;
      setBurnVar(0);
      ins.raf = requestAnimationFrame(tick);
    } else {
      engineRef.current = null;
      burnRef.current = 0;
      setBurnVar(0);
      setCapVar(1);
      setOldId(st.target);
      setShownId(st.target);
      setPhase("idle");
    }
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
      if (engineRef.current) cancelAnimationFrame(engineRef.current.raf);
      const cur = st ? (st.phase === "in" ? st.target : oldId) : shownId;
      engineRef.current = null;
      burnRef.current = 0;
      setBurnVar(0);
      setCapVar(1);
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

    if (!st) {
      setOldId(shownId);
      setNewId(id);
      setCapVar(1);
      burnRef.current = 0;
      setBurnVar(0);
      setPhase("out");
      engineRef.current = { raf: 0, t0: performance.now(), from: 0, to: 1, dur: OUT_MS, phase: "out", target: id };
      engineRef.current.raf = requestAnimationFrame(tick);
    } else if (st.phase === "out") {
      // 旧鬼还在烧：继续当前火边，只把待烧入的新鬼换掉
      st.target = id;
      setNewId(id);
    } else {
      // 新鬼烧到一半：以当前画面为旧鬼，火边从底部把它烧尽，再烧入新目标
      const b = Math.max(0.05, burnRef.current);
      cancelAnimationFrame(st.raf);
      setOldId(st.target);
      setNewId(id);
      setCapVar(b);
      burnRef.current = 0;
      setBurnVar(0);
      setPhase("out");
      engineRef.current = {
        raf: 0,
        t0: performance.now(),
        from: 0,
        to: b,
        dur: Math.max(80, OUT_MS * b),
        phase: "out",
        target: id,
      };
      engineRef.current.raf = requestAnimationFrame(tick);
    }
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
          {/* 圆形青铜照妖镜：镜缘八卦纹 + 镜钮丝绦，镜中焚鬼切换当前鬼画像 */}
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
                <div className="ghost-ember" aria-hidden="true" />
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
                <div className="ghost-ember" aria-hidden="true" />
              </div>
              <div className="ghost-fire" aria-hidden="true">
                <div className="ghost-fire-glow" />
                <div className="ghost-fire-core" />
              </div>
              <div className="ghost-sheen" aria-hidden="true" />
            </div>
          </div>

          {/* 信息卡：鬼名 / 比喻 / 常出没 / 应对策略（切换动画 250ms 处换内容，150ms 淡入） */}
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
