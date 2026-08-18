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

## 3. Docker sandbox 强制规则

- **插件开发过程中禁止本机测试。** 宿主机不得直接执行任何项目代码、依赖安装、lint、类型检查、构建、测试、安装器或打包检查，包括但不限于：
  - `node` / `npm` / `npx` / `pnpm`；
  - `tsc` / `vitest` / `biome`；
  - `scripts/*.mjs`、`build/*.mjs`、`npm pack` 或插件安装命令。
- 宿主机只允许进行文件查看/编辑、只读 Git 检查以及 Docker 生命周期操作。不得把宿主机已有的 `node_modules`、`.next` 或其他项目产物当作验证依据。
- 所有 lint、类型检查、构建、测试、安装器回归和打包检查只能在一次性 Docker sandbox 中运行。仓库没有现成 sandbox 配置时，不得回退到本机执行；应先向用户说明“尚未验证”，并在获得同意后再补充临时或项目级 Docker 方案。
- Docker sandbox 必须满足：
  - 使用仓库声明的 Node.js 与包管理器版本；
  - 源码通过隔离的 build context / `COPY` 进入容器，测试不得回写宿主仓库；
  - 不挂载 `$HOME`、真实 DSH profile、credential 文件、其他项目目录或 Docker socket；
  - 不使用 `--network=host`、`--privileged`、宿主端口映射或宿主 PID/IPC namespace；
  - `DSH_HOME`、数据库、缓存和临时文件全部位于容器临时目录；
  - 仅依赖安装阶段可按需联网；执行项目代码和测试时应禁网，且不得访问真实 provider；
  - 测试数据使用 mock、脱敏 fixture 和临时目录，不读取任何本地 CLI 登录状态或真实凭据。
- 容器内的标准验证顺序：
  1. 锁文件安装（例如 `pnpm install --frozen-lockfile`）；
  2. 快速开发门禁 `pnpm run check:next`；
  3. 交付前完整门禁 `pnpm run check`；
  4. 发布前在容器内检查 `npm pack --dry-run --json --ignore-scripts` 的完整清单。
- 生成的 `lib/` 必须在容器内由 `src/` 重建，再显式导出到宿主机的已忽略临时目录，经审阅后替换；不得手改 `lib/`，也不得让测试容器直接写宿主 `lib/`。
- 反馈验证结果时必须说明所用镜像/Node 版本、容器内命令和结果。没有在 Docker sandbox 中执行的检查一律不得声称“已通过”。

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
- `lib/` 可复现、文档同步、完整 Docker 门禁和 npm 打包清单审阅是发布前置条件。

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

## Cursor Cloud specific instructions

> 本段面向 Cursor Cloud Agent 环境。update script 已在开机时把 Docker 守护进程幂等拉起，这里只记录非显而易见的启动/运行注意事项。

- **没有可独立运行的「应用」**：本仓库是 DSH（DeepSeek Harness Web）的一个 Cordis 服务端插件 + 一个 classic-script 客户端注册，Cloud VM 内没有 DSH Web 可供启动/登录。这里的「运行环境」就是第 3 节的 Docker sandbox 验证流水线；「跑通」的标准是 `check` / `verify` 门禁通过。Cloud 环境同样遵守第 7 节：不得主动重启 DSH Web。
- **所有 lint / 类型检查 / 构建 / 测试仍只在 Docker sandbox 内运行**（见第 3 节与 `CONTRIBUTING.md`）。宿主机虽然预装了 Node/pnpm，但按项目规则禁止用它们验证项目代码。命令不要重复抄写，直接用仓库已文档化的：
  - 快速门禁：`sudo docker build --target check --build-arg NODE_VERSION=22.19.0 --tag dsh-hub-oauth-gateway-sandbox:check .`（biome + tsc + next 构建 + vitest）。
  - 完整交付门禁（等价 CI，含 `lib/` 逐文件可复现性比较）：`sudo docker build --target verify --build-arg NODE_VERSION=22.19.0 .`；受支持的第二条 Node 线用 `--build-arg NODE_VERSION=24`。
- **Docker 命令需要 `sudo`**：当前 Cloud VM 未把 `ubuntu` 用户加入 `docker` 组，直接 `docker ...` 会因权限失败；用 `sudo docker ...`。
- **Docker 29 + fuse-overlayfs 的坑**：`/etc/docker/daemon.json` 必须同时设 `"storage-driver": "fuse-overlayfs"` 且 `"features": { "containerd-snapshotter": false }`，否则 Firecracker 内核下 overlay2/containerd-snapshotter 无法工作、`docker build` 会失败。该文件已随快照保留。
- **守护进程不随快照持久**：Docker 引擎（apt 包）会保留在快照里，但 `dockerd` 是进程、每次开机需要重新拉起。若 `sudo docker info` 报连接失败，说明守护进程没起来；update script 会自动拉起，手动补救可执行 `sudo sh -c 'nohup dockerd >/var/log/dockerd.log 2>&1 &'` 并等待 `sudo docker info` 就绪。
- **改依赖后不要在宿主机装包**：按第 4 节，锁文件通过 Docker `lockfile` target 重新导出；`lib/` 通过 `artifacts` target 重建并审阅后替换，绝不手改。
