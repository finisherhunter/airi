# AIRI 与 Neko 桥接预留

更新时间：2026-07-14

这不是已经完成的 Neko 接口契约，而是为了防止 Pet Lite 裁剪时误删未来通信能力而保留的集成边界。真正接入 Neko 前，仍需阅读 Neko 的真实消息来源、指令定义和生命周期，再补充双方确认过的字段。

## 当前决策

- `channel-server` 只是 Pet Lite 独立运行阶段暂时停用，不是确认移除。
- 不新设计第二套 WebSocket 或私有消息格式。
- 优先复用 `@proj-airi/server-sdk`、`@proj-airi/plugin-protocol` 和现有 `server-runtime`。
- 未来每个 Neko 功能先做“真实 Neko 消息/指令 → 已有 AIRI 事件”的映射；只有现有事件表达不了关键业务事实时，才扩展共享协议类型。
- 连接恢复前必须补齐认证、消息来源、权限、幂等/去重和断线重连策略；这些目前不虚构默认值。

## 现有桥接入口

| 方向 | 现有事件 | 预留用途 | 当前判断 |
|---|---|---|---|
| Neko → AIRI | `input:text`、`input:text:voice`、`input:voice` | Neko 把文本或语音消息交给 AIRI 对话入口 | 优先复用；输入事件已有 `chat-ingestion` 消费组语义 |
| Neko → AIRI | `spark:notify` | Neko 通知桌宠发生了需要关注的事件 | 可用于提醒/气泡类事件，需先定义来源和目标 |
| Neko → AIRI | `context:update` | Neko 提供状态、环境或任务上下文 | 只传摘要和引用，不把大对象塞进事件 |
| AIRI → Neko | `spark:command` | AIRI 请求 Neko 执行明确动作或状态变化 | 优先复用；必须有目标、命令 ID 和能力检查 |
| AIRI → Neko | `spark:emit` | AIRI/Neko 回报执行中、完成或失败状态 | 用于进度、确认和结果，不假设 exactly-once |
| AIRI → Neko | `output:gen-ai:chat:message`、`output:gen-ai:chat:complete` | AIRI 将对话输出同步回 Neko | 接入聊天后再确认是否需要完整流式输出 |
| 双向/控制面 | `ui:configure` | 同步 UI 或模块配置变化 | 仅在 Neko 确实需要控制 AIRI UI 时启用 |

## 恢复路径

恢复 Neko 通信时按这个顺序做：

1. 打开 `apps/stage-tamagotchi/src/shared/pet-lite-features.ts` 的 `channelServer`，恢复主进程服务生命周期。
2. 恢复 `apps/stage-tamagotchi/src/main/windows/shared/window.ts` 的连接 IPC，以及 `packages/stage-ui` 的 channel client/context bridge。
3. 用 Neko 的真实消息逐项填写“发送方、接收方、事件、字段、权限、去重键、失败处理”映射表。
4. 为每个映射补共享协议类型测试、断线测试和真实 Electron/Neko 联调；不以浏览器 Mock 代替联调。

当前独立 Pet Lite 不启动 WebSocket、不注册连接 IPC，也不初始化渲染端自动重连，但上述源码、依赖和恢复入口都保留。

## 不能提前假设的部分

- Neko 指令是否直接控制角色动作、窗口行为、通知，还是只传给 AIRI agent。
- Neko 与 AIRI 谁拥有连接、会话和任务状态。
- 关键指令是否需要 ACK、重试、超时、取消或幂等键。
- 本机连接是否只允许回环地址，还是需要局域网访问和认证 token。

