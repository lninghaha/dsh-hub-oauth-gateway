# 项目协作规则

> 本文件是本仓库 Agent 的项目规则。开始工作前必须阅读；与一般习惯冲突时，以本文件中更严格的隐私、隔离和数据保护要求为准。

## 1. 工作区与 Git 边界

- 开始和结束时检查 `git status`，识别并保留用户已有修改；不得回滚、覆盖、暂存或格式化无关文件。
- 禁止使用 `git reset --hard`、`git clean -fdx`、强制推送等破坏性命令。
- 未经用户明确要求，不得执行 `git commit`、`git push`、创建或移动 tag、创建 GitHub Release、`npm publish` 等外部写操作。
- 修改范围必须与当前任务直接相关。不要借机新增 CI、模板、发布脚本、Dockerfile、治理文档或重构其他模块；确有必要时先说明并征得用户同意。

## 2. 开源发布与隐私边界

- Git、npm 包、公开文档、issue、PR、截图和日志中不得出现：
  - API key、OAuth token、cookie、密码、私钥、device code 或 credential 文件内容；
  - 真实账户信息、未脱敏 session 标识、prompt/response、工作目录或供应商原始响应；
  - 私有主机名、内网 IP、个人绝对路径、机器专属故障记录或其他项目内容；
  - 生产数据库、导出文件、trace 或包含真实用户数据的 fixture。
- 示例统一使用 `example.com`、`provider-a`、`YOUR_API_KEY`、`${DSH_HOME}` 等公开占位符。脱敏应替换敏感值，而不是只遮住一部分。
- 私人调查与机器专属记录应放在仓库外或已确认被忽略的本地路径中；不得用 `git add -f` 绕过公开/本地边界。
- `.gitignore` 不是安全机制。提交或发布前仍须审阅 diff、staged 内容和实际打包文件清单。
- 新增第三方源码、资产或数据前核对来源、许可证和必要署名；不得复制来源不明或许可证不兼容的实现。
- 本项目是独立社区插件，不得暗示供应商背书；用量和成本只能描述为统计或估算，缺失价格不得当作免费。
- 只支持监测操作者拥有或获授权使用的账户与 endpoint；不得扩展为凭据共享、批量账号运营、额度转售、付费限制绕过、客户端冒充或未授权监测工具。

## 3. 开发与验证环境

- **云开发环境 / 隔离工作区是默认执行面。** Cursor Cloud Agent、专用云 VM 或同等隔离 checkout 中，可以直接安装依赖并运行项目命令，无需再额外套一层 Docker sandbox。允许执行：
  - `node` / `npm` / `npx` / `pnpm`；
  - `tsc` / `vitest` / `biome`；
  - `scripts/*.mjs`、`build/*.mjs`、`npm pack`、本地插件安装与只读健康检查。
- 标准验证顺序（在当前工作区内）：
  1. 锁文件安装（例如 `pnpm install --frozen-lockfile`）；
  2. 快速开发门禁 `pnpm run check:next`；
  3. 交付前完整门禁 `pnpm run check`；
  4. 发布前检查 `npm pack --dry-run --json --ignore-scripts` 的完整清单。
- `lib/` 必须由 `src/` 经仓库构建命令重生后审阅再提交；不得手改 `lib/`。
- 反馈验证结果时必须说明所用 Node / pnpm 版本、实际命令和结果；未执行的检查不得声称“已通过”。
- 测试与本地验证仍须使用 mock、脱敏 fixture 和临时目录；不得读取真实 DSH profile 凭据、生产数据库或访问真实 provider。可用临时 `DSH_HOME` 做安装器回归。
- 仓库内的 `Dockerfile` 与 Docker build target 仅作**可选**的可复现/CI/发布对照门禁，不是日常开发的前置条件。若使用 Docker，仍应避免挂载 `$HOME`、真实凭据、Docker socket，以及 `--network=host` / `--privileged` 等削弱隔离的选项。

## 4. 源码、依赖与产物

- `src/` 是运行时代码的唯一源文件；`lib/` 是提交到 Git 且随包发布的生成产物。
- 依赖变更必须同步更新 `package.json` 与 `pnpm-lock.yaml`，统一使用 pnpm，不得重新引入 `package-lock.json` 或混用包管理器。
- `.next/`、`output/`、coverage、`*.tsbuildinfo`、Docker 临时产物和本地数据库均为可重建/本地状态，不得提交。
- `package.json#files` 应保持明确、最小的发布白名单；不得把测试、私有调查、数据库、凭据、缓存或参考仓库带入 npm 包。
- 保持当前 DSH 插件形态：一个 Cordis 服务端插件和一个 classic-script 客户端注册；不得启动第二个 Web 服务或接管宿主 root。

## 5. 变更、兼容性与文档

- 修复优先增加回归测试；安全边界变化必须包含负向/对抗测试。测试不得依赖真实 provider、真实凭据、现有 DSH profile 或运行中的 DSH Web。
- 可观察行为、配置、API、安装方式、数据迁移或安全边界变化时，同步更新相关 README、公开文档与迁移说明。
- 用户可见文案同时维护中文和英文；避免文档宣称尚未实现或无法验证的能力。
- 版本遵循 SemVer：兼容修复为 patch，兼容新能力为 minor，破坏公开 export、配置、API、存储或安装契约为 major。
- `lib/` 可复现、文档同步、完整门禁（工作区内 `pnpm run check` / `release:inspect`，或可选 Docker `verify`）和 npm 打包清单审阅是发布前置条件。

## 6. 安全不变量

- 不得削弱回环 peer、回环 `Host`、同源/请求上下文、自定义请求头、JSON 写请求和请求大小限制等本地 API 防护。
- 普通 GET 只读取本地快照；带凭据的上游刷新保持显式 mutation 或后台调度，不因打开页面而触发。
- 凭据只能通过集中 transport 发往通过协议、origin、DNS 与私网策略校验的目标；redirect、超时和响应大小继续受控。
- SQLite、API、日志和导出默认不得包含凭据、prompt/response、cwd、本地 credential 路径或 provider 原始响应。
- 发现疑似漏洞或秘密泄露时立即停止扩散，不在公开渠道粘贴细节，并按 `SECURITY.md` 处理。

## 7. DSH Web 服务重启

- Agent **不得主动执行或安排** DSH Web 服务重启，包括但不限于 `dsh-web restart`、`systemctl --user restart dsh-web.service`、延时任务、后台任务或 systemd 临时单元。
- 安装插件或完成需要重载的代码变更后，Agent 只提供以下命令，由用户自行选择时机执行：

  ```bash
  dsh-web restart
  ```

  等价命令：

  ```bash
  systemctl --user restart dsh-web.service
  ```

- Agent 应明确提示“尚未重启，当前运行实例仍使用旧代码”，不得以验证为由代替用户执行重启。
- 用户完成重启并明确要求检查后，Agent 可以执行只读状态、HTTP、bundle 和 API 健康检查。
- 原因：当前开发/对话工作本身可能运行在 `dsh-web.service` 中，主动重启会中断正在进行的工作与会话。
