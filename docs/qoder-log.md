# Qoder 使用过程记录 · 签前一查

> 单一文件，按里程碑分节，最新写在最上面。
> 红线：只出现编造或脱敏样例，不得含真实合同内容、真实姓名、身份证、手机号、住址、公司名。
> 截图由用户用系统截图工具放入 docs/shots/，文件名带里程碑编号；缺图写「（待补：xxx.png）」，不编造截图内容。

## M1 · 核心纯函数层（2026-11-15，tag m1-core）

### 交付概览

src/core 平台无关纯函数全部落地：types / extract（mammoth+pdfjs-dist）/ chunk / regex / redact / llm（prompt+zod schema+合并去重）/ scene / risk（总体三档）。5 条假规则（verified 全 false）+ 3 份编造示例合同（租房/实习/通用清洁版，页面 M2 标注「示例，虚构」）。导出 RiskRule/TrapEntry JSON 模板（docs/templates/）交用户先填 3 条验证格式。vitest 40 测试全绿，npm run build 无 error。本里程碑不发布线上（纯核心层，界面 M2 铺开）。

### ① 关键提示词（逐字保留）

1. 「M0 验收通过。先修 4 件事，再连续往下跑。」
2. 「约束4「整份合同 2–4 次调用」改为「批次并行发出，总调用 ≤8 次」……「禁止逐块串行调用」不变。同步改 AGENTS.md。」
3. 「视觉方向我现在就定：A 卷宗（米白底 + 墨黑正文 + 单一朱红强调）。M2 不再出三方向效果图等我选，直接按 A 写 docs/design-spec.md 并铺开页面。」
4. 「然后 M1 → M2 → M3 → M4 → M5 → M6 连续执行，不要停下来问我下一步。」

### ② 报错与解决

1. **redact 金额正则笔误**：`人民币?` 被正则解析为「人民」+ 可选「币」，导致不含「人民币」字样的「押金9000元」「违约金6000元」匹配不到。完整报错：`AssertionError: expected '…月租，押金9000元…' to contain '押金=月租×3'`（redact.test.ts 2 例失败，其余 38 例通过）。解法：三处金额正则 `人民币?` 改为 `(?:人民币)?`（整体可选）。改后 40/40 全绿。试错 1 次。
2. **Deno 仍未安装（沿袭 M0）**：M1 未改 Function，`check:function` 仍标「待验（Deno 未安装）」；核心层为纯 TS，由 tsc --noEmit + vitest 覆盖，不依赖 Deno。试错 0 次。

### ③ 部署与运行记录

- 依赖新增：mammoth ^1.13.0、pdfjs-dist ^6.5.438（运行时，extract 用）、vitest ^5.1.0（开发）。未跑 npm audit fix --force（3 个 high 遗留，按策略需处理先问用户）。
- `npm test`：7 个测试文件 40 例全绿（chunk 区间不变量/regex 三示例命中与缺失/redact 移除+比例占位符+本地抽取/llm schema 拒绝畸形与 offset/合并去重/三档映射/verified 全 false/扫描版判定）。
- `npm run build`：tsc --noEmit 无类型错误，vite 打包成功（dist/）。
- 无云端动作、无百炼调用（M1 纯本地核心层）。

### ④ 线上链接与验证方式

- 线上仍为 M0 纯静态占位页（M1 不改线上）：https://qianqian-yicha-odzma4gogrf.qoder.zone
- 本地验证：`npm test`（40 绿）+ `npm run build`（无 error）。界面 golden path 与移动视口验证留待 M2。
- 截图：（待补：m1-tests.png）

### ⑤ 迭代对比

本里程碑无产品界面需求变更（核心纯函数层，界面仍为占位页，M2 按 A 卷宗铺开）。约束4 并行 ≤8 次、视觉定 A、预授权清单属策略层修订，已在 M0 收尾 commit `748ef1c` 同步 AGENTS.md，不凑三行格式。

## M0 · 平台探针（2026-11-15，不打 tag）

### 六项探针结论（按「Secret/百炼调用 → 超时/请求体 → IP/KV」顺序）

| # | 项目 | 结论 | 证据 |
|---|---|---|---|
| 1 | 能否读 Secret | **能** | `item=secret` → `present:true`（HTTP 200） |
| 2 | 能否外网调百炼 | **能** | `item=llm` → `ok:true, status:200, latencyMs:230`；qwen-flash，1 次调用（授权 ≤3） |
| 3 | 超时时长 | **网关约 60s（区间 45–60s）** | delay 5s/15s/30s/45s 均 200；60s → HTTP 504 `upstream request timeout`（60.6s） |
| 4 | 请求体上限 | **≥4MB，未触顶** | POST 64KB/256KB/1MB/4MB 均 200（需同源 Origin 头）；远超约 60KB（2 万字）规划输入 |
| 5 | 能否拿到调用方 IP | **能** | `item=ip` → `xff:true, realIp:true, publicLike:true` → 每 IP 每分钟 N 次限流可行 |
| 6 | KV 能力是否存在 | **不存在** | 运行时 `openKvApi:false, openKvWorks:false` + 管理面 36 个工具无 KV 接口（双重证据） |

**分支决策**：百炼调通 → 主路径维持模型语义匹配，**未触发**退回纯正则分支。

**与计划假设核对**：六项均在假设范围内 —— KV 不存在为计划预期情形；超时（约 60s）与请求体（≥4MB）容量远超批量调用所需（每次数秒级、整份 ≤30s、约 60KB）；IP 可得。**未触发「探针结果与假设不符停下来报告」条件。** 两处平台行为如实记录（非冲突）：① POST 写请求需同源 Origin 校验，浏览器同源调用不受影响；② 删除接口后网关返回 409 而非 404（见下）。

### ① 关键提示词（逐字保留）

1. 「不建独立探针站，直接在正式站 qianqian-yicha 上验。做最小部署 + 一个只返回「是/否」状态的检查接口。」（初始执行层指令节选）
2. 「全部授权（推荐）」（M0 云端动作一并授权）
3. 「地址我怎么打开啊」
4. 「BAILIAN_API_KEY 已填好，继续 M0。」
5. 「请重读该文件，据新版更新 AGENTS.md 并提交，M1 起一律按新版执行。」（策略更新指令节选）

### ② 报错与解决

1. **Deno 未安装**：`deno: command not found` → `check:function`/`dev:function` 不可用。解法：用 `node -e` 调 `typescript.transpileModule` 做语法级校验（结果 syntax ok），完整验证靠线上探针；Function 本地校验标「待验（Deno 未安装）」，不声称已通过。试错 1 次。
2. **Secret 阻塞（预期流程）**：prepare_site 后 blocker `sites_secret_not_ready`（BAILIAN_API_KEY missing）。解法：停下请用户在 Sites Settings 界面填值；填好后 `dependenciesReady:true`、`canPublish:true`。试错 0 次。
3. **Secret 录入入口找不到**：用户「地址我怎么打开啊」。解法：本地知识无 Sites 条目 → 查官方文档 docs.qoder.com/qoder/sites.md 验证入口：侧边栏 Sites → Owned by you → More → Settings → Secrets 录入区。试错 1 次。
4. **POST 探针全部 403**：完整报错 `{"code":"sites_gateway_origin_forbidden","message":"request origin is invalid"}`（HTTP 403，4 档全失败）。原因：网关对写请求做同源校验。解法：curl 加 `Origin: https://qianqian-yicha-odzma4gogrf.qoder.zone` 头模拟浏览器同源请求，4 档全过。试错 1 次。
5. **60s 探针 504**：HTTP 504 `upstream request timeout`（60.6s）。这是探针目标结果而非故障；加测 45s 通过，超时区间收窄为 (45s, 60s]。试错 0 次。
6. **删接口后复验状态码与假设不同**：预期 404，实际 409 `{"code":"sites_gateway_supabase_not_ready","message":"Supabase backend is not ready"}`。诊断：`get_site` 证实当前版本 `functions:[]`（纯静态、无函数部署），409 是网关对「无函数路由」的应答，探针逻辑已不可达。纯静态目标达成；平台未保留旧函数，**未启用** 404 stub 应急预案。试错 0 次（一次诊断定位）。

### ③ 部署与运行记录

- 设计登记：`open_design_workbench` 生成 `.签前一查.qoder.site`（工具所有，不手写）。
- **发布 1**（探针）：actionId `529b3cc6-fb63-4069-af21-78490de73830`，publishOperationId `01a1df79-ebd6-7364-9881-eeb68494eec5`，succeeded+committed，`published:true`；分享策略 **private**（M0 两次发布均 private，public 当时尚未设置）。
- **百炼调用**：1 次（授权 ≤3），qwen-flash，输入 "ping"、max_tokens=1，HTTP 200、latencyMs=230。全程未打印 Key、模型响应原文、请求内容；探针接口以 nonce 守卫防公网路人触发（nonce 不入 log）。
- **日志**：`get_function_logs(type=requests)` 近 1 小时无 5xx；60s 的 504 与 POST 的 403 均为网关侧产生，未到达函数。
- **发布 2**（纯静态，删接口）：actionId `0d5f8f0b-2f93-4be2-8cb9-f064c24bf624`，omit functionDirectory，publishOperationId `01a1df81-0981-7f3b-8136-3b10ee0509b6`，succeeded+committed，`published:true`；`functions:[]`，`/functions/v1/app/check` 与 `/functions/v1/app` 均 409（网关），首页 200，分享策略仍 **private**。handler.ts 已恢复 starter 原样（与 commit 7f6643c 逐字节一致）。
- **访问策略更正与置 public（2026-11-15，用户授权 confirmPublic=true）**：此前本 log 误记「创建即 public／public 不变」。事实：`get_site`/`get_publish_status` 的 `access_mode` 字段是名义值，真实分享策略以 `get_site_access.policy.mode` 为准 —— M0 两次发布后均为 **private**。经用户授权调用 `update_access_policy(mode=public)`，`get_site_access` 复验 **mode=public** 已生效。教训：访问状态一律以 `get_site_access` 复核，不采信 `get_site` 的 `access_mode` 字段。
- 临时小额度 Key **待用户作废**；正式 Key 到 M3 才接入。

### ④ 线上链接与验证方式

- 公网地址：https://qianqian-yicha-odzma4gogrf.qoder.zone
- 验证：curl 首页 200；内置浏览器桌面视口控制台 0 error；390px iframe 窄视口无横向溢出、控制台 0 error（真机/无痕窗口复验由用户执行）。
- 截图：（待补：m0-deploy-sites.png）、（待补：m0-probe-results.png）、（待补：m0-home-mobile.png）

### ⑤ 迭代对比

本里程碑无产品界面需求变更（占位页 → 占位页）。策略文件有 8 处更新，已同步 AGENTS.md（commit `0a87742`），属策略层修订而非产品迭代，不凑三行格式。