import { describe, expect, it } from "vitest";
import { traps } from "../traps";
import { localSourceFor } from "../traps/sources";

describe("典例来源本地托管映射", () => {
  it("PDF 外链映射到站内 /docs 路径并保留页码", () => {
    const r = localSourceFor(
      "http://jsj.zs.gov.cn/attachment/0/369/369024/1852618.pdf#page=11",
    );
    expect(r).toEqual({ path: "/docs/zs-rent-contract.pdf", page: 11 });
  });

  it("带查询串的下载型 URL 也能映射", () => {
    const r = localSourceFor(
      "https://www.iachina.cn/module/download/downfile.jsp?classid=0&filename=b5177d860ab04959b2f5c8fd60271da8.pdf#page=2",
    );
    expect(r).toEqual({ path: "/docs/iachina-insurance.pdf", page: 2 });
  });

  it("教育部 docx 源映射到转换后的管理规定 PDF", () => {
    const r = localSourceFor(
      "http://www.moe.gov.cn/srcsite/A07/moe_737/s3876_qt/202201/W020231218539873596108.docx#page=8",
    );
    expect(r).toEqual({ path: "/docs/moe-intern-regulation.pdf", page: 8 });
  });

  it("htm/shtml 页面与未知链接不走阅读器；无锚点页码为 undefined", () => {
    expect(localSourceFor("https://www.imaa.edu.cn/info/1363/7464.htm")).toBeNull();
    expect(localSourceFor(undefined)).toBeNull();
    const r = localSourceFor("https://sh.189.cn/pdf/ywfwxy.pdf");
    expect(r).toEqual({ path: "/docs/189-service.pdf", page: undefined });
  });

  it("非法或越界页码归 undefined，不阻断打开", () => {
    expect(
      localSourceFor("https://sh.189.cn/pdf/ywfwxy.pdf#page=0")?.page,
    ).toBeUndefined();
    expect(
      localSourceFor("https://sh.189.cn/pdf/ywfwxy.pdf#page=abc")?.page,
    ).toBeUndefined();
  });

  it("陷阱库回归线：凡文件型典例来源必须已本地托管，未托管的只允许 html/shtml 直链", () => {
    for (const trap of traps) {
      if (!trap.caseSourceUrl) continue;
      const base = trap.caseSourceUrl.split("#")[0];
      const isFileLike =
        /\.(pdf|docx?)($|\?)/i.test(base) || base.includes("downfile.jsp");
      const isHtmlLike = /\.(html?|shtml)$/i.test(base);
      if (isFileLike) expect(localSourceFor(trap.caseSourceUrl), trap.id).not.toBeNull();
      else expect(isHtmlLike, `${trap.id} 未分类: ${base}`).toBe(true);
    }
  });
});
