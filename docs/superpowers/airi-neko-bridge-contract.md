# AIRI 与 Neko 桥接预留

更新时间：2026-07-14

本文保留 Pet Lite 裁剪阶段的通信恢复入口。通用桥接、轻量组合反应、队列、Hiyori Pro 动作映射和第一阶段验收以 [`specs/2026-07-14-companion-bridge-reaction-design.md`](specs/2026-07-14-companion-bridge-reaction-design.md) 为准。

正式方案不以 Neko 旧 Companion、气泡或贴纸为表现基线。AIRI 是表现能力宿主，Neko 是首个来源适配器，其他本机应用可以复用同一 Companion Bridge。

## 当前决策

- `channel-server` 只是 Pet Lite 独立运行阶段暂时停用，不是确认移除。
- 不新设计第二套 WebSocket 或私有消息格式。
- 优先复用 `@proj-airi/server-sdk`、`@proj-airi/plugin-protocol` 和现有 `server-runtime`。
- 未来每个来源功能先做“真实业务消息 → 通用 Companion 事件”的映射；来源不能发送具体 Live2D 动作名。
- 连接使用回环地址、连接令牌、能力协商、幂等去重和现有 SDK 断线重连。

## 现有桥接入口

| 方向 | 现有事件 | 预留用途 | 当前判断 |
|---|---|---|---|
| Neko → AIRI | `input:text`、`input:text:voice`、`input:voice` | Neko 把文本或语音消息交给 AIRI 对话入口 | 优先复用；输入事件已有 `chat-ingestion` 消费组语义 |
| 来源应用 → AIRI | 通用 Companion 事件 | 确定性字幕和轻量动作反应 | 在现有协议包中增加类型，不依赖 LLM 反应链 |
| Neko → AIRI | `context:update` | Neko 提供状态、环境或任务上下文 | 只传摘要和引用，不把大对象塞进事件 |
| AIRI → Neko | `spark:command` | AIRI 请求 Neko 执行明确动作或状态变化 | 优先复用；必须有目标、命令 ID 和能力检查 |
| AIRI → Neko | `spark:emit` | AIRI/Neko 回报执行中、完成或失败状态 | 用于进度、确认和结果，不假设 exactly-once |
| AIRI → Neko | `output:gen-ai:chat:message`、`output:gen-ai:chat:complete` | AIRI 将对话输出同步回 Neko | 接入聊天后再确认是否需要完整流式输出 |
| 双向/控制面 | `ui:configure` | 同步 UI 或模块配置变化 | 仅在 Neko 确实需要控制 AIRI UI 时启用 |

## 恢复路径

恢复 Neko 通信时按这个顺序做：

1. 打开 `apps/stage-tamagotchi/src/shared/pet-lite-features.ts` 的 `channelServer`，恢复主进程服务生命周期。
2. 恢复 `apps/stage-tamagotchi/src/main/windows/shared/window.ts` 的连接 IPC，以及 `packages/stage-ui` 的 channel client/context bridge。
3. 实现通用 Companion 事件、ReactionResolver、ReactionScheduler、ReactionPlayer 和模型能力档案。
4. 用 Neko 的真实消息逐项填写来源映射，再补共享协议类型测试、断线测试和真实 Electron/Neko 联调；不以浏览器 Mock 代替联调。

当前独立 Pet Lite 不启动 WebSocket、不注册连接 IPC，也不初始化渲染端自动重连，但上述源码、依赖和恢复入口都保留。

## 已确定边界

- AIRI 拥有桥接服务端和表现队列；来源应用拥有自身业务和任务状态。
- 第一阶段使用 AIRI 独立字幕窗口、单个语义动作和预留语音位。
- 来源应用发送最终文本和通用语义，AIRI 负责解析具体表现。
- 第一阶段只监听回环地址，不开放局域网，不由 Neko 自动启动 AIRI。
- 回执只包含 `accepted`、`completed` 和 `dropped`。
