# dsh-hub-oauth-gateway

[![CI](https://github.com/lninghaha/dsh-hub-oauth-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/lninghaha/dsh-hub-oauth-gateway/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-2da44e)](LICENSE)
[![Contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](CONTRIBUTING.md)

DeepSeek Harness Web 的本地优先用量中心：Token、估算成本、账户余额、订阅配额、趋势、预测、提醒与导出。

A local-first usage center for DeepSeek Harness Web: tokens, estimated cost, account balances, subscription quotas, trends, forecasts, alerts, and exports.

> 1.0.0 是独立 TypeScript 重构。服务端使用 SQLite，客户端是一个符合 DSH classic-script loader 契约的单文件插件。提示词、回复、工作目录、凭据值和供应商原始响应不会写入统计数据库或返回浏览器。

> **更名说明 / Renamed**：本项目前身为 `dsh-usage-stats`（原仓库 `Ychris12138/dsh-usage-stats`）。包名与仓库已更名为 `dsh-hub-oauth-gateway`，旧包名不再收到更新；已安装旧版本的用户请先移除旧 entry，再按下方说明重新安装。本地数据文件与内部插件 id 保持不变，历史统计数据不受影响。本次更名随 1.1.0 版本发布生效。
>
> **1.5.0**：完整仪表盘与 Settings → 用量中心改为顶部页签（一次只展示一块），Peek/仪表盘改为内容高度 + `max-height`，缩短瀑布流。
>
> **路线图 / Roadmap**：在用量中心之外，本仓库计划整合编码订阅 OAuth 登录（合并 `dsh-coding-subscription-oauth`）与 API 网关能力；这些功能尚未发布。

## 功能 / Highlights

- **Quick Peek + Full Dashboard**：侧栏快速查看；完整仪表盘用顶部页签（概览 / 趋势 / 账户 / 明细）一次只展示一块，支持 today / 7d / 30d / month、自定义维度、上一周期对比和手动刷新。
- **设置页签**：Settings → 用量中心拆成显示 / 供应商 / 费用 / 凭据四个顶部标签，缩短瀑布流滚动。
- **四种展示预设与模块编排**：Minimal、Quota、Cost、Analyst；可自定义模块显示/顺序并重置为当前预设；另有紧凑/舒适密度、动态效果、供应商顺序、隐藏、别名和颜色。
- **活动热力图**：配置时区下滚动 370 天日历热力图与 streak（连续活跃天），metric 跟随仪表盘。
- **本地历史**：按 `(session, turn, step)` 投影 DSH usage 事件到 SQLite；重复采样以最新事实替换，不累计放大。
- **成本分析**：用户维护每百万 Token 价格；分别计算 input、output、cache read、cache write，并显示价格覆盖率。插件不会猜测未配置价格。
- **订阅费用账本**：本地记录订阅/充值费用；账户卡片可显示月均与回本倍数（仅货币一致且本月成本可估算时）。
- **趋势与预测**：按时区生成小时/日/周/月桶；预测为有界线性外推，并以虚线和历史数据区分。
- **账户与配额**：内置余额/订阅适配器（含 Volcengine Coding Plan、Z.ai Team、多 profile），统一显示余额、额度窗口、重置时间、陈旧/上次成功状态和健康提醒。
- **本地软提醒**：低配额、每日估算成本、账户异常；提醒不向外发送，也不实施硬阻断。
- **CSV / JSON 导出**：过滤结果、日序列 CSV、打包 JSON；可隐藏会话标识，CSV 自动防御电子表格公式注入；费用账本不进入默认导出。
- **中英文界面**：复用 DSH UI、locale、layout、settings、sidebar 和 slots 服务。

产品调研与设计取舍见 [`docs/research/usage-analytics-landscape.md`](docs/research/usage-analytics-landscape.md)，实现架构见 [`docs/architecture.md`](docs/architecture.md)。

## 要求 / Requirements

- DeepSeek Harness Web，已验证 `@deepseek-ai/dsh 0.1.0-rc.6`
- Node.js `^22.19.0 || >=24.0.0`
- DSH Web 后端保持回环监听；可通过受控的本机 HTTPS 反向代理向已认证私网提供完整 DSH Web，但不要单独暴露插件 API，也不要无认证发布到公网

## 安装 / Installation

优先使用 DSH 插件管理器：

```bash
dsh plugin --profile web add "github:lninghaha/dsh-hub-oauth-gateway"
```

升级和移除：

```bash
dsh plugin --profile web update dsh-hub-oauth-gateway
dsh plugin --profile web remove dsh-hub-oauth-gateway
```

如果当前 DSH 版本没有插件管理器，可使用兼容安装器：

```bash
npx --yes github:lninghaha/dsh-hub-oauth-gateway
npx --yes github:lninghaha/dsh-hub-oauth-gateway --check
```

兼容安装器会原子替换 `~/.dsh/profiles/node_modules/dsh-hub-oauth-gateway`，并幂等维护 `profiles/web/cordis.patch.yml`。包目录和 Cordis patch 会一起备份到最终校验完成；任一步失败都会完整回滚。如果检测到 `dsh.profile.bundles` 已注册本插件，或 web profile 清单无法严格解析，它会拒绝修改并要求改用插件管理器，避免 bundle 与手工 Cordis entry 重复挂载。

安装或升级后需要由用户自行选择时机重启 Web：

```bash
dsh-web restart
```

等价命令：

```bash
systemctl --user restart dsh-web.service
```

然后刷新 `http://127.0.0.1:3080`。插件开发或安装工具不会主动重启 DSH Web。

## 使用 / Usage

1. 点击侧栏底部的 Usage Center，打开 Quick Peek。
2. 进入 Full Dashboard 后用顶部页签切换概览 / 趋势 / 账户 / 明细，并选择时间范围、指标和 provider/model 维度。
3. 点击刷新按钮才会立即重新投影用量并刷新账户；普通 GET 只读取本地快照，不触发带凭据的上游请求。
4. 在 **Settings → Usage Center** 用顶部页签调整显示、供应商、费用与凭据/价格。
5. 成本始终标记为估算值；关注 coverage 百分比，避免把未定价 Token 当作零成本。

## 运行配置 / Runtime configuration

在现有 `dsh-hub-oauth-gateway` Cordis entry 下合并 `config`，不要新增第二个 entry：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: usage-stats
      name: dsh-hub-oauth-gateway
      config:
        refresh:
          usageSeconds: 30
          accountMinutes: 5
          accountConcurrency: 3
          timeoutMs: 15000
        retention:
          usageDays: 730
          accountSnapshotDays: 180
          preserveDeletedSessions: true
        pricing:
          baseCurrency: USD
        accounts:
          monitors: {}
        # 可选。只填你自己控制或明确信任的 GitHub OAuth App 公共 client ID。
        oauthDevice:
          copilotClientId: YOUR_PUBLIC_OAUTH_CLIENT_ID
```

完整字段、monitor 示例与网络策略见 [`docs/configuration.md`](docs/configuration.md)。

### v0.3 配置兼容

旧版根级 `config.monitors` 会自动映射到 `config.accounts.monitors`：

```yaml
config:
  monitors:
    relay-a:
      adapter: new-api
      credentialRef: RELAY_A_TOKEN
```

不能同时配置 `accounts` 和旧 `monitors`。建议迁移到新命名空间，以便后续扩展。

## 价格配置 / Pricing

Settings 支持导入数组或 `{ "rules": [...] }`。模式只支持字面文本和 `*` 通配符；更具体的用户规则优先于导入规则，较新的 `effectiveFrom` 再优先。

```json
{
  "rules": [
    {
      "id": "example-provider-model-2025",
      "providerPattern": "example-provider",
      "modelPattern": "example-model*",
      "effectiveFrom": 0,
      "currency": "USD",
      "inputPerMillion": 1.0,
      "outputPerMillion": 2.0,
      "cacheReadPerMillion": 0.1,
      "cacheWritePerMillion": null
    }
  ]
}
```

`null` 表示该 Token 类别未定价，而不是免费。内置价格表默认为空，因为供应商价格会变化；请以供应商官方价格页为准并显式导入。

## 凭据 / Credentials

- 凭据通过 DSH credential seam 存储；服务端只接受当前 provider 配置实际引用的凭据名，以及受支持的本地导入/OAuth 引用。
- 浏览器只收到 `configured/source/writable` 元数据，永远收不到值。
- 可导入 Claude、Codex、Gemini、Grok、Amp 的本地 CLI 凭据；响应和日志不会暴露本地路径。
- Copilot 设备流把 device code 保留在服务端短期内存中；浏览器只持有随机 flow ID。项目不内置来源不明的第三方 OAuth client ID，启用前必须配置自己的公共 client ID。
- 不要把真实 key、cookie、token 或 credential 文件内容提交到 Git、issue、文档或聊天。

## 数据、迁移与回滚 / Data and migration

主数据库：

```text
${DSH_HOME:-~/.dsh}/storages/usage-stats-v1.sqlite
```

打开已有文件时先识别库归属和 schema，确认后再把数据库目录修复为 `0700`、主文件修复为 `0600`，并启用 WAL。默认保留 730 天 usage facts 和 180 天账户快照。

首次启动会：

1. 先投影当前 DSH session inventory；单个损坏会话不会阻断其他会话。
2. 导入旧 `usage-stats-prefs.json`。
3. 仅为当前 inventory 中不存在的 session 导入旧 `usage-stats-cache.json`，避免重复计算。
4. 失败的 usage 迁移会在下一次成功的投影同步时重试；旧文件不会删除或改写。

详见 [`docs/migration-v1.md`](docs/migration-v1.md)。1.0 移除了旧的内部 JavaScript 子路径导出（`./usage`、`./oauth-device`）；稳定集成面是根 Cordis 插件、`./client` 和版本化 HTTP API。

## 隐私与安全 / Privacy and security

- API 始终校验回环 peer socket 与回环后端 Host；写请求还必须是 JSON。直接访问时，浏览器上下文与客户端 target authority 必须匹配后端。经本机反向代理访问时，仅信任回环请求携带的单值 `X-Forwarded-Host`/`X-Forwarded-Proto`，并要求 `x-dsh-hub-oauth-gateway: 1` 与客户端 target authority 精确匹配该浏览器侧 origin；代理重写后的本地 Origin 和仍为公开 HTTPS origin 的 Referer 都可被一致校验。任何异常、重复或与后端/forwarded origin 均不匹配的上下文仍拒绝，且自定义 header 会强制真正的跨源浏览器先通过本 API 不允许的 CORS preflight。
- 所有普通 GET 只读本地快照；带凭据的刷新仅允许显式 POST。
- monitor 默认 HTTPS、禁止 URL 内嵌凭据、手动处理 redirect、限制响应大小，并在连接前校验全部 DNS 结果。
- 内置适配器默认只能把 provider 凭据发送到 provider 原始 origin。`usageBaseURL` 跨 origin 必须显式 `allowCrossOrigin: true`。
- 私网和 HTTP 分别需要 `allowPrivateNetwork` / `allowInsecure`；除非完全理解风险，否则不要开启。
- SQLite 不保存 credential、prompt、response、cwd 或 provider 原始响应。会话标识默认在 API/UI 中匿名化，导出还可强制 redact。
- 统计和价格估算不等于供应商账单；账户 API 与本地 usage event 可能有不同延迟和计费口径。
- 仅监测你拥有或获授权使用的账户与 endpoint；不支持凭据共享、批量账号运营、额度转售、付费限制绕过、客户端冒充或未授权监测。

安全报告与威胁模型见 [`SECURITY.md`](SECURITY.md)。

## 开发与贡献 / Development and contributing

在 Cursor Cloud / 开发工作区直接用仓库声明的 Node.js 与 pnpm 验证即可；**不再强制 Docker sandbox**。插件冒烟请使用隔离的 `DSH_HOME` 安装 DeepSeek Harness，勿读写个人真实 profile 或凭据。

快速门禁：

```bash
pnpm install --frozen-lockfile
pnpm run check:next
```

交付门禁：

```bash
pnpm run check
npm pack --dry-run --json --ignore-scripts
```

可选 DSH 冒烟（隔离目录）：

```bash
export DSH_HOME=/tmp/dsh-verify-$USER
# install @deepseek-ai/dsh, then add this plugin and start web
dsh plugin --profile web add "$PWD"
dsh web --host 127.0.0.1 --port 3080
```

测试覆盖 SQLite、投影、迁移、时区/DST、价格、预测、账户 transport、SSRF/DNS pinning、API/CSRF、凭据、导出、安装器、server bundle、client bundle 和 React 组件。

公开文档：

- [配置参考](docs/configuration.md) · [架构](docs/architecture.md) · [1.0 迁移](docs/migration-v1.md)
- [变更记录](CHANGELOG.md) · [贡献指南](CONTRIBUTING.md) · [项目规则](docs/00-project-rules.md)
- [行为准则](CODE_OF_CONDUCT.md) · [安全策略](SECURITY.md)

欢迎经过脱敏的 bug report、文档、测试和 PR。不要在 issue、PR、截图或日志中提交真实凭据、账户/会话数据、prompt/response、上游原始响应或本机路径。

## License

[MIT](LICENSE) · Independent community project; no vendor endorsement is implied.
