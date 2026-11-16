import { useState } from "react";
import ghostsJson from "../../data/ghosts.json";
import { AssetImage } from "@/src/components/AssetImage";

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

export function GhostsPage() {
  const [selectedId, setSelectedId] = useState<string>(ghosts[0]?.id ?? "");
  const ghost = ghosts.find((g) => g.id === selectedId) ?? ghosts[0];

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
          {/* 圆形青铜照妖镜：镜中是当前选中鬼的画像，素材未到位时留占位 */}
          <div
            className="rounded-full p-2.5"
            style={{
              backgroundColor: "#6f5a33",
              border: "2px solid var(--site-gold)",
              boxShadow: "inset 0 0 0 4px #4c3d22",
            }}
          >
            <div
              className="rounded-full p-1.5"
              style={{ backgroundColor: "#4c3d22" }}
            >
              <AssetImage
                name={ghostImage(ghost.id)}
                alt={`${ghost.name}画像`}
                className="h-52 w-52 rounded-full object-cover sm:h-64 sm:w-64"
                style={{ objectPosition: "center 30%" }}
                placeholderColor="#241d14"
                placeholder={
                  <span className="vertical-rl font-title text-4xl" style={{ color: "var(--site-gold)" }}>
                    {ghost.name}
                  </span>
                }
              />
            </div>
          </div>

          {/* 信息卡：鬼名 / 比喻 / 常出没 / 应对策略 */}
          <section className="paper w-full space-y-3 rounded-[var(--site-radius)] border border-border p-4 sm:p-5">
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
              const on = g.id === ghost.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedId(g.id)}
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