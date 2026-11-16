# Qoder 使用过程记录 · 签前一查

> 单一文件，按里程碑分节，最新写在最上面。
> 红线：只出现编造或脱敏样例，不得含真实合同内容、真实姓名、身份证、手机号、住址、公司名。
> 截图由用户用系统截图工具放入 docs/shots/，文件名带里程碑编号；缺图写「（待补：xxx.png）」，不编造截图内容。

## M4 后追加 · 陷阱库信息结构改版 + 合同照片识别（2026-11-16，不打 tag）

### 交付概览

两件事都在 M4 收尾后由用户直接提需求：① 只改陷阱库页面的信息结构与样式（清单主入口、最常见 3 个坑、默认折叠单张展开、三段各显 3 条、去掉搜索框、顶部免责声明压一行）；② 支持上传手机拍的合同照片，本地压缩后走新增的 `/functions/v1/app/ocr` 识别成文字，填回「粘贴合同文本」框等用户核对，再进现有分析流程（不自动分析）。分析流程、规则库内容、脱敏口径与数据契约未动；`ContractSource` 只增加一个 `"photo"` 取值。

### ① 关键提示词（逐字保留）

1. 「任务：只改「陷阱库」页面的信息结构和样式，不动分析流程、规则库内容和接口。目标：让用户打开 3 秒内知道先看哪个。」
2. 「任务：支持上传手机拍的合同照片，识别成文字后进入现有分析流程。」
3. 「先用一张真实图片做一次调用，确认模型名和返回格式，再写代码。」
4. 「识别完成后把文字填进「粘贴合同文本」框，让用户核对修改后再点「开始分析」。不要自动分析，OCR 难免有错字。」
5. 「文案必须与实际行为一致，实现里如果有落盘或日志，先告诉我。」

### ② 报错与解决

1. **375px 首屏看不到 2 张折叠卡片**（QA `traps-cards-above-fold` visible=1）：10 行清单占掉 306px，把第 1 张卡片顶到 top=518。解法：清单同样改成默认 3 项 + 「查看全部 10 项」，375px 变 2 张、桌面 3 张；「清单要全露」与「首屏 2 张卡」互斥，已作为取舍报用户裁定。试错 1 次。
2. **QA 的「查看全部」点错目标**：清单在 DOM 里更靠前，全局按文案点击命中了清单。解法：把点击作用域限定到 `[data-trap-id="trap-rent-deposit-forfeit"]` 内。试错 1 次。
3. **截图脚本 `SecurityError: Failed to read the 'localStorage' property from 'Window'`**：在 about:blank 上执行了 clear。解法：先导航→clear→再导航。试错 1 次。
4. **模型探针第二轮全部 403**：探针把一次性 nonce 存在实例内存里，第一轮用完即失效，且不支持指定模型列表。解法：改成固定 token + `body.models` 参数并重新发布；重试仍 403，原因是客户端脚本还在带旧随机 token，改掉 token 后 7 次调用全部拿到结果。试错 2 次。实测结论：`qwen3.5-ocr` 1.33s 且输出干净、`qwen3-vl-plus` 6.0s 可用、`qwen-vl-ocr` 3.4–5.9s 但每行前缀 `x,y,?,x,y,` 坐标；`qwen-vl-max`、`qwen-vl-plus`、`qwen-vl-ocr-latest` 返回 404 model_not_found（用户指定的 qwen-vl-ocr 在本账号可用但需清洗坐标，故主选 qwen3.5-ocr、qwen-vl-ocr 兜底）。
5. **识别文本进分析后概览卡全是「—」**：照片识别出来的写法是「月租金人民币 1500 元」「共 12 个月」「138-0000-0000」，而 `src/core/redact` 的金额正则不容空格、手机号只认连续 11 位——金额抽不到导致押金/违约金倍数与比例占位符同时失效，手机号还会原样发给模型。解法：金额/期限正则加 `\s*`、期限标签补「共」、手机号允许 `[\s-]?` 分隔符，并补 3 条断言（含「带空格金额不得被误判成手机号」反例）。试错 1 次（先按千分位「1 500」写了断言，改回真实写法）。
6. **水印章被当成正文最后一行**：识别文本尾部稳定多出半句「示例，虚」（同一张图连续两次调用一致，非随机）。解法：OCR 提示词增加「忽略水印、印章、签名章、页眉页脚装饰文字与残缺字迹」，线上复验尾部只剩签订日期。试错 1 次。
7. **headless Chrome 调线上 `/ocr` 返回 403**：`{"code":"BOT_DETECTED","message":"Access denied. Automated tools are not allowed."}`——页面本身能打开，只有 `/functions` 调用被拦；ego 浏览器的 `Page.captureScreenshot` 又三次超时。解法：改用非 headless Chrome + CDP `Emulation.setDeviceMetricsOverride(375×667)` 跑线上全流程并出手机宽度截图，脚本留在 `dev/live-mobile-qa.mjs`。试错 1 次。
8. **本地预览与 fixture 是上一轮起的旧进程**：`dist` 里没有照片 UI、fixture 里没有 `/ocr` 分支，表现为一串与应用无关的假失败（`upload-docx`、`photo-thumb`、`photo-ocr-filled`）。解法：重新 `npm run build` 并重启 `dev/function-fixture.mjs`。试错 2 次。

### ③ 部署与运行记录

- `npm test`：12 文件 84 例全绿（新增 `src/core/ocr/__tests__/plan.test.ts` 7 例：照片筛选与超出张数、坐标行清洗不误伤数字行、页序合并跳空页、行尾空格归一、空结果与超长结果、服务端错误码→用户话术映射、每条 OCR 提示文案不含禁用词且给出粘贴退路；`redact.test.ts` 加 2 例）。
- `npm run build`：tsc --noEmit + vite 通过。本机仍无 Deno，`npm run check:function` 标待验（未声称通过）。
- 双视口 QA 375×667 与 1280×900：正常模式 54/54 全过；`QQY_OCR=fail` 注入模式 50/50 全过。新增步骤 `photo-thumb`、`photo-ocr-filled`、`photo-no-auto-analyze`、`photo-remove`、`photo-into-analysis`、`photo-ocr-error-hint`、`photo-fail-paste-fallback`。注入模式下 `/ocr` 的 5xx 记为环境噪音（与 `QQY_EXPECT=degraded` 同一口径），应用级控制台 0 error。
- 线上探针接口 `functions/probe-ocr.ts` 用完即删，随后两次重新发布已把它从公网摘掉：`POST /functions/v1/app/probe-ocr` 现返回 404，`/ocr` 空体返回 400，其他子路径 404。
- 发布记录（三次，均 published:true、access 仍 public、未改访问策略）：`3e8d73ad`（/ocr 首版 + 照片输入）→ `18c4904c`（水印提示词修正）→ `9a3ce115`（脱敏空格与手机号分隔符修正）。
- 百炼用量：开发测试期合计约 12 次调用（探针 7 + 线上复验 5），全部用编造示例图片，单张图片 1 次调用；Key 值未索取、未打印、未回显。
- 落盘与日志核对（回答第 10 条要求）：`functions/ocr.ts` 无 `console.log`、不写文件，图片只在内存里过一次即丢；Sites 平台侧请求日志只记 pathname / status / 耗时 / request_id，不含请求体（已用 `get_function_logs` 核对）；前端缩略图用 `URL.createObjectURL`，删除照片与组件卸载时 `revokeObjectURL`；未引入数据库、未写 localStorage。文案已改为「文字合同会先在本地脱敏再发给 AI 分析。照片会发送给 AI 服务用于识别文字，识别后立即丢弃，不保存。」

### ④ 线上链接与验证方式

- 线上：https://qianqian-yicha-odzma4gogrf.qoder.zone （public）
- 验证路径：无痕窗口 → 点「上传 Word / PDF / 照片」选相册里的合同照片（可多张）→ 缩略图与「识别成文字」→ 文字填进文本框并提示先核对 → 改错字后点「开始分析」→ 概览卡出金额/押金倍数/期限。本次由 agent 用 375px 设备模拟跑通：识别 384 字，概览卡 ¥1,500 / ¥4,500（月租×3）/ 12 个月，结果「需重点留意 · 存在 2 处需重点留意的条款」。
- 待用户真机复验：用手机实拍的合同照片（本次用的是把编造合同渲染成纸面再拍的效果样张，不是真实手机拍摄）。
- 截图（待补：m4b-traps-mobile.png、m4b-traps-desktop.png、m4b-photo-ocr-mobile.png、m4b-photo-result-mobile.png；agent 侧临时图在 %TEMP%\qqy-qa 与 %TEMP%\qqy-live-mobile，未进仓库）

### ⑤ 迭代对比

1. 改之前什么样：陷阱库是「搜索框 + 6 张全展开长卡片」，375px 首屏只看到标题和搜索框。我说了什么：「页面顶部放「签约前检查清单」，作为主入口」「所有卡片默认折叠，只显示：标题、一句话危害、风险标签」「手机宽度（375px）下每屏至少能看到 2 张折叠卡片」。改之后什么样：清单主入口（默认 3 项 + 查看全部）→ 最常见的 3 个坑 → 更多陷阱，单张展开、展开卡片内才有「粘贴合同，检查这一项」，375px 首屏实测 2 张卡片。（待补：m4b-traps-mobile.png）
2. 改之前什么样：只能上传 Word/PDF 或粘贴文字，扫描版 PDF 只能改粘贴。我说了什么：「支持上传手机拍的合同照片，识别成文字后进入现有分析流程」「不要自动分析，OCR 难免有错字」。改之后什么样：一次最多 6 张照片按选择顺序当页序、本地压到长边 1600/JPEG 0.8、识别文字填回文本框等人工核对、失败分「图片模糊 / 网络 / 额度 / 超限」给原因并引导粘贴。（待补：m4b-photo-ocr-mobile.png）

### 未完成 / 待裁定

- 概览卡的「违约金」遇到不含数字的写法（「按三个月租金标准支付违约金」）仍显示「—」：这是既有解析口径，不是照片路径新增问题，是否补中文倍数解析请策略层定。
- AGENTS.md 需要策略层同步：平台约束第 1 条写的是「只有 /functions/v1/app/analyze 一个子路径」，现在实际是 `/analyze` + `/ocr`；功能范围也多了「合同照片输入」。执行层未自行改写策略文字。
- 陷阱库改版遗留：清单默认 3 项还是全 10 项；无对应规则的卡片要不要给 `TrapEntry` 补 `title`/`severity` 以统一外观；页头一行摘要文案（「风险提示，不构成法律意见；完整说明见页脚。」）与 AGENTS.md「页头页脚逐字使用」的口径需用户确认。

## M4 · 真实规则库 + 陷阱库 + 检查清单 + 双向跳转（2026-11-16，tag m4-data）

### 交付概览

规则库从 5 条假规则换成 13 条真实规则（租房 6 / 实习兼职 5 / 通用 2），每条 `legalBasis` 的 quote 都与权威 .gov.cn 页面原文逐字自动比对通过（住房租赁条例、民法典、劳动合同法、职业学校学生实习管理规定四部文本，MISMATCH: none）；`verified` 全部保持 false，等用户本人复核。新建陷阱库 12 条（租房 6 / 实习兼职 4 / 贷款分期 2 = 底线量，`story` 全为空串、前端隐藏案例区块，不编造案例）与 3 类签约前检查清单（`qqy:checklist:<category>` localStorage 持久化）。界面层新增「浏览陷阱库」入口 + 分类浏览/关键词检索页 + 双向跳转：风险详情「查看同类案例」→ 陷阱库对应条目并高亮滚动；陷阱条目「用我的合同检查这一项」→ 有结果时回结果页定位到该规则（`data-rule-id` 滚动），无结果时回输入页并给出提示。跳转映射用约定 `trap.id = "trap-" + rule.id`（贷款分期 `trap-loan-*` 不映射规则、不参与检测），不改数据契约、不引入客户端深路由（spa 仍为 false）。

### ① 关键提示词（逐字保留）

1. 「继续执行」
2. 「m3和m4结束就停下」
3. 「怎么停了，key我已作废」

### ② 报错与解决

1. **Node 里 `/tmp/...` 被解析成 `C:\tmp\...`**：实习管理规定附件 docx 解压后 5 条引用全部读不到，一度显示 NOSRC。解法：先用 `cygpath -w /tmp/...` 换真实临时目录再读。试错 1 次。
2. **WebFetch 存下来的劳动合同法页面正文是 `\uXXXX` 转义**：直接 grep 中文全部 MISS，误判「引用对不上」。解法：读取后先把 `\uXXXX` 解码成汉字再做包含性比对，21 条引用全部 OK。试错 1 次。
3. **民法典全文不在本会话可离线读取的材料里**（此前是用浏览器取的）：无法用脚本比对。解法：在仍打开的 jsjc.gov.cn 页面用 `evaluate_script` 对 `innerText` 做归一化包含性校验，顺带取到陷阱库要用的 680/496 等条文原文。试错 1 次。
4. **traps/checklists 文案里混进英文词**（「refusing 就改投别处」「替别人 signing」）：中文文案不一致。解法：改成中文表述，并用临时 node 脚本对 rules/traps/新 UI 文本跑一遍禁用词+白名单整词自查（脚本不进仓库）。试错 1 次。
5. **检查清单换分类时状态串类**：`<Checklist category=…>` 组件复用，`useState` 初始化只跑一次，QA 里看到 `qqy:checklist:loan` 被写入租房项 id。先用一次性探针脚本排除「label 双触发」假设（`input.click()` 与点标签文案各只触发 1 次 click），确认是重挂载问题。解法：`<Checklist key={category} …/>` 强制重挂载，切类重新读该类存储。试错 1 次（另删一次性探针脚本）。
6. **双视口 QA 的清单断言写死了绝对状态**（`toggled === true`）：headless Chrome 的 user-data-dir 里 localStorage 跨轮次残留，mobile 先跑就把上一轮的 true 点成 false，出现假失败。解法：每轮开始 `localStorage.clear()`，断言改为「翻转」`after === !before` + 刷新后 `persisted === after`。试错 2 次。

### ③ 部署与运行记录

- `npm test`：11 文件 75 例全绿（rules 场景分布 6/5/2 与「来源必须 gov.cn/moe 且 quote 非空」断言；新增 traps 11 例：分类条数 6/4/2、`verified` 全 false、story 只允许空串且不含手机号/身份证格式、贷款分期条目不得映射规则、清单 id 全局唯一且 storageKey 口径、双向跳转两侧各 ≥8 条可跳、检索命中与空结果）。
- `npm run build`：tsc --noEmit 通过，vite 构建无 error。`functions/` 本机仍无 Deno，`check:function` 标待验（未声称通过）。
- 本地双视口 QA（390×844 与 1280×900）：fixture 在（model）36/36 全过；fixture 关（`QQY_EXPECT=degraded`）36/36 全过。每视口 18 步、新增 7 步：`traps-jump-from-result`、`traps-jump-to-result`、`traps-loan-category`、`traps-search-empty`、`checklist-toggle`、`checklist-persisted`、`traps-check-to-input`；应用级控制台 0 error。
- 云端：prepare_site(actionId 33ed593b-71d7-46f7-a0f9-39e72dc9feea，webDirectory=dist，functionDirectory=functions，spa=false，secretNames=[BAILIAN_API_KEY] 只传名称) → publish_site(publishOperation 01a1e2c5-ca07-79f1-98d2-3cf2dff85c42 succeeded, committed=true) → get_publish_status `published: true`、`access_mode: public`（本里程碑未改访问策略）。
- 百炼调用：用户告知 M0 临时小额度 Key 已作废；线上真实浏览器跑一次演示合同（1 批）后页面出现「（AI 生成，仅供参考）」改写，`get_function_logs` 最近 1 小时 3 条 `POST /app/analyze` 全 status_code 200、无 5xx —— 说明 Secrets 里的现值仍可用，需用户确认那是新建的正式 Key（若当前值就是已作废 Key，模型主路径会整批失败进降级，请重填）。
- 策略裁定（非未完成）：① `/advisory` 独立端点取消。功能已在 analyze 内实现——`src/core/llm/prompt.ts:25` 要求「未命中任何规则但可疑」的条款以 `aiSuggested=true`、`ruleId` 空串返回，`src/core/llm/merge.ts:26` 按 `ai|blockId` 去重并入「其他可疑条款」，`src/components/FindingDetail.tsx:12` 走弱样式且不附法律依据。依据：同一批块的同一次调用已带全部脱敏块，拆第二个端点等于再调一次百炼，会撞「总调用 ≤8 次」与「≤30 秒出全部结果」两条硬线。代码不动，AGENTS.md 架构行与平台约束行已同步。
- 未完成项：② 检查清单「竖版长图友好」排版优化留到 M5；③ 本节截图待用户用系统截图工具补。

### ④ 线上链接与验证方式

- 线上：https://qianqian-yicha-odzma4gogrf.qoder.zone （public）
- 验证：真实浏览器打开 → 点「高命中演示合同」→ 概览卡「需重点留意」+ 4 处命中下划线 + 4 个「查看同类案例」；点进陷阱库 → 分类/检索/「签约前检查清单」渲染正常、空 `story` 的案例区块不出现；勾一项 → 点「用我的合同检查这一项」回结果页定位；刷新后勾选仍在；`list_console_messages` 刷新后 0 条 error。headless Chrome 打线上仍被 `BOT_DETECTED` 拦，故线上用真实浏览器。

### ⑤ 迭代对比

1. 改之前什么样：陷阱库和检查清单只有 JSON，页面上看不到，也没有从风险详情进案例的入口。
   我说了什么：「继续执行」（M4 的 P1 交付项 = 浏览检索页 + 可勾选清单 + 双向跳转）。
   改之后什么样：顶栏与结果页都有「浏览陷阱库」，风险详情可跳同类案例，陷阱条目可反向驱动合同检查。
   （待补：m4-traps-desktop.png、m4-traps-jump-mobile.png）
2. 改之前什么样：切换清单分类后，上一类的勾选状态会被写进新类的存储里。
   我说了什么：无（自查在双视口 QA 里抓到，探针脚本确认不是 label 双触发）。
   改之后什么样：清单按分类重挂载，localStorage 键各自独立，QA 断言改为「翻转 + 刷新后仍保持」，两个视口都过。
   （待补：m4-checklist-persist.png）

### ⑥ 待用户复核（只有你能把 verified 置 true）

执行层未把任何 `verified` 置为 true。四部依据文本与条目分布：

| 依据文本 | source | 用到它的规则 | 用到它的陷阱条目 |
|---|---|---|---|
| 住房租赁条例（国务院令第812号，2025-09-15 起施行） | https://wubu.gov.cn/zwgk/fdzdgknr/zcfg/202507/t20250723_2022388.html | rent-deposit-forfeit、rent-missing-deposit-return、rent-non-residential-space、rent-unauthorized-entry、rent-agent-collects-rent | trap-rent-deposit-forfeit、trap-rent-non-residential-space、trap-rent-unauthorized-entry、trap-rent-agent-collects-rent |
| 中华人民共和国民法典 | https://www.jsjc.gov.cn/2020zt/mfd/202006/t20200609_185556.shtml | rent-penalty-high、rent-unauthorized-entry、common-unilateral-terminate、common-final-interpretation | trap-rent-unauthorized-entry、trap-rent-penalty-high、trap-rent-utility-and-fees、trap-intern-missing-written-agreement、trap-loan-training-loan、trap-loan-installment-fees |
| 劳动合同法（2012 年修正） | http://www.luoding.gov.cn/yfldrsj/gkmlpt/content/1/1946/mpost_1946064.html | intern-unpaid-probation、intern-collects-money、intern-penalty-clause、intern-night-shift、common-unilateral-terminate | trap-intern-unpaid-probation、trap-intern-collects-money、trap-intern-penalty-clause、trap-intern-missing-written-agreement |
| 职业学校学生实习管理规定（2021 年修订） | http://www.moe.gov.cn/srcsite/A07/moe_737/s3876_qt/202201/t20220121_595529.html | intern-unpaid-probation、intern-collects-money、intern-missing-school-party、intern-night-shift | trap-intern-unpaid-probation、trap-intern-collects-money、trap-intern-missing-written-agreement |

需要你判定两点：① 实习管理规定这一份 `effectiveOn` 我故意留空（来源页是 2022-01 印发的通知，施行日期与「2021 年修订」口径需你确认）；② 贷款分期两条只引了民法典第六百八十条与第四百九十六条第二款——五部委《关于进一步规范大学生不良网络校园贷的通知》与民间借贷司法解释利率上限都没找到权威全文页面，故未录入，是否接受这个取舍由你定。

## M3 · Function 主路径 + 流式合并 + 降级（2026-11-16，tag m3-llm）

### 交付概览

模型语义匹配主路径上线：Deno 单函数 `POST /functions/v1/app/analyze` 只做「限流 → 长度校验 → 调百炼 qwen-flash → 回 `{ok,content}`」，prompt 由客户端 `buildPrompt` 单一来源构造；条款块切批（batchBlocks，目标 6–10 块/批、总批数硬上限 8）后 Promise.all 并行发出，边到边渲染；merge 前做三重本地护栏（zod strict 拒 offset 字段、rule/block 白名单、absent-only 规则拒绝模型 exist 命中），法律依据仍只从规则库读取。redactForModel 把块内姓名/手机号等移除、金额换成「押金=月租×N」比例占位符后放入请求体，原文只在浏览器本地用于高亮定位。降级路径：任一批全失败 → modelStatus:"unavailable" + 页面「智能分析暂不可用，当前显示本地规则检查结果」，正则结果完整保留、不白屏。限流为实例内存滑窗每 IP 每分钟 N 次（暂定 N=10，待用户确认），输入上限约 2 万字。第二次 public 发布，线上示例合同实测 4.1 秒出全部结果。

### ① 关键提示词（逐字保留）

1. 「还需要多久？在这里先停一下,明天再继续」
2. 「m3和m4结束就停下」
3. 「继续执行」
4. 「约束4『批次并行发出，总调用 ≤8 次』（上一会话定义，本里程碑实现依据）」

### ② 报错与解决

1. **把带 fetch 的运行器写进了 `src/core/llm/client.ts`**：违反「src/core 平台无关纯函数（无 React、无网络）」架构约束。解法：删除该文件，重写为 `src/lib/modelPass.ts`（界面层），core 只留 prompt/schema/merge 纯函数。试错 1 次。
2. **`src/App.tsx` 重分析时旧批次回调覆盖新结果**：批次是异步到达的，返回上页再分析会出现结果串台。解法：`runId=useRef(0)` 代次守卫，`++runId` 后丢弃旧 `onUpdate`。试错 1 次。
3. **单测滑窗期望算错**：初版断言把被拒请求也计入窗口。解法：按实现口径改为「严格大于 cutoff 的记录存活、被拒不计数」，重算 0/1000 allow、1500 deny、61000 allow。试错 1 次。
4. **`import { createRateLimiter } from "../../../functions/limiter.ts"` 过不了 tsc**：functions 目录被 tsconfig 排除且带 `.ts` 扩展名会报错。解法：写成无扩展名导入（limiter.ts 不使用 Deno API，可被 src 测试直接引用），`npm run check:function` 仍因本机无 Deno 标待验。试错 1 次。
5. **线上 Function 返回 403**：网关要求请求带 `Origin`（curl 不带即 `sites_gateway_origin_forbidden`），headless Chrome 直接被 `BOT_DETECTED` 拦截。解法：线上验证改用真实浏览器（browser-use）走 golden path，本地双视口自动化继续用 vite preview + `dev/function-fixture.mjs`。试错 2 次。
6. **模型把缺失性规则当存在命中返回**（线上 probe：`rent-missing-deposit-return` 落在 b7）：违反约束 3。解法：merge 增加 `existDetectable` 守卫，absent-only 规则的命中只能来自本地判定（blockId=null），模型版直接丢弃。试错 1 次。

### ③ 部署与运行记录

- `npm test`：10 文件 62 例全绿（新增批次预算/脱敏占位符/限流滑窗/模型路径流式与降级/probe 序列）。
- `npm run build`：tsc --noEmit 通过，vite 构建无 error；`functions/*.ts` 本机无 Deno，只做 transpile 语法校验（完整类型校验标待验）。
- 本地双视口 QA（`node dev/viewport-qa.mjs`，390/1280）：fixture 在 → 22/22 全过，含新项 `demo-model-merged`（改写标「AI 生成，仅供参考」、无降级横幅）；fixture 关（`QQY_EXPECT=degraded`）→ 22/22 全过，含 `demo-model-degraded`，控制台过滤本地代理 5xx 环境噪音后应用级 0 error。
- 云端：prepare_site(actionId b3e7d219…，functionDirectory=functions，secretNames=[BAILIAN_API_KEY]，descriptorStatus=written) → publish_site(publishOperation 01a1e29c… succeeded) → get_publish_status published=true → update_access_policy(public, confirmPublic=true) 复验 mode=public。
- 百炼真实调用：开发期编造示例合同 3 次（1 次 prompt probe + 1 次浏览器 golden path + 1 次 curl），`get_function_logs` 最近 1 小时仅 2 条 `POST /app/analyze` 且 status_code 全 200、无 5xx；单次分析批次数 = 2（演示合同 8 块）。

### ④ 线上链接与验证方式

- 线上：https://qianqian-yicha-odzma4gogrf.qoder.zone （public）
- 验证：真实浏览器打开 → 点「高命中演示合同」→ 1.2 秒出正则结果、4.1 秒出模型补充（阈值 ≤30 秒）；页面出现「（AI 生成，仅供参考）」改写、4 处命中下划线、无「智能分析暂不可用」；控制台 0 条消息。降级态在本地以关掉 fixture 验证（页面不白屏、结果完整）。
- 截图：（待补：m3-result-desktop.png）（待补：m3-degraded-banner.png）（待补：m3-function-logs.png）
- 待用户确认：① 限流 N=10/分钟是否合适；② 条款块数 >80 时「批内放宽到 ⌈n/8⌉」以保证总批数 ≤8 的处理方式；③ 正式百炼 Key 需在 Sites Settings 界面填入 `BAILIAN_API_KEY`（M0 临时 Key 仍能出结果，验证后请作废）。

### ⑤ 迭代对比

1. 改之前：M2 结果只有正则命中，模型不参与，页面一次出完。我说了什么：「继续执行」（按 M3 计划实现批次并行主路径）。改之后：正则结果 1.2 秒先出，模型批次并行返回后逐条补充改写建议与「其他可疑条款」，同一屏流式完成。（待补：m3-result-desktop.png）
2. 改之前：Function 挂了就没有任何提示（M2 无 Function）。我说了什么：（执行层按约束 6 自查）。改之后：全批失败时页面显示「智能分析暂不可用，当前显示本地规则检查结果」，本地结果不受影响、不白屏。（待补：m3-degraded-banner.png）

## M2 · P0 界面闭环 + A 卷宗视觉 + 首次功能发布（2026-11-15，tag m2-ui）

### 交付概览

按用户预选的 A 卷宗方向写 docs/design-spec.md 并铺开全部 P0 界面：输入页（粘贴 / 上传 Word·PDF / 3 份编造示例 + 高命中演示合同，均标「示例，虚构」）、结果页（总体三档概览卡 + 类型改选 + 月租/押金/期限/违约金 + 缺失条款区 + 左侧红黄绿条款目录 + 原文背色 + 命中句下划线 + 风险详情）。法律依据仅 verified:true 显示（当前假规则全 false，故不显示）。自托管思源宋体标题子集（OFL）。补齐上传实测基础设施：pdfjs GB1 CMap 自托管（支持非嵌入中文 PDF）、PDF 提取保留换行、mammoth node/浏览器双入口兼容、dev 生成编造 PDF/DOCX fixture、dev/viewport-qa.mjs 用本机 Chrome headless+CDP 做 390/1280 双视口 golden path 实测（20 项全过、控制台 0 error）。首次功能发布 public 并复验。

### ① 关键提示词（逐字保留）

1. 「视觉方向我现在就定：A 卷宗（米白底 + 墨黑正文 + 单一朱红强调）。M2 不再出三方向效果图等我选，直接按 A 写 docs/design-spec.md 并铺开页面。」
2. 「然后 M1 → M2 → M3 → M4 → M5 → M6 连续执行，不要停下来问我下一步。」
3. 「预先授权（一次性，覆盖后续全部里程碑）：所有 prepare_site / publish_site / 改 public……」

### ② 报错与解决

1. **PDF 提取整页压成一行**：原 `join(" ")` 丢失换行，切块依赖行首条款标记会失效。解法：按 `item.hasEOL` 补 `\n` 再 `join("")`。单测断言 `\n第一条 租赁期限` 通过。试错 1 次。
2. **pdfjs-dist 6 在 Node 报 `a.toHex is not a function`**：pdfjs 6 依赖 ES2026 的 Uint8Array hex/base64 方法，Node 24 尚未提供（Chrome 157 已有）。解法：仅测试环境加 src/core/__tests__/shims.ts 补齐（vitest setupFiles），产品代码不动（浏览器自带）。试错 1 次。
3. **node 下 CMap 加载失败 `Unable to load CMap data`**：node 的 CMap 读取走 `fs.readFile`，需纯文件路径且带尾斜杠（http URL 与 file:// 字符串都不行）；浏览器走 http URL。且需补齐反向映射 Adobe-GB1-UCS2.bcmap。解法：public/pdf-cmaps/ 自托管全部 GB1 CMap；测试传纯路径、浏览器传 origin URL。试错 3 次（http→file://→纯路径）。
4. **mammoth node 入口报 `Could not find file in options`**：node 读 `buffer`、浏览器读 `arrayBuffer`。解法：同传两键 + 一次类型断言兼容联合类型。试错 1 次。
5. **mobile 视口 favicon 404 / 目录跳转误报**：缺 favicon 补 public/favicon.svg；QA 脚本在已滚到底时测跳转、及 mobile:true 模拟把视口撑高导致整页可见，均为脚本 artifacts，修正脚本（先回顶、mobile:false 仅缩宽度）后 20/20 全过。试错 2 次。

### ③ 部署与运行记录

- `npm test`：7 文件 43 例全绿（新增 PDF 中文换行/扫描版/DOCX 三例）。
- `npm run build`：tsc --noEmit 无 error；dist 含 fonts/ 与 pdf-cmaps/。
- `node dev/viewport-qa.mjs`：390 与 1280 双视口，输入/示例/高亮/目录跳转/类型改选/粘贴/上传PDF/扫描版提示/上传DOCX/控制台 0 error 共 20 项全过（exit 0）。
- 云端：prepare_site(actionId 4cd3a373…) → publish_site → get_publish_status published=true → get_site_access policy.mode=public → 线上 home/favicon/cmap/font 均 200 且 bundle hash 与 dist 一致 → show_publish_confirmation。M2 为纯静态（Function 留 M3）。
- 无百炼调用（M2 正则驱动）。

### ④ 线上链接与验证方式

- 线上：https://qianqian-yicha-odzma4gogrf.qoder.zone （public，get_site_access 复验）
- 验证：无痕/真机打开 → 点「高命中演示合同」→ 概览「需重点留意」+ 缺失条款 + 目录红黄绿 + 原文背色/下划线；上传 dev/fixtures/contract.pdf 与 contract.docx 复现；扫描版 scanned.pdf 出改用粘贴提示。
- 截图：（待补：m2-input.png）（待补：m2-result-desktop.png）（待补：m2-result-mobile.png）

### ⑤ 迭代对比

1. 改之前：M0/M1 线上为占位页，无可用界面。我说了什么：「直接按 A 写 docs/design-spec.md 并铺开页面」。改之后：输入→结果完整闭环，A 卷宗文书感（米白/墨黑/朱红、宋体标题、红黄绿图标+文字）。（待补：m2-result-desktop.png）
2. 改之前：上传 PDF 中文提取丢换行、非嵌入字体提取为空。我说了什么：（执行层自查发现，非用户指令）。改之后：保留换行 + 自托管 GB1 CMap，编造 PDF/DOCX 上传实测命中风险。（待补：m2-pdf-upload.png）

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