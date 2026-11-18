// 典例来源本地托管映射：官方外链 PDF 已复制到 public/docs/（2026-11-18），
// 移动端浏览器对跨站 PDF 多为下载而非预览，改由站内 pdf.js 阅读器渲染同一份文件。
// 键 = caseSourceUrl 去掉 #page 锚点后的原样 URL；命中才走阅读器，htm/shtml 保持直链。
export interface LocalSource {
  path: string;
  page?: number;
}

const LOCAL_DOCS: Record<string, string> = {
  "http://jsj.zs.gov.cn/attachment/0/369/369024/1852618.pdf":
    "/docs/zs-rent-contract.pdf",
  "https://zfcxjst.gd.gov.cn/attachment/0/371/371273/2577029.pdf":
    "/docs/gd-rent-contract.pdf",
  "https://fgj.sh.gov.cn/cmsres/1d/1da73600f7d64d2cb7c4fa52ef2404f6/04a59feb01bf70b32a078832b4fbaf7a.pdf":
    "/docs/sh-rent-contract.pdf",
  "https://www.beijing.gov.cn/fwcj/attachments/67c01d9f41ecec12898c8d96.pdf":
    "/docs/bj-agent-rent.pdf",
  "http://www.moe.gov.cn/srcsite/A07/moe_737/s3876_qt/202201/W020231218539873596108.docx":
    "/docs/moe-intern-regulation.pdf",
  "http://jyj.liuzhou.gov.cn/zwgk/fdzdgknr/tzgg_58717/202112/P020211201408904845944.pdf":
    "/docs/liuzhou-cert.pdf",
  "https://www.youcash.com/smartc/upload/file/20261102/1793585981901027004.pdf":
    "/docs/youcash-terms.pdf",
  "https://www.boccfc.cn/xinwen/gonggao/202502/W020250822651723353559.pdf":
    "/docs/boccfc-notice.pdf",
  "https://sh.189.cn/pdf/ywfwxy.pdf": "/docs/189-service.pdf",
  "https://www.iachina.cn/module/download/downfile.jsp?classid=0&filename=b5177d860ab04959b2f5c8fd60271da8.pdf":
    "/docs/iachina-insurance.pdf",
  "https://www.4008000000.com/app_upload/file/property/gerenjiekuanbaozhengtuankuan20200618.pdf":
    "/docs/pingan-guarantee-insurance.pdf",
  "https://www.beijing.gov.cn/fwcj/attachments/67c0160041ecec12898c8d1c.pdf":
    "/docs/bj-prepaid.pdf",
  "https://www.beijing.gov.cn/fwcj/attachments/67c0110141ecec12898c8c91.pdf":
    "/docs/bj-carrental.pdf",
  "https://jtw.beijing.gov.cn/xxgk/2024zcwj/qtzcwj/202407/W020240725777262560882.pdf":
    "/docs/bj-driving.pdf",
};

export function localSourceFor(url: string | undefined): LocalSource | null {
  if (!url) return null;
  const hashIndex = url.indexOf("#");
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const path = LOCAL_DOCS[base];
  if (!path) return null;
  const pageMatch = hashIndex === -1 ? null : /page=(\d+)/.exec(url.slice(hashIndex));
  const page = pageMatch ? Number(pageMatch[1]) : undefined;
  return { path, page: page !== undefined && page > 0 ? page : undefined };
}
