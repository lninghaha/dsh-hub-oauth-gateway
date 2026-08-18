# 项目协作规则

> 本文件是本仓库 Agent 的项目规则。开始工作前必须阅读；与一般习惯冲突时，以本文件中更严格的隐私、隔离和数据保护要求为准。

## 1. 工作区与 Git 边界

- 开始和结束时检查 `git status`，识别并保留用户已有修改；不得回滚、覆盖、暂存或格式化无关文件。
- 禁止使用 `git reset --hard`、`git clean -fdx`、强制推送等破坏性命令。
- 未经用户明确要求，不得执行 `git commit`、`git push`、创建或移动 tag、创建 GitHub Release、`npm publish` 等外部写操作。
- **`npm publish` 一律由用户在云终端执行**（需 OTP / 2FA）。Agent **不得**代跑 `npm publish`；发版时须给出可复制的完整命令（含 nvm Node 切换），由用户粘贴执行。
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

## 3. 云环境验证（主路径）

本项目**不再要求** Docker sandbox 作为交付/发版前置验证。Agent 与贡献者在 **Cursor Cloud / 本仓库云开发环境** 内直接安装依赖、跑门禁，并安装 DeepSeek Harness（DSH）做插件冒烟验证。

### 3.1 允许在云环境执行

在云 Agent 工作区（隔离机器）上可以直接使用：

- `node` / `npm` / `npx` / `pnpm`（版本对齐 `package.json` / `packageManager`）；
  - **必须**使用 Node `^22.19.0 || >=24`（见 `.nvmrc`）。云环境若 PATH 上先出现 `/exec-daemon/node`（常为 22.14），会出现 `Unsupported engine` 警告；请先 `nvm use` / 把 nvm 的 bin 放到 PATH 最前，再跑脚本。
  - 门禁脚本会先跑 `pnpm run assert:node`，版本不合规直接失败。
- `tsc` / `vitest` / `biome`、`scripts/*.mjs`、`build/*.mjs`、`npm pack --dry-run`；
- 安装 `@deepseek-ai/dsh`、向隔离 profile 安装本插件、启动 `dsh web` 做 UI/API 冒烟。

推荐顺序：

1. `pnpm install --frozen-lockfile`（或仓库约定的锁文件安装）；
2. 快速门禁 `pnpm run check:next`；
3. 交付门禁 `pnpm run check`（含重建/校验 `lib/` 时按 `package.json` scripts）；
4. 发布前 `npm pack --dry-run --json --ignore-scripts` 审阅清单；
5. **DSH 冒烟**：隔离 `DSH_HOME`（例如 `/tmp/dsh-verify-*` 或云工作区下的独立目录）安装 DSH → `dsh plugin --profile web add <本仓库路径>` → 启动 `dsh web` → 检查 `http://127.0.0.1:3080` 与 Usage Center 是否加载。面向最终用户的安装优先使用 npm 包名 `dsh-hub-oauth-gateway`（见 [`README.md`](README.md)）。

### 3.2 隔离与隐私（仍强制）

- 验证用 `DSH_HOME` 必须与操作者真实本机 profile 分离；不得读取或写入真实凭据、生产 SQLite、其他项目目录。
- 自动化测试仍使用 mock / 脱敏 fixture；不得依赖真实 provider、真实 API key 或现网账户。
- 不得把云环境里的真实 token、cookie、session、绝对私有路径写进 Git、PR、截图或公开日志。
- 声称“已通过”时须说明：Node/pnpm 版本、执行的命令，以及是否完成 DSH 冒烟（URL / 侧栏 Usage Center 等可观察结果）。

### 3.3 Docker（可选）

- 仓库可保留 `Dockerfile` 供 CI 或偏好容器复现的贡献者使用，**不是** Agent 交付前置条件。
- 不得在未获用户要求时借机大改 Docker/CI 仅“为了恢复强制 sandbox”。

### 3.4 `lib/` 产物

- `src/` 是运行时唯一源；`lib/` 是提交到 Git 的生成产物，不得手改。
- 运行时变更须在云环境由 `src/` 重建 `lib/` 并审阅 diff 后提交。

## 4. 源码、依赖与产物

- `src/` 是运行时代码的唯一源文件；`lib/` 是提交到 Git 且随包发布的生成产物。
- 依赖变更必须同步更新 `package.json` 与 `pnpm-lock.yaml`，统一使用 pnpm，不得重新引入 `package-lock.json` 或混用包管理器。
- `.next/`、`output/`、coverage、`*.tsbuildinfo`、Docker 临时产物和本地数据库均为可重建/本地状态，不得提交。
- `package.json#files` 应保持明确、最小的发布白名单；不得把测试、私有调查、数据库、凭据、缓存或参考仓库带入 npm 包。
- 保持当前 DSH 插件形态：一个 Cordis 服务端插件和一个 classic-script 客户端注册；不得启动第二个 Web 服务或接管宿主 root。

## 5. 变更、兼容性与文档

- 修复优先增加回归测试；安全边界变化必须包含负向/对抗测试。测试不得依赖真实 provider、真实凭据、现有个人 DSH profile 或未隔离的生产 Web。
- 可观察行为、配置、API、安装方式、数据迁移或安全边界变化时，同步更新相关 README、公开文档与迁移说明。
- 用户可见文案同时维护中文和英文；避免文档宣称尚未实现或无法验证的能力。
- 版本遵循 SemVer：兼容修复为 patch，兼容新能力为 minor，破坏公开 export、配置、API、存储或安装契约为 major。
- `lib/` 可复现、文档同步、云环境门禁（`check`）与 npm 打包清单审阅、以及隔离 DSH 冒烟是发布前置条件。

## 5.1 发版与 npm（强制）

一次完整发版 **必须** 把同一 SemVer 版本推到公共 npm（`registry.npmjs.org`，`latest` 或约定 dist-tag）。仅打 Git tag / 仅建 GitHub Release **不算**发版完成。

Agent 在用户明确要求发版时的职责：

1. 准备版本：`CHANGELOG` 从 Unreleased 移入目标版本、`package.json` / `lib` banner / `build/verify-release.mjs` 等版本元数据一致。
2. **发版阶段及时更新相关文档**：安装说明（README / migration）、规则与贡献指南中与版本或安装契约相关的段落、用户可见中英文文案；不得把文档拖到发版之后再补。
3. 云环境跑通 `pnpm run check` 与 `pnpm run release:inspect`（Node 须满足 `.nvmrc` / engines）。
4. 在获准后：提交、推送、`v<version>` annotated tag、GitHub Release（changelog 摘要）。
5. **向用户给出云终端 npm 发布命令**（须先切到 nvm Node，避免 `/exec-daemon/node` 22.14），例如：

   ```bash
   cd /workspace
   export NVM_DIR="$HOME/.nvm"
   . "$NVM_DIR/nvm.sh"
   nvm use --delete-prefix $(cat .nvmrc) --silent
   export PATH="$NVM_DIR/versions/node/v$(cat .nvmrc)/bin:$PATH"
   hash -r
   node -v
   git checkout main && git pull origin main
   npm whoami
   npm publish --access public --otp=<6位验证码>
   npm view dsh-hub-oauth-gateway version
   ```

6. 用户执行后，Agent 用 `npm view` 核对 registry 版本与 tag / `package.json` 一致，并在回复中确认；不一致则不得声称发版完成。

## 6. 安全不变量

- 不得削弱回环 peer、回环 `Host`、同源/请求上下文、自定义请求头、JSON 写请求和请求大小限制等本地 API 防护。
- 普通 GET 只读取本地快照；带凭据的上游刷新保持显式 mutation 或后台调度，不因打开页面而触发。
- 凭据只能通过集中 transport 发往通过协议、origin、DNS 与私网策略校验的目标；redirect、超时和响应大小继续受控。
- SQLite、API、日志和导出默认不得包含凭据、prompt/response、cwd、本地 credential 路径或 provider 原始响应。
- 发现疑似漏洞或秘密泄露时立即停止扩散，不在公开渠道粘贴细节，并按 `SECURITY.md` 处理。

## 7. DSH Web 启动与重启

- **云 Agent 隔离实例**：为冒烟验证，Agent **可以**在隔离 `DSH_HOME` 下安装/启动/重启 `dsh web`（含 `dsh-web restart` 等价操作），只要不触碰操作者个人机器上的真实 profile 或用户未授权的服务。
- **操作者本机 / 共享 `dsh-web.service`**：Agent **不得擅自**重启用户正在使用的本机或会话所依赖的 DSH Web；安装或代码变更后应提示用户自行选择时机执行：

  ```bash
  dsh-web restart
  ```

  等价命令：

  ```bash
  systemctl --user restart dsh-web.service
  ```

- 对用户本机实例，Agent 应明确提示“尚未重启，当前运行实例仍使用旧代码”，除非用户明确要求代为重启。
- 用户完成重启并明确要求检查后，Agent 可以执行只读状态、HTTP、bundle 和 API 健康检查。
