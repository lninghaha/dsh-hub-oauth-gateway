# 架构

> [**English**](02-architecture.md) · 中文

本文档描述 `dsh-hub-oauth-gateway` 的内部架构。它是 `README.md` 中技术说明的来源，面向贡献者与维护者。

## 目标

1. 保持为普通的 DeepSeek Harness Web bundle，而非替换 Web shell。
2. 默认将用量历史与账户快照保留在本地。
3. 将被动用量投影与携带凭据的账户刷新分离。
4. 让局部失败可见，而不因单个损坏会话或 provider 演变为全局故障。
5. 将定价视为用户自有、版本化的估算数据，而非硬编码的计费真相。
6. 发布确定性的、不依赖外部运行时依赖的产物。

## 运行时形态

```text
DSH session inventory ──> usage projector ──> SQLite facts/cursors ──> query service
                                               │                         │
DSH provider settings ──> account specs ──> adapters ──> snapshots       ├─ v1 API
                                               │                         └─ legacy API views
DSH credentials seam ──────────────────────────┘

DSH Web slots ──> classic client bundle ──> TanStack Query ──> Quick Peek / Dashboard / Settings
```

服务端导出 Cordis 契约 `name`、`inject`、`Config` 与 `apply`。客户端仅注册已声明的 DSH 插槽：

- `sidebar.footer.action`
- `shell.overlay`
- `settings.section`

它从不注册 `root` 应用，也不启动第二个 Web 服务器。

## 用量投影

会话清单（session inventory）暴露持久化与实时快照。投影仅折叠携带用量信息的事件，并为以下组合各写入一条 fact：

```text
(session_id, turn, step)
```

对同一逻辑步骤的后续观测会替换先前的 fact。这至关重要，因为流式与持久化快照可能反复暴露同一 turn。每个会话游标记录来源类型、修订号、下一事件序号、当前 provider/model、最后可见时间与删除状态。

投影特性：

- 会话失败相互隔离；
- 重复的 inventory ID 会被拒绝并计为局部失败；
- 已删除会话的 fact 默认保留；
- 启动时投影先于 legacy 用量迁移，防止重复导入；
- 每次成功的投影同步都会重试未完成的 legacy 用量迁移；
- GET 请求从不触发投影；启动、调度器与显式 refresh POST 会触发。

## SQLite 存储

数据库位于 `${DSH_HOME}/storages/usage-stats-v1.sqlite`，使用 WAL、外键、busy timeout、预编译语句与事务。

逻辑表涵盖：

- schema migrations；
- session cursors；
- usage facts；
- account snapshots；
- price rules；
- user preferences；
- legacy migration state。

现有文件会先按本应用的 id/schema 分类与校验，再执行任何 `chmod`、WAL 或其他可变 PRAGMA。无法识别、属于其他应用或版本更新的数据库不会被改动。文件被识别为本应用所有后，存储层会将父目录修复为模式 `0700`、主数据库文件修复为 `0600`。保留策略在启动时与计划用量同步期间执行。

数据库刻意不包含凭据值、prompt/response、工作目录、本地凭据文件路径或 provider 原始 payload。

## 账户子系统

Provider 描述符来自 DSH 设置与兼容性目录。`resolveAccountSpecs()` 将每个描述符与经校验的 monitor 配置组合，并选择 21 个 adapter 之一。

Antigravity 额度保持 Hub **只读、显式配置** 的 `antigravity-quota`；Google OAuth 仍由 `dsh-agy` 负责。见 [`docs/research/adr-antigravity-quota-probe.md`](research/adr-antigravity-quota-probe.md)。

每个 adapter 返回相同结构的规范化快照：

- provider/display/adapter 标识符；
- `balance` 或 `subscription` 模式；
- 配置与状态；
- 可选 plan 与 balance；
- 零个或多个 quota 窗口；
- 缺失的凭据引用；
- 新鲜度与 warning 元数据。

服务提供 single-flight 刷新、有界并发、内存缓存、持久化快照，以及在瞬时错误时保留 stale 数据的行为。

### 出站网络边界

所有 adapter 请求均通过集中 transport：

1. 校验协议并拒绝嵌入 URL 的凭据；
2. 除非显式允许跨源访问，否则强制使用 provider 的原始 origin；
3. 解析全部地址并默认拒绝私有/保留目标；
4. 将已校验的 DNS 应答固定到实际 HTTP(S) 连接；
5. 禁用自动 redirect；
6. 强制执行 timeout、媒体类型、状态码与响应大小限制。

注入的测试 transport 同样通过上述目标策略。这可防止 monitor 覆盖将 provider bearer token 发往任意公网 origin。

## 定价与成本估算

价格规则按 currency、effective time、provider pattern、model pattern、source priority、pattern 特异性与 update time 选择。Pattern 支持字面文本加 `*`；它们不是正则表达式。

每个 Token 类别单独定价。缺失类别保持未覆盖，API 返回 coverage ratio。成本值始终标记为 estimated。1.0 版本不捆绑 volatile 价格目录。

## 查询与 API 层

版本化 API 基路径为 `/api/usage-stats/v1`，返回共享 envelope：

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "schemaVersion": 1,
    "generatedAt": 0,
    "sourceUpdatedAt": 0,
    "partial": false,
    "stale": false,
    "warnings": []
  }
}
```

读端点仅查询本地 SQLite/账户快照。`/refresh` 是唯一的一般刷新 mutation。兼容端点从同一 v1 仓库渲染 v0.3 形态，GET 同样不会触发刷新。

浏览器从不直接读取 SQLite、凭据或 provider 端点。它在当前 DSH Web origin 下调用 API，插件服务端返回本地投影。直接访问仍仅限回环。通过受信任的 HTTPS 反向代理访问时，`X-Forwarded-*` 不参与授权：实际 peer 必须列入 `codingOAuth.ownerRequest.trustedProxy.peers`，请求还必须具备精确 HTTPS `Origin` 与匹配的公网 `Host`、owner proof 以及同源 Fetch Metadata；变更请求还需独立的 CSRF proof。代理策略配置不完整时 fail closed，反代转发到 DSH 时必须保留公网 `Host`。

日历范围与 bucket 使用配置的 IANA 时区，包括 DST 转换。Forecast 使用有界线性外推，并作为独立 series 返回。

除非隐私偏好显式启用标识符，否则禁用会话分组。禁用时，breakdown key 与 label 均匿名化。

## 编程订阅 OAuth 子系统

`src/server/coding-oauth/` 树集成 `dsh-coding-subscription-oauth` 包（保留 Apache-2.0 署名；见 `docs/oauth-provenance.md`）。它通过 `ctx.llm.registerAdapter` 注册 LLM 路由 `grok-build`、`codex-oauth`、`kimi-code-oauth` 与 `claude-code-oauth`，使已登录的订阅账户在 DSH 模型选择器中显示为 `(OAuth)`。Grok Build 使用 first-party PKCE 加 device-code 登录 `auth.x.ai`，并从 `cli-chat-proxy.grok.com` 流式传输；Codex/Kimi/Claude 复用 pi-ai provider-native OAuth 与 refresh 协议。凭据存放在 `${DSH_HOME}` 下仅所有者可读的 `0600` 文件中，任何 HTTP 状态、日志或 UI 表面均不返回凭据。

Hub 与独立包目前在 registry 上精确依赖 `dsh-coding-oauth-core@0.1.1` 与 `undici@7.29.0`。Hub 另在 `vendor/dsh-coding-oauth-core` 维护可发布的 `0.1.2`（本地 `file:` override），新增共享 helper（`http-json`、`grok-errors`、`kimi-errors`、`gateway-protocol`）及对应 subpath exports。核心统一拥有 root-scoped owner 选举、引用计数代理策略、原子注册、provider/route/credential 标识、能力设置命名空间、Gateway 状态文件名，以及全部新旧管理路径。Hub 优先成为 owner；Hub 卸载后独立包自动接管。相同状态契约也通过 browser-safe 入口供客户端使用，避免客户端路径与服务端静默漂移。Grok Imagine 保留显式 pinned dispatcher，不使用共享 proxy lease。

设置 UI（Settings → Usage Center → 订阅账号/网关/能力 tabs）与插件自有的同源路由 `/plugins/dsh-grok-build/*` 通信：`oauth/status|login|code|cancel|logout|models` 用于登录状态机，`oauth/sources(+preview|commit|cancel)` 用于两阶段 allowlisted CLI 凭据拉取，`gateway(+reveal|rotate)` 用于 opt-in loopback API gateway（在独立的 `node:http` listener 上提供 `/v1/chat/completions`、`/v1/responses`、`/v1/messages`，默认关闭），`capabilities` 用于七个默认关闭的可选 capability 开关及基于 revision 的 compare-and-swap 写入。这些路由均要求受信任的 owner 请求；变更类请求还要求 JSON body 与 Hub CSRF 头 `x-dsh-hub-oauth-gateway: 1`（受信任 HTTPS 反代的变更请求改用独立的 owner CSRF proof）。网关密钥 reveal/rotate 仍仅限回环。

## 本地 monitor 子系统

`src/server/local-monitor/` 增加 token-monitor 风格的本地能力面，均为 opt-in：

- **认证快照**（`localMonitor.enabled`）：复用 OAuth 导入 allowlist 与加固 reader，报告各官方 CLI 的登录状态、token 过期与 refresh-token 是否存在，以及本插件自身存储的 OAuth 会话。仅不含 secret 的状态会跨越 API 边界。
- **跨工具用量扫描**（`localUsage.enabled`）：增量扫描器遍历 Claude Code、Codex CLI、Kimi Code 与 OpenCode 日志根目录，含 symlink/owner/regular-file 检查及 per-file/per-run 字节预算。解析器仅提取 timestamp、model id 与 token 计数。SQLite schema v4 以文件路径 SHA-256 为 key 存储 per-file 日聚合，因此轮转会精确替换某文件的贡献，且从不持久化绝对路径。扫描在调度器或显式 `POST /local/usage/scan` 时运行；`GET /local/usage` 仅读取聚合。

## 客户端架构

源客户端使用 React 18、TanStack Query、Zod 校验与 uPlot。构建产物为包裹在以下结构中的单一 classic script：

```js
window.__ModuleLoader__.load("dsh-hub-oauth-gateway", async function (require, module, exports) {
  // bundled plugin
});
```

DSH 平台包 externalize 为 `require()` ID。TanStack Query、Zod、CSS 与 uPlot 被打包；uPlot 初始化保持 lazy。

展示状态分为：

- 服务端支持的 user preferences；
- 临时 overlay/filter 状态；
- 缓存且经 schema 校验的 API 查询。

视觉层消费官方 DSH 主题 alias token（`--dsw-alias-*`）与平台 settings 行几何（flat 16px rows、36px capsule controls），使插件跟随宿主 light/dark 主题，而非自带私有调色板。Settings 控件使用共享的 `controls.tsx` row/toggle/select 原语；coding OAuth tabs 共用同一语言。

可选的 account、alert、series 或 breakdown 失败仅降级各自区块，而非清空整个 dashboard。

## 构建与发布

主验证路径是 **Cursor Cloud / 仓库云环境**，使用声明的 Node.js 与 pnpm
工具链（见 `docs/00-project-rules.md` §2.3）。仓库 `Dockerfile` 仍可供 CI
或偏好容器的贡献者使用，但不是交付门禁。

`pnpm run release:build` 执行 clean build 到 `.next/lib`，将服务端依赖打包为
standalone ESM `index.js`，产出 classic client bundle，原子替换 `lib/`，并校验：

- package entrypoints；
- Cordis plugin exports；
- standard-schema config；
- 无 bare runtime import 打包依赖；
- 单一 client module-loader 注册；
- 无 stale v0.3 runtime 文件；
- 兼容 installer 行为。

发版检查还会核对 `package.json#files` 白名单与 `npm pack --dry-run` 清单。
已提交的 `lib/` 产物是 Git-host 安装契约，因此 fallback installer 无需安装
transitive runtime 依赖。
