// pdfjs-dist 6 依赖 ES2026 的 Uint8Array hex/base64 方法；Node 测试环境补齐。
const proto = Uint8Array.prototype as unknown as Record<string, unknown>;
const ctor = Uint8Array as unknown as Record<string, unknown>;

if (typeof proto.toHex !== "function") {
  proto.toHex = function (this: Uint8Array) {
    let s = "";
    for (const b of this) s += b.toString(16).padStart(2, "0");
    return s;
  };
}
if (typeof ctor.fromHex !== "function") {
  ctor.fromHex = (s: string) => {
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++)
      out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    return out;
  };
}
if (typeof proto.toBase64 !== "function") {
  proto.toBase64 = function (this: Uint8Array) {
    let bin = "";
    for (let i = 0; i < this.length; i += 0x8000)
      bin += String.fromCharCode(...this.subarray(i, i + 0x8000));
    return btoa(bin);
  };
}
if (typeof ctor.fromBase64 !== "function") {
  ctor.fromBase64 = (s: string) =>
    Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export {};