# AIRI Companion Bridge 与轻量反应设计

## 目标

为 AIRI Pet 增加可被 Neko 或其他本机应用复用的通用连接桥。外部应用发送业务语义和最终展示文本，AIRI 根据当前模型能力组合字幕、动作和未来语音。

第一阶段只追求稳定、自然、低打扰：复用 AIRI 现有独立字幕窗口，每次反应最多播放一个 Live2D 动作，并为语音保留位置。它不是通用工作流引擎，也不负责复杂舞台演出。

## 产品边界

- Neko 只有 Hub 是当前产品设计基线。旧 Companion、气泡、贴纸和动作调度不作为 AIRI 的参考实现或离线兜底。
- AIRI 是桌宠表现能力的唯一宿主。字幕、模型动作、未来语音和嘴部动画都在 AIRI 架构内实现或扩展。
- Neko 是首个消息来源，不是协议所有者。其他本机项目可以使用相同协议连接 AIRI。
- AIRI 未安装、未启动或断开时，来源应用继续独立运行；业务状态留在来源应用自身界面，不退回 Neko 旧表现层。
- 第一阶段不恢复聊天、听觉、MCP、Godot、Artistry、BeatSync 或本地推理预加载。

## 架构

```text
Neko / 其他本机应用
        ↓
来源适配器：业务事件 → 通用 CompanionEvent
        ↓
AIRI channel-server / plugin-protocol / server-sdk
        ↓
ReactionResolver：语义事件 → AIRI 反应配方
        ↓
ReactionScheduler：优先级、打断、去重、过期
        ↓
ReactionPlayer：字幕 + 单个模型动作 + 预留语音
        ↓
模型能力档案：语义动作 → 当前模型真实动作
```

各层职责保持独立：

- 来源适配器只理解来源应用的业务，不知道 Live2D 动作名。
- 通信层只负责认证、传输、重连、能力协商和回执。
- 反应策略只处理语义与配方，不直接操作渲染器。
- 播放器只执行已经解析好的轻量反应。
- 模型能力档案隔离 Hiyori Pro、其他 Live2D、VRM 和 Spine 的差异。

## 通信边界

### 传输

- 恢复并复用 AIRI 现有 `channel-server`、`@proj-airi/server-sdk`、`@proj-airi/plugin-protocol` 和 `server-runtime`。
- 不创建第二套 WebSocket 服务或 Neko 私有消息格式。
- AIRI 在桥接开启时拥有服务端生命周期，默认监听 `127.0.0.1:6121`；来源应用作为客户端连接。
- 当前桥接阶段双方可以独立启动；后续允许 Neko 在用户明确开启“启用 AIRI 桌宠”后启动已安装的 AIRI，但不负责安装、下载或更新 AIRI。
- “插件”采用可选外部 Companion 包的形式：Neko 只持有启动管理和通用桥接适配器，不嵌入 AIRI Electron 代码。没有 AIRI 包时，Neko Core 仍完整运行；有 AIRI 包但未启用时，也不启动桌宠。
- 使用现有 SDK 的断线重连能力。重连后重新交换能力，不恢复已经过期的反应。
- 本地发现信息包含协议版本、端点和连接令牌，写入 AIRI 用户数据目录并限制为当前用户可读。固定端口被占用时由发现信息提供实际端口。
- 连接令牌用于阻止网页或无关本地进程直接向回环端口注入消息；第一阶段不开放局域网访问。

### 协议事件

在现有协议包中增加通用 Companion 事件，不把确定性表现塞进依赖 LLM 的 `spark:notify` 反应链：

```ts
interface CompanionEvent {
  id: string
  source: string
  topic: string
  intent: 'info' | 'success' | 'warning' | 'error' | 'reminder'
  priority: 'critical' | 'high' | 'normal' | 'low'
  text: string
  reactionHint?: string
  coalesceKey?: string
  ttlMs?: number
  createdAt: number
}
```

字段含义：

- `topic` 保存来源领域语义，例如 `task.completed`、`device.disconnected`、`reminder.water`；AIRI 不枚举所有项目的业务事件。
- `intent` 是稳定的跨项目表现语义。
- `text` 是来源应用准备好的最终展示文本。基础显示不依赖 AIRI 的 AI 或聊天能力。
- `reactionHint` 只允许请求 AIRI 已登记的命名配方，不允许外部发送 Live2D 文件名或自由动作脚本。
- `coalesceKey` 用于替换还未执行的同类消息。
- `ttlMs` 控制消息在队列中还能等待多久，默认 30 秒。

来源应用不得发送原始 Rust command、完整流水线链接、文件路径、后端堆栈或高频底层进度。精确业务信息继续留在来源应用中。

### 能力协商

AIRI 连接后报告当前能力：

```text
caption: available
motion.live2d: available / unavailable
voice: unavailable（第一阶段预留）
commands: 当前允许的白名单
```

来源应用不根据模型格式做分支，只根据通用能力决定是否发送可选提示。

### 回执

- `accepted`：事件通过验证并进入队列。
- `completed`：ReactionPlayer 已结束当前反应，模型动作已完成或取消清理完毕。
- `dropped`：事件过期、无效、被同类新事件替换或没有可用表现能力。

回执包含原事件 `id` 和必要的结果原因，不返回具体模型动作名。协议按 at-least-once 处理，`id` 负责幂等去重。

## 文本载体

第一阶段复用 AIRI 现有独立 Caption 窗口：透明、无边框、始终置顶，可跟随桌宠窗口，也可解除跟随后独立移动。现有窗口通过 `BroadcastChannel` 接收文本，使用 `PoppinText` 动画，并让每条字幕独立过期。

桥接反应新增独立的通知字幕来源，不复用语音流的 `caption-assistant` 累加语义：

- 同一时间只显示一条桥接通知。
- 新反应开始时替换上一条桥接通知，不与语音分段拼接。
- 默认显示 10 秒；下一条反应可以提前替换。
- 紧急反应打断当前反应时同时清除当前桥接通知。
- 语音字幕和桥接通知使用独立条目，互不清空。

这里的“弹幕”是独立悬浮字幕，不是横向滚动文本，也不是角色旁边的对话气泡。

## 轻量反应模型

一个反应只有三个可选通道：

```text
字幕：显示 / 不显示
动作：无 / 随机动作 / 语义动作
语音：关闭（预留文本和能力位）
```

第一阶段规则：

- 每个反应最多执行一个模型动作。
- 字幕和动作同时开始。
- 当前反应至少占用播放器 3 秒；有动作时等待动作自然结束。下一条反应开始后可以替换仍在显示的字幕。
- 动作自然结束后回到模型原有待机状态。
- 不实现多段动作、动作时间轴、拍手收尾或外部自由编排。
- 语义动作缺失时降级为随机动作；没有安全随机动作时降级为仅字幕。
- `caption-only`、`caption-random`、`caption-neutral`、`caption-happy`、`caption-sad` 是第一批内部命名配方。

默认语义映射：

| 事件意图 | 默认配方 |
|---|---|
| `info` | `caption-neutral` |
| `success` | `caption-happy` |
| `warning` | `caption-neutral` |
| `error` | `caption-sad` |
| `reminder` | `caption-neutral` |

`caption-random` 只用于明确选择随机表现的低风险、环境类消息，不用于成功、失败等已有语义的业务事件，避免文字和动作含义相反。

## Hiyori Pro 测试能力档案

第一阶段以项目内置 `Hiyori (Pro)` 为测试模型。用户已实际查看并确认以下动作语义：

| 语义 | Live2D 动作组 | 索引 | 资源文件 |
|---|---:|---:|---|
| 开心 | `Tap` | `1` | `motion/hiyori_m08.motion3.json` |
| 难过 | `Flick@Body` | `0` | `motion/hiyori_m10.motion3.json` |
| 中性 | `Flick` | `0` | `motion/hiyori_m03.motion3.json` |

这三个动作同时构成第一阶段允许使用的随机动作池。随机配方只在环境类消息中使用，并避免连续两次选择同一动作。原有三个 `Idle` 动作幅度太小，不进入反应动作池。

动作映射保存在 AIRI 的模型能力档案中，不修改模型压缩包，也不把资源文件名暴露给外部应用。以后新增模型时建立独立档案；缺少档案的模型仍可显示字幕。

## 调度规则

ReactionScheduler 同时只播放一个反应：

| 优先级 | 行为 |
|---|---|
| `critical` | 立即打断任何可打断反应，清理其字幕和动作后执行 |
| `high` | 可以打断 `low`，其他情况排在当前反应之后 |
| `normal` | 按进入顺序执行 |
| `low` | 只在队列和播放器空闲时执行，过期直接丢弃 |

补充规则：

- 相同 `coalesceKey` 的待执行事件只保留最新一条，被替换事件返回 `dropped`，原因为 `superseded`。
- 相同 `id` 只执行一次；重复发送返回该事件已经记录的 `accepted` 或 `completed` 状态，不再次入队。
- 默认队列有效期为 30 秒，来源可以缩短或延长。
- 打断通过可取消执行上下文完成；播放器必须在结束路径中恢复模型待机状态。
- 反应进入下一项时可以替换上一条仍在显示的桥接字幕，不等待完整 10 秒。
- 语音以后接入时复用同一个反应任务和取消信号，不建立第二条独立队列。

## 来源适配

Neko 首批只接有明确生命周期价值的节点：任务完成、任务失败、任务取消、安装完成、设备断开、蓝盾解析完成/失败和提醒到期。精确进度、原始日志、文件列表和调试信息只留在 Hub。

Neko 适配器负责把真实 Rust/Tauri 事件映射为 `CompanionEvent`。它不能直接发送 AIRI 动作名，也不能调用任意 AIRI 内部命令。

其他项目接入时只需实现相同的来源适配器。新增 Neko 功能通常只增加 `topic` 映射，不修改传输层、调度器或模型档案。

## AIRI 到来源应用的命令

第一阶段只保留最小白名单，例如打开来源应用、打开指定页面和查看任务。命令请求必须携带命令 ID、目标来源和关联事件 ID；来源应用自行决定是否允许执行。

不允许 AIRI 传递任意 Rust command、shell 命令、文件路径或未登记参数。命令能力通过连接握手声明，未声明的命令直接拒绝。

## 生命周期和失败处理

- AIRI 启动且桥接开启：启动 channel-server、写入发现信息、等待客户端。
- AIRI 退出或桥接关闭：停止监听、注销处理器、取消当前反应并清理发现信息。
- 来源应用启动：读取发现信息并连接；没有发现 AIRI 时保持业务正常，不持续弹错误。
- 连接中断：客户端按 SDK 策略重连；AIRI 清理该连接的未完成请求，但保留来自其他来源的队列项。
- Neko 启动管理器（下一阶段）：仅在用户开关开启且已配置 AIRI 可执行文件时启动 AIRI；启动失败只反馈 Companion 不可用，不影响 Neko Core。关闭 Neko 时默认不强制关闭用户手动启动的 AIRI。
- 模型切换：取消当前模型动作、保留仍有效的字幕，并重新发布能力。
- 设置窗口或其他对话框打开不停止桥接；只要桌宠舞台存在，反应继续执行。

## 第一阶段验收

### 单元与契约测试

- 协议类型验证：合法事件、未知字段、非法优先级和缺失文本。
- 调度器：顺序、打断、合并、幂等、过期和取消清理。
- 反应解析：五种意图、命名配方、语义降级和字幕降级。
- Hiyori Pro 档案：开心、难过、中性映射到用户确认的三个动作。
- Caption 通知来源：替换上一条通知，不影响语音字幕。
- 生命周期：开启、关闭、重连和模型切换时不遗留计时器、监听器或动作。

### 真实联调

第一个端到端样例使用 Neko 任务完成事件：

1. Neko 发送 `success` 事件和最终文本。
2. AIRI 返回 `accepted`。
3. 独立字幕窗口显示文本，同时播放 `hiyori_m08.motion3.json`。
4. 动作结束后恢复待机，AIRI 返回 `completed`。
5. 关闭 AIRI 后重复触发，Neko 任务仍正常完成且不调用旧气泡或贴纸。

必须在真实 Electron AIRI 与真实 Tauri Neko 环境中完成联调；浏览器 Mock 只能用于组件检查。

## 后续范围

以下内容不进入第一阶段：

- TTS、语音播放、嘴部动画和语音队列。
- 自定义反应编辑器和外部自由动作脚本。
- 更多模型的语义档案与自动动作分析。
- AI 润色、AI 选择配方或聊天响应。
- Neko 自动安装、下载和更新 AIRI。
- Neko 启动 AIRI 的可选外部 Companion 管理器（下一阶段，不属于当前桥接联调）。
- 局域网或远程连接。
- 多来源高级权限管理和用户界面。

扩展这些能力时继续沿用同一个 `CompanionEvent → ReactionResolver → ReactionScheduler → ReactionPlayer` 边界，不改变来源应用与具体模型解耦的原则。
