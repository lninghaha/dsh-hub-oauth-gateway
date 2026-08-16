# 项目协作规则

## DSH Web 服务重启

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
