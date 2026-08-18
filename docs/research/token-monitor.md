# Token Monitor 对照调研

> 研究时间：2026-08-18  
> 对照对象：[Javis603/token-monitor](https://github.com/Javis603/token-monitor) `v0.45.0` @ `36f6d2e18be02aaff8d4150c74e5953b64604b76`  
> 本仓库基线：`dsh-hub-oauth-gateway` 1.1.0 用量中心（DSH Web 插件）

## 结论

Token Monitor 是跨 30+ AI 编程工具的 **Electron 本地小窗 + 可选多设备 Hub**，用量来自 [tokscale](https://github.com/junhoyeo/tokscale) 扫本地日志，额度来自各家凭据/API。本项目是 **DSH 宿主内的用量中心**：从 DSH usage 事件投影到 SQLite，账户走 21 个 adapter + 声明式 monitor。

两边在「本地优先、估算成本、缓存 Token、配额窗口、导出、软提醒、保留已删会话」上高度同构。真正值得补充的是一批 **不破坏隐私与本地 API 边界** 的呈现与运维能力；多设备同步、自动扫价、Discord Presence、读 transcript 做逐 prompt 明细等应继续排除。

## 产品形态差异

| 维度 | Token Monitor | dsh-hub-oauth-gateway |
| --- | --- | --- |
| 运行时 | Electron 桌面小窗 / 托盘 / 可选 macOS Widget | DSH Cordis 插件 + classic-script 客户端 |
| 用量来源 | tokscale 解析各 CLI/IDE 本地日志与 DB | DSH session usage 事件投影 |
| 额度来源 | 独立 LimitsRuntime + 多凭据 profile | Account adapter registry + `accounts.monitors` |
| 同步 | 可选 Hub（内嵌 / Node / Cloudflare Worker）+ SSE | 刻意不做云同步；单机本地 SQLite |
| 价格 | models.dev 目录估算 + 汇率换算 | 用户显式价格规则；无自动扫价、无汇率换算 |
| 隐私默认 | 提示词/回复不同步；session 明细按需读本地 | 不落库 prompt/response/cwd/凭据/原始响应 |

二者是互补产品：Token Monitor 覆盖「多工具跨机器」；本插件覆盖「DSH 会话内事实 + Harness 账户」。不应把对方变成第二个 Electron 壳，也不应把本插件扩成跨工具日志嗅探器。

## 已对齐或我们已更强的能力

下列能力 Token Monitor 也有，本仓库 1.x 已覆盖或策略更严：

1. **本地优先历史**：双方都不依赖供应商账单延迟；我们用 `(session, turn, step)` 投影防双计。
2. **缓存 Token 与命中率**：双方拆 input / output / cache read / write；我们已有 `cacheHitRate` 指标与 breakdown 列。
3. **保留已删会话用量**：`retention.preserveDeletedSessions` 默认 `true`，与对方「保留已删除会话用量」同目标。
4. **余额 + 订阅窗口统一模型**：对方 Limits 归一化；我们 `AccountSnapshot` + 21 adapter（含 New API、Sub2API、声明式 JSON Pointer）。
5. **软提醒**：低配额 / 日成本阈值；双方都不做硬阻断。
6. **CSV / JSON 导出 + 脱敏开关**：我们另有公式注入防护与 session 标识默认隐藏。
7. **展示预设**：Minimal / Quota / Cost / Analyst；对方用首页模块开关，语义相近。
8. **成本诚实**：对方用目录价；我们强制价格覆盖率与「估算」标签，缺失价不假装为 0。

## 值得借鉴、可纳入路线图的补充

按「对 DSH 插件价值 / 与现有安全边界兼容度」排序。

### P0 — 高价值、边界内、改动可控

1. **年度活跃热力图 + 连续天数（streak）**  
   Token Monitor 首页用 370 天热力图与 streak 表达「用了多少天」，比单纯 bucket 趋势更直觉。本仓库已有按日桶与时区正确性，可在 Full Dashboard 增加只读日历热力层，数据仍来自本地事实，不新增网络。

2. **仪表盘模块编排（超出固定预设）**  
   对方允许选择首页模块与顺序。我们可用「预设为起点 + 可开关/排序区块」（KPI / 趋势 / 账户 / 提醒 / 明细），避免用户为看配额而关掉全部分析，或为看分析而忍受无关卡片。

3. **订阅费用账本 + 回本提示**  
   对方在 Settings 手动记录每账号实际月费/储值，额度标签 tooltip 显示费用、续费日、相对本月估算成本的回本倍数。这是纯本地元数据，不碰凭据，与账户 snapshot 正交；适合补「订阅值不值」叙事，且不冒充发票。

4. **导出增强：日序列文件 + 可选自动写入目录**  
   对方导出固定三件套：`snapshot.csv` / `daily.csv` / 完整 JSON，并可按变更自动重写到用户选定目录（Obsidian / Grafana 友好）。我们目前是按当前过滤条件的即时下载。可增加「按日 × provider/model」历史导出；自动写盘若做，应仅写用户显式选择的本地路径，且永不包含凭据与 prompt。

### P1 — 运维与多账号体验

5. **额度刷新的自适应间隔（burn-rate）**  
   对方 `limitsRefreshMode: adaptive` 按窗口消耗速率缩短轮询，429 仍走退避；本地 token 用量不作为触发（避免第三方 key 与订阅计量错配）。我们可在现有 scheduler 上增加可选自适应，默认保持固定间隔，且继续「GET 不触发带凭据刷新」。

6. **同供应商多 profile / 多账号并排**  
   对方支持多 OpenRouter／第三方 profile，以及 Codex 已追踪账号切换。DSH 侧若一人多 key 或多中转站，当前多以单一 monitor 配置表达。可评估「providerId + accountLabel」并行 snapshot，UI 并排展示；账号切换若涉及改 Harness 凭据，必须显式 mutation 且可回滚，不能静默改写。

7. **额度失败时保留 lastGood**  
   对方 LimitsRuntime 明确保留上次成功快照。我们已有 `stale` / `partial`；可核对所有 adapter 路径在 transient 失败时是否永不被空快照覆盖（尤其 New API / 声明式）。

8. **Cache 明细可展开**  
   数据已具备；UI 可对 provider/model 行展开 cache hit vs miss、命中率，贴近对方 Tools/Models 展开交互。

### P2 — 可选、需严格门禁

9. **供应商 Status 页只读探测**  
   对方可选追踪 Claude / OpenAI / Cursor / DeepSeek 状态页。若引入，必须走现有 outbound 策略（协议、DNS、私网、大小、redirect），默认关闭，且不得附带用户凭据。

10. **项目维度分组**  
    对方可按 project 聚合。DSH 事件若已有稳定 project/workspace 标识且可脱敏，可作为可选 `groupBy`；默认关闭，避免高基数与路径泄露。

## 明确不建议照搬

与 `docs/research/usage-analytics-landscape.md`「Features intentionally not included」一致，并补充：

| Token Monitor 能力 | 不照搬原因 |
| --- | --- |
| 多设备 Hub / SSE / Cloudflare Worker / iOS 小部件 | 扩大攻击面；偏离 DSH 回环本地 API 模型 |
| Discord Rich Presence | 外发用量摘要，隐私与范围不适配 |
| models.dev 自动扫价 + 汇率自动换算 | 我们坚持用户显式价格与覆盖率 |
| 按需打开 transcript 做逐 prompt / 工具调用明细 | 易滑向 prompt/response 暴露；本插件刻意排除 tracing |
| ~~跨 Claude/Codex/Cursor/… 日志嗅探~~ | **1.6.0 决策变更**：用户明确要求 token-monitor 式本机监控。以严格防护落地为 `localUsage`（默认关闭）：仅提取时间/模型/Token 计数、硬化读（符号链接/属主/常规文件校验 + 字节预算）、SQLite 只存按日聚合且游标为路径 SHA-256、扫描仅走后台调度或显式 mutation。Cursor 等需要 IDE 数据库的工具仍不覆盖。 |
| 菜单栏排版作曲家 / 悬浮泡泡 / 全局快捷键 | 桌面壳能力，宿主是 DSH Web |
| WSL `\\wsl$` 扫描 | Windows 桌面场景；DSH 本机进程不需要 |

> 1.6.0 同步落地「本机认证监控」（`localMonitor`，默认关闭）：复用 OAuth 拉取的白名单硬化读，只读输出各官方 CLI 的登录态/到期/刷新能力与本插件 OAuth 会话状态，不输出令牌本体。

## 对现有文档的启示

- 景观文档第 4 组「Local CLI/session analyzers」应把 Token Monitor 列为代表产品：它比 ccusage 更完整（额度 + 趋势 + 可选同步），但仍是本地采集器而非 observability 平台。
- 我们已有的 `preserveDeletedSessions`、cache 四桶、软提醒、导出脱敏，可在对外说明中明确「与主流本地用量小窗同级的数据完整性预期」，避免用户误以为只有桌面工具才做得到。

## 建议的落地顺序（实现时）

详细波次、验收标准、供应商缺口与 adapter 规格见  
[`token-monitor-supplement-proposal.md`](./token-monitor-supplement-proposal.md)。

摘要：

1. Dashboard：日热力图 + streak（只读，复用现有日桶）。  
2. 模块开关/排序（预设仍作默认模板）。  
3. 订阅费用账本 + 回本 tooltip。  
4. 导出日序列；视需求再做目录自动导出。  
5. 新增 `volcengine-coding-plan`、`zai-team-plan`；多 profile + lastGood 加固。  
6. 额度自适应刷新；Antigravity 只读探测（不接管 OAuth）；Ollama 等 cookie 类仅 opt-in。

每一步都应附回归测试；涉及账户刷新与导出的变更需含负向/对抗用例（空快照覆盖、路径穿越、凭据不入库）。

## 参考

- 上游 README（中英）：`README.md` / `README.zh-CN.md`
- 上游架构约束：`AGENTS.md`（collector / LimitsRuntime / Hub 契约）
- 上游导出契约：`docs/export.md`
- 本仓库既有取舍：[`usage-analytics-landscape.md`](./usage-analytics-landscape.md)、[`ccswitch-provider-usage.md`](./ccswitch-provider-usage.md)
