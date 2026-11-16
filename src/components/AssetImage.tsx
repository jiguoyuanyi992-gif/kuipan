import type { CSSProperties, ReactNode } from "react";
import { ASSETS } from "virtual:asset-manifest";

const available = new Set(ASSETS);

export function hasAsset(name: string): boolean {
  return available.has(name);
}

export function assetUrl(name: string): string | undefined {
  return available.has(name) ? `/assets/${name}` : undefined;
}

interface Props {
  // public/assets 下的文件名，如 zhongkui.jpg
  name: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  placeholder?: ReactNode;
  placeholderColor?: string;
  loading?: "lazy" | "eager";
}

// 素材没到位时渲染占位色块，不发请求，避免 404 控制台错误。
export function AssetImage({
  name,
  alt,
  className = "",
  style,
  placeholder,
  placeholderColor,
  loading = "lazy",
}: Props) {
  if (!available.has(name)) {
    const phStyle: CSSProperties = {
      ...style,
      ...(placeholderColor ? ({ "--asset-ph": placeholderColor } as CSSProperties) : {}),
    };
    return (
      <div role="img" aria-label={alt} className={`asset-placeholder ${className}`} style={phStyle}>
        {placeholder}
      </div>
    );
  }
  return <img src={`/assets/${name}`} alt={alt} className={className} style={style} loading={loading} />;
}