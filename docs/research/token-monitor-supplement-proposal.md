# Token Monitor 参照补充建议书

> 文档性质：历史基线建议书（2026-08-18 起草；对照当时 `1.1.0` 现状）  
> **状态刷新（2026-09-02 / Hub `1.11.2`）**：Wave 1–3 主能力已在 `1.2.0`–`1.4.0` 落地；`1.9`–`1.11` 另交付 DSH BOM/core 共装、Providers 凭据维护、AuthDocument v2 多账号与 `codingOAuth.pool` 等（见下方能力表与 CHANGELOG）。未勾选的决策清单与「明确不进路线图」项仍为开放建议，勿当作未实现清单的全量现状。  
> 研究时间：2026-08-18  
> 对照基线：[Javis603/token-monitor](https://github.com/Javis603/token-monitor) `v0.45.0` @ `36f6d2e`  
> 本仓库基线（起草时）：`dsh-hub-oauth-gateway` 1.1.0（21 个内置 account adapter + 声明式 monitor）  
> 相关调研：[`token-monitor.md`](./token-monitor.md)、[`ccswitch-provider-usage.md`](./ccswitch-provider-usage.md)、[`usage-analytics-landscape.md`](./usage-analytics-landscape.md)

## 1. 目标与边界

### 1.1 目标

在不削弱本地 API 防护、不引入 prompt/response 持久化、不启动第二套公网服务的前提下：

1. 把 Token Monitor 中已被验证、且适配 DSH 插件形态的 **呈现与运维能力** 落地到用量中心；
2. 补齐本仓库相对 Token Monitor / 主流编码订阅生态仍缺失、但 **适合走集中 transport + account adapter** 的供应商与订阅窗口。

### 1.2 硬边界（不得突破）

| 边界 | 说明 |
| --- | --- |
| 形态 | 仍是一个 Cordis 服务端插件 + classic-script 客户端；不做 Electron 壳、不做独立 Web 端口 |
| 网络 | 凭据只经集中 transport；HTTPS、DNS/私网、redirect、超时、响应大小继续受控 |
| 刷新 | 普通 GET 只读本地快照；带凭据上游刷新保持显式 mutation 或后台调度 |
| 隐私 | SQLite / API / 日志 / 导出默认不含凭据、prompt/response、cwd、credential 路径、供应商原始响应 |
| 价格 | 不引入 models.dev 自动扫价或静默汇率换算；估算成本必须带覆盖率 |
| 强制 | 不做硬预算阻断；提醒保持本地软提醒 |
| Antigravity | OAuth/路由仍由外部 `dsh-agy` 管理；本包最多做 **可选额度探测**，不接管其登录 |

### 1.3 成功标准

- 用户在 DSH Usage Center 能看到与 Token Monitor 同级的「长期活跃感」（热力图/streak）与「订阅值不值」信息，而无需安装桌面小窗。
- 对 DSH 已配置、且本建议批准的供应商：账户卡不再长期停留在 `unsupported` / `not-configured`（凭据齐全时）。
- 每项能力有正向 + 负向测试；安全边界变更有对抗用例。
- 版本：纯呈现为 **minor**；新增 adapter / 配置字段为 **minor**；破坏 snapshot wire 或 monitor 契约为 **major**（本建议尽量避免 major）。

---

## 2. 能力对照总表

| 能力 | Token Monitor | 起草时现状（1.1.0） | 建议 / 落地状态（至 1.11.x） |
| --- | --- | --- | --- |
| 跨工具日志解析 | tokscale 30+ client | DSH usage 投影 | 不照搬 |
| 多设备 Hub / SSE | 有 | 刻意不做 | 不照搬 |
| 日/周/月趋势 + 预测 | 有（含 K 线） | 有趋势 + 有界线性预测 | 保留现实现 |
| 年度热力图 + streak | 有 | 无 | **已落地（1.2.0）** |
| 首页模块编排 | 可开关排序 | 四档预设 | **已落地（1.2.0）** |
| 订阅费用账本 + 回本 | 有 | 无 | **已落地（1.2.0）** |
| 导出 CSV/JSON | 有 + 自动写目录 | 有过滤导出 | **日序列/bundle 已落地（1.2.0）；自动写盘已落地（1.4.0，opt-in）** |
| Cache 四桶 + 命中率 | 有，可展开 | 有指标与列 | **展开列已落地（1.4.0）** |
| 额度自适应刷新 | burn-rate adaptive | 固定 interval | **已落地（1.4.0，`adaptive` 可选）** |
| 失败保留 lastGood | LimitsRuntime | `withStaleData` 已有 | **已加固（1.4.0）** |
| 同供应商多账号 | 广泛支持 | 基本一 provider 一 monitor | **monitor profiles 已落地（1.4.0）；OAuth AuthDocument v2 多账号已落地（1.11.0）** |
| Status 页探测 | 可选 | 无 | 可选（P2，未做） |
| Discord / 托盘作曲家 | 有 | 不适用 | 不照搬 |
| Session 逐 prompt | 读本地 transcript | 刻意排除 | 不照搬 |
| Hub/Subscription 共装与 BOM | — | 无共享 core 选举 | **已落地（1.9.0–1.10.0）**：`dsh-coding-oauth-core` 所有权、DSH BOM/client 门禁 |
| Providers 凭据维护 | — | OAuth 与 Providers 易漂移 | **已落地（1.8.0）** |
| Copilot / Claude import / pool | — | 无 | **已落地（1.11.0）**：Copilot 路由、Claude Code import、`codingOAuth.pool` |

---

## 3. 最值得补：功能建议（详细）

### 3.1 P0-A 年度活跃热力图 + Streak

**动机**  
趋势图回答「某段时间用了多少」；热力图回答「我有多持续地在用」。Token Monitor 用约 370 天格子 + 连续天数，对个人开发者极强。

**数据**  
复用现有 `UsageRepository` 按配置时区的 **日桶**（`granularity=day`）。每个格子：`tokens` 或 `estimatedCost`（跟随当前 metric）；无事实日为 0/空，与「无数据」和「零请求」需可区分（建议空=无事实，0=有投影但总量为 0）。

**UI**  
- Full Dashboard，Analyst / Cost 预设默认开；Minimal 关；Quota 可选关。  
- 一行热力条 + 「当前连续 N 天 / 最长 M 天」。  
- Streak 定义：配置时区下，从「今天」向前，连续 `totalTokens > 0` 的日数；允许设置「忽略低于 T tokens 的日」避免噪声（默认 T=0）。

**API**  
`GET /api/usage-stats/v1/activity?from=&to=&metric=` → `{ days: [{ date, tokens, cost, requests }], streak, longestStreak }`  
仅读本地；禁止触发上游。

**测试**  
时区边界（UTC+8 午夜）、DST、空库、仅 cache 无 input、跨月 streak。

**SemVer**：minor。

---

### 3.2 P0-B 仪表盘模块编排

**动机**  
四档预设好上手，但无法表达「只要 KPI+账户」或「只要趋势+明细」。Token Monitor 的模块开关更贴个人工作流。

**模型**（建议加在 `UserPreferences.display`）

```ts
modules: {
  order: Array<"kpi" | "heatmap" | "trend" | "accounts" | "alerts" | "breakdown">;
  hidden: Array<同上>;
}
```

- 切换预设时：若用户未自定义过 `modules`，套用预设模板；若已自定义，预设只改「推荐默认」不覆盖（或提供「重置为预设」按钮）。  
- 顺序拖拽可后置；首版允许 Settings 里多选 + 上下移动即可。

**预设模板建议**

| 预设 | 默认可见 |
| --- | --- |
| minimal | kpi |
| quota | kpi, accounts, alerts |
| cost | kpi, heatmap, trend, accounts, breakdown |
| analyst | 全部 |

**测试**：隐藏 accounts 时不请求多余字段亦可；顺序持久化 round-trip。

**SemVer**：minor（preferences 向后兼容：缺省字段填默认）。

---

### 3.3 P0-C 订阅费用账本 + 回本提示

**动机**  
配额百分比不回答「我付了多少、值不值」。Token Monitor 的 subscription ledger 是纯本地元数据，与凭据解耦，非常适合本插件。

**数据模型**（本地 SQLite 新表或 preferences 旁路存储；**不得**进导出默认内容除非用户显式勾选）

```ts
type FeeKind = "subscription" | "topup";
type FeeInterval = "month" | "year";

interface AccountFeeRecord {
  id: string;                 // uuid
  providerId: string;         // 对齐 AccountSnapshot.providerId
  accountLabel?: string;      // 多账号时区分
  kind: FeeKind;
  planName?: string;
  amount: number;             // 用户录入
  currency: string;           // 必须与 display.baseCurrency 一致才参与回本；否则只展示原文
  interval?: FeeInterval;     // subscription 必填
  anchorDate?: string;        // YYYY-MM-DD，billing cycle anchor
  nextRenewalDate?: string;
  topups?: Array<{ date: string; amount: number }>; // kind=topup
  notes?: string;             // 短文本，禁敏感
  updatedAt: number;
}
```

**回本倍数（展示层推导，不写 wire 权威字段）**

- 月等价费用 `monthlyEquivalent`：年付 `/12`，月付原值；topup 用「本自然月 topup 合计」或「近 30 天合计」（Settings 二选一，默认自然月）。  
- `payback = monthEstimatedCost / monthlyEquivalent`（仅当两边货币一致且覆盖率达标时显示；否则显示「价格覆盖不足，无法比较」）。  
- Tooltip 挂在 AccountGrid 的 plan / 余额标签上。

**API**  
`GET/PUT /api/usage-stats/v1/fees`（写请求走现有 CSRF/同源/大小限制）。

**不做**  
不从供应商账单自动拉取真实发票；不因费用记录触发上游。

**SemVer**：minor。

---

### 3.4 P0-D 导出增强（日序列；自动写盘为 P1）

**现状**  
按当前过滤条件导出 provider/model/session 快照。

**建议增加文件语义**（可仍由同一 export 端点用 `format`/`layout` 参数区分）

| 布局 | 内容 |
| --- | --- |
| `filtered`（现有） | 当前查询窗口聚合行 |
| `daily`（新） | `date,provider,model,input,output,cache_read,cache_write,requests,estimated_cost,coverage` |
| `bundle`（新） | JSON：`generatedAt` + `snapshot` + `daily[]`（类似 Token Monitor 三件套的本地版） |

**P1 自动导出**  
用户在 Settings 指定 **本机目录**（经服务端校验：必须落在用户显式授权路径策略内；云环境若无法安全暴露目录则仅保留下载）。变更时防抖写入；无变化不重写。永远不写凭据与 session 明文（遵循 `redactExports`）。

**SemVer**：minor。

---

### 3.5 P1-E Cache 明细展开

数据已在 breakdown。UI：provider/model 行可展开显示 cache hit vs miss、命中率、四类 token。不新增网络。

### 3.6 P1-F 额度自适应刷新

**现状**  
`RefreshScheduler` 固定 `accountIntervalMs`。

**建议**  
`accounts.refreshMode: "fixed" | "adaptive"`（默认 `fixed`）。  
Adaptive：根据各窗口 `usedPercent` 近两次差值估算 burn-rate，将间隔夹在 `[min, max]`（例如 2min–30min）；429/`rate-limited` 只走既有退避，不因本地 token 用量触发（避免第三方 key 与订阅计量错配——与 Token Monitor 一致）。

**不变式**  
页面打开 / 普通 GET 仍不触发带凭据刷新。

### 3.7 P1-G lastGood 审计

已有 `withStaleData`。建议：

1. 为 New API、declarative、各 OAuth adapter 增加「transient 失败不得用空 ok 覆盖」回归测试；  
2. UI 明确展示 `stale` + 上次成功时间；  
3. 连续失败 N 次才降级为非 stale 的 `unavailable`（可选，需产品确认）。

### 3.8 P1-H 同供应商多账号 / 多 profile

**动机**  
Token Monitor 对 OpenRouter、DeepSeek、Z.ai、第三方 New API 等支持多 profile 并排。DSH 用户亦常见「正式 key + 备用中转」。

**模型建议**

```yaml
accounts:
  monitors:
    openrouter:                 # 兼容现有单账号
      adapter: openrouter-balance
    openrouter#work:            # 或显式 profiles 数组（二选一，推荐数组以免 key 解析歧义）
      ...
```

更干净的配置：

```yaml
accounts:
  monitors:
    openrouter:
      profiles:
        - id: personal
          credentialRef: OPENROUTER_MGMT_PERSONAL
        - id: work
          credentialRef: OPENROUTER_MGMT_WORK
```

- Snapshot 主键改为 `(providerId, profileId)`；UI 并排卡片。  
- **不做**静默「一键切换本机默认 Codex 账号」改写 Harness 凭据；若未来做切换，必须独立 mutation + 确认 + 可审计。

**SemVer**：minor（单 profile 行为保持兼容）。

### 3.9 P2（可选）

| 项 | 条件 |
| --- | --- |
| Status 页只读探测 | 默认关；无凭据；走 outbound 策略；失败不影响用量 |
| `groupBy=project` | 仅当 DSH 事件有稳定、可脱敏 project id；默认关 |
| 浅色/密度已有 | 不追 Token Monitor 玻璃拟态 |

---

## 4. 供应商 / 订阅缺口矩阵

### 4.1 Token Monitor Limits 对照

| TM provider | 本仓库 adapter / 默认 | 缺口判定 | 建议优先级 |
| --- | --- | --- | --- |
| claude | `claude-oauth` | 已有 | — |
| codex | `codex-wham` | **已修**：补 `chatgpt-account-id` + `used_percent`；不做 CLI app-server spawn | — |
| opencode | `opencode-go` | Go API 已有；TM 另读本地 OpenCode DB 限额 | P2：仅当 DSH 暴露同类本地态再考虑 |
| cursor | `cursor-subscription` | 已有 | — |
| antigravity | catalog `unsupported`（`dsh-agy` 外置） | **额度探测缺失** | **P1**（只读探测，不接管 OAuth） |
| kimi | `kimi-token-plan` / OAuth→`KIMI_API_KEY` 桥 | OAuth 已桥接 Coding usages；TM Web cookie 仍不做 | — |
| grok | `grok-subscription` | billing + `grok.com` credits 回退；不 spawn CLI | — |
| copilot | `copilot-device` | 已有 | — |
| commandcode | 无 | **缺失** | P2（cookie / 非官方 internal API，稳定性与 ToS 风险高） |
| mimo | 无 | **缺失** | P2（cookie） |
| zai | `zai-token-plan` / `zai-balance` | 已有 | — |
| zaiteam | 无 | **缺失（智谱团队版）** | **P0** |
| kiro | 无 | **缺失** | P2（依赖 `kiro-cli` spawn + ANSI 解析，沙箱与攻击面差） |
| qoder | 无 | **缺失** | P2（cookie 或读本地 DB；schema 易碎） |
| deepseek | `deepseek-balance` | 已有 | — |
| openrouter | `openrouter-balance` | 已有 | — |
| minimax | `minimax-token-plan` | 已有 | — |
| volcengine | 无 | **缺失（方舟 Coding Plan）** | **P0** |
| ollama | 无 | **缺失（Cloud session/weekly）** | P1（cookie，需明示风险） |
| thirdparty | `new-api` / `declarative` / `general` / `sub2api` | 大体已有 | P1：多 profile |

### 4.2 本仓库已有、TM 未作为主 Limits 强调的

保留并继续维护：`dashscope-balance`、`siliconflow-balance`、`gemini-quota`、`amp-subscription`、`sub2api`、`general`、`declarative`。这些是 DSH/中转站场景优势，不必为对齐 TM 而削弱。

---

## 5. 建议新增 / 增强的 Adapter（详细）

### 5.1 P0 · `volcengine-coding-plan`（方舟 Coding Plan）

**用户价值**  
国内 Doubao / Ark 编码订阅用户在 DSH 配置 Volcengine 路由后，目前无统一配额卡。

**上游（参照 TM `volcengineLimits.js`）**  
- 签名 OpenAPI：`GetCodingPlanUsage`（Access Key / Secret，区域默认 `cn-beijing`）。  
- 或 Ark API key 探测路径（TM 另有 chat completions 探针；**我们优先官方 usage Action，避免用聊天探针消耗配额**）。

**输出**  
`mode: "subscription"`，窗口建议映射：

| kind | 含义 |
| --- | --- |
| session | 约 5h 滚动 |
| weekly | 7 日 |
| monthly | 约 30 日 |

**配置示例**

```yaml
accounts:
  monitors:
    volcengine:
      adapter: volcengine-coding-plan
      credentialRef: VOLCENGINE_AK_SK   # 或拆 akRef/skRef；禁止把 sk 写入 Cordis 明文
```

**安全**  
- AK/SK 只经 credential store；日志只留 fingerprint。  
- Host allowlist：`open.volcengineapi.com` / 文档所列 Ark 域名；默认同 origin 策略。  
- 不实现「用聊天补全探测额度」。

**测试**  
签名规范化 fixture、窗口解析、403/签名错误、缺 sk、时钟偏斜。

---

### 5.2 P0 · `zai-team-plan`（智谱 GLM 团队版）

**用户价值**  
个人版已有 `zai-token-plan`；团队版 endpoint/参数不同（TM：`open.bigmodel.cn` + `type=2`），个人 key 查不到团队配额。

**上游**  
`GET https://open.bigmodel.cn/api/monitor/usage/quota/limit?type=2`  
Auth：与个人版相同的 raw API key 风格（无 Bearer，以官方/TM 实测为准，用 fixture 锁死）。

**配置**

```yaml
accounts:
  monitors:
    zai-team:
      adapter: zai-team-plan
      credentialRef: ZAI_TEAM_API_KEY
      # 可选 organization/project 头或 query，若上游需要
```

**与个人版关系**  
- 不自动互相回退。  
- UI 显示名「GLM Team」；可与 `zai` 个人卡并存（多 profile 或不同 providerId）。

**测试**  
`type=2` 响应解析、与个人版 fixture 隔离、错误码、空 limits。

---

### 5.3 P1 · Antigravity 额度只读探测（`antigravity-quota`）

**约束**  
[`docs/oauth-provenance.md`](../oauth-provenance.md)：登录/路由仍属 `dsh-agy`。本 adapter 仅在检测到 `agy` provider 已安装且用户显式配置 monitor 时探测配额。

**实现策略（择一，需 POC）**  
1. 优先：若 `dsh-agy` 或本机 CLI 暴露稳定 usage RPC/文件，走只读接口；  
2. 其次：文档化的官方 quota URL + OAuth token **由用户/外置插件注入的 credentialRef**；  
3. 拒绝：在本包内复制完整 Antigravity 登录或 spawn 未审计二进制为默认路径。

**状态机**  
- 未安装 `dsh-agy` → `not-configured` / 提示外置插件；  
- 已安装未授权 → `not-configured`；  
- 探测成功 → 标准 subscription windows。

---

### 5.4 P1 · `ollama-cloud`（可选）

**上游**  
TM 通过 `ollama.com/settings` + session cookie 解析 session/weekly。属 **网页会话复用**，风险高于 API key。

**落地条件（全部满足才做）**  
1. 用户显式 opt-in；  
2. Cookie 只进 credential store；  
3. Host 钉死 `ollama.com`；  
4. 解析失败不得清空 lastGood；  
5. README 标明「非官方 API，可能随时失效；仅监测自有账户」。

否则保持 `unsupported`，建议用户用 declarative 自建（若日后有官方 API）。

---

### 5.5 P2 · 高风险 / 延后

| Adapter | 原因 | 替代 |
| --- | --- | --- |
| `commandcode` | internal billing + cookie | 等官方 API 或 declarative |
| `mimo` | 平台 cookie 组合 | 同上 |
| `qoder` | cookie 或本地 SQLite schema 易碎 | 用户 declarative；不读 IDE DB |
| `kiro` | spawn CLI + ANSI；Docker/无头环境差 | 不默认；若做必须 opt-in 且禁任意路径 |
| OpenCode 本地 DB 限额 | 读宿主 SQLite，超出「远端账户监测」模型 | 维持 `opencode-go` API |

### 5.6 P1 · 增强现有而非新建

| 项 | 说明 |
| --- | --- |
| OpenRouter 多 Management Key | 多 profile |
| New API token-scoped + PAT 回退 | 已有设计；补多实例 profile 与 lastGood 测试 |
| Kimi Web cookie | 仅当 Coding API 不足时作显式 fallback |
| DeepSeek 月消费曲线 | TM 有 balance history；可作账户卡次要序列，P2 |

---

## 6. 推荐交付波次

### Wave 1 — 体验对齐（建议一个 minor：`1.2.0`）

1. P0-A 热力图 + streak  
2. P0-B 模块编排  
3. P0-C 订阅费用账本 + 回本 tooltip  
4. P0-D `daily` / `bundle` 导出  

**验收**：中英文文案齐全；Docker sandbox 跑 `pnpm run check`；无新依赖或仅 UI 图表轻量依赖（优先复用现有 uPlot/SVG）。

### Wave 2 — 账户覆盖（`1.3.0`）

1. `volcengine-coding-plan`  
2. `zai-team-plan`  
3. P1-G lastGood 全 adapter 回归  
4. P1-H 多 profile 配置模型（至少 OpenRouter + New API + Z.ai）  

**验收**：各 adapter 脱敏 fixture；负向（错钥、私网 URL、超大响应、跨 origin 无 allow）；`docs/03-configuration.md` / README 多语种更新。

### Wave 3 — 运维与可选（`1.4.0` 或按需）

1. P1-F 自适应刷新  
2. P1-E cache 展开  
3. Antigravity 只读探测（POC 通过后）  
4. Ollama Cloud opt-in（若接受 cookie 政策）  
5. 自动导出目录（环境允许时）  

### 明确不进路线图

多设备 Hub、Discord Presence、自动扫价、transcript 逐 prompt、跨工具 tokscale 采集、Kiro/Qoder/CommandCode/MiMo 默认内置（除非官方稳定 API 出现）。

---

## 7. 工程落点（实现时对照）

| 区域 | 路径 |
| --- | --- |
| 偏好 / 模块 | `src/shared/preferences.ts`、`SettingsSection.tsx`、`UsageOverlay.tsx` |
| 热力图查询 | `src/server/usage/query.ts`、`router.ts`、新 client 组件 |
| 费用账本 | 新 `src/server/fees/` + SQLite migration；`AccountGrid.tsx` tooltip |
| 导出 | `router.ts` export 分支；CSV 公式注入沿用现有防护 |
| 调度 | `src/server/scheduler.ts`、`config.ts` |
| Adapter | `src/server/accounts/adapters/*`、`registry.ts`、`PROVIDER_DEFAULTS` |
| 文档 | `docs/03-configuration.md`、`README.md`（及社区语种 README）、`CHANGELOG.md`；本建议书可在实现后改「状态」列 |

**许可证**  
参考 Token Monitor / CC Switch 仅为行为与 endpoint 研究；实现用自有 TypeScript + 脱敏自建 fixture，不复制对方源码。Volcengine 签名等按官方文档实现。

---

## 8. 决策清单（供维护者勾选）

- [ ] Wave 1 是否纳入下一个 minor？  
- [ ] 订阅费用货币是否 **强制** 等于 `baseCurrency`，还是允许「只展示不参与回本」？  
- [ ] 多 profile 配置用嵌套 `profiles[]` 还是 `provider#label` key？  
- [ ] Volcengine 凭据形态：单一 `AK:SK` ref 还是双 ref？  
- [ ] Antigravity：本包只读探测 vs 完全留给 `dsh-agy`？  
- [ ] Ollama / 其他 cookie 类：允许 opt-in 还是一律等官方 API？  
- [ ] 自动导出写盘：是否只在「非沙箱本机 DSH」文档化支持？  

---

## 9. 摘要

**最值得补的产品能力**：热力图+streak、模块编排、订阅费用账本、日序列导出。  
**最值得补的供应商**：Volcengine Coding Plan、Z.ai/智谱 Team；其次多 profile、Antigravity 只读额度、审慎的 Ollama Cloud。  
**不要补**：桌面同步壳、自动扫价、transcript 深挖、脆弱的 cookie/CLI 抓取作为默认能力。

本建议书不改变运行时代码；落地时按波次开独立实现 PR，并在 Docker sandbox 完成门禁后再声称验证通过。
