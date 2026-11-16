import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const proxy = { "/functions/v1/app": "http://127.0.0.1:8000" };

// 素材清单：构建/启动时扫描 public/assets，页面据此决定渲染图片还是占位色块，
// 避免引用不存在的图片产生 404 控制台错误。新增图片后重启 dev 或重新 build 即生效。
function assetManifest(): Plugin {
  const virtualId = "virtual:asset-manifest";
  const resolvedId = "\0" + virtualId;
  return {
    name: "asset-manifest",
    resolveId(source) {
      if (source === virtualId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;
      const dir = fileURLToPath(new URL("./public/assets", import.meta.url));
      const files = existsSync(dir)
        ? readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f))
        : [];
      return `export const ASSETS = ${JSON.stringify(files)};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), assetManifest()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  server: { host: "127.0.0.1", proxy },
  preview: { host: "127.0.0.1", proxy },
  build: { outDir: "dist" },
});
