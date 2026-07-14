# AIRI Pet Lite 后台范围清单

更新时间：2026-07-14

这份清单是 AIRI Pet Lite 的后台裁剪记录。它不依赖聊天上下文，后续每次查看或调整模块都要更新这里。

## 状态定义

| 状态 | 含义 |
|---|---|
| 保留 | 普通用户入口和后台实现都需要保留 |
| 隐藏但仍运行 | 普通用户暂时看不到入口，后台尚未删除，避免误删共享依赖 |
| 待审计 | 已决定暂不作为 Pet Lite 功能，但还没有完成启动、依赖和生命周期检查 |
| 可恢复停用 | 已完成依赖审计，后台停止初始化或停止运行，但源码、入口和恢复路径仍保留 |
| 确认移除 | 完成依赖审计、替代路径和回归验证后，才允许停止或删除 |

## 当前清单

| 功能 | 用户入口 | 后台位置/边界 | 当前状态 | 说明 |
|---|---|---|---|---|
| 角色模型与 AIRI Card 导入/切换 | 设置中的模型、角色卡入口；桌宠控制区的角色选择 | `packages/stage-ui/src/stores/modules/airi-card.ts`、模型设置页、主窗口控制区 | 保留 | 这是 Pet 的核心能力，不能因关闭 AI 平台而误删 |
| 外观、场景、窗口行为 | 场景、系统、窗口快捷键、置顶、悬停隐藏、居中等 | `apps/stage-tamagotchi/src/renderer/pages/settings/system/`、主窗口和控制区 | 保留 | 用户已明确要求保留 |
| 通知与确认窗口 | 通知/确认弹窗 | `apps/stage-tamagotchi/src/main/windows/notice/` | 保留 | 后续操作反馈仍然需要 |
| 开发者工具 | 系统设置中的开发者入口、Electron DevTools | `apps/stage-tamagotchi/src/renderer/pages/settings/system/developer.vue`、`src/main/windows/devtools/` | 保留 | 入口可以不打扰普通用户，但实现不能删除 |
| Desktop Overlay | 当前由环境开关控制 | `apps/stage-tamagotchi/src/main/windows/desktop-overlay/` | 待审计 | 本阶段不处理，不能因为暂时不用而移除 |
| AI 服务商/模型连接 | Provider、连接设置、状态岛 | `packages/stage-ui/src/stores/providers.ts`、`settings/providers/`、`settings/connection/`、`src/main/services/airi/channel-server/` | 隐藏但仍运行 | 当前只关闭普通入口；channel-server 是窗口基础 IPC、插件宿主和连接状态共享依赖，暂不裁剪 |
| 聊天窗口 | 桌宠聊天控制、聊天窗口 | `src/main/windows/chat/`、聊天相关 stage store | 可恢复停用 | 主窗口不再注册打开聊天的 IPC，聊天窗口 provider 保留但不接入启动图 |
| 语音、听觉、语音识别/合成 | 麦克风/听觉控制、模块设置 | `packages/stage-ui/src/stores/modules/speech.ts`、`hearing.ts`、模块设置页 | 可恢复停用 | Pet Lite 运行时强制关闭旧配置遗留的麦克风状态；源模块仍保留 |
| 记忆 | 记忆设置和记忆模块 | `settings/memory/`、`packages/stage-ui/src/stores/modules/` 中的 memory 模块 | 隐藏但仍运行 | 先隐藏，后续按启动依赖决定是否停止 |
| MCP、插件和服务通道 | MCP/插件/连接设置 | `src/main/services/airi/mcp-servers/`、`plugins/`、`channel-server/`、`packages/server-*` | 可恢复停用 | MCP 管理器已从 Pet Lite 活动启动图和主/设置窗口 IPC 断开；插件宿主和窗口基础 IPC 仍依赖 channel-server |
| 数据维护/重置 | 数据设置页 | `settings/data/` 及其数据维护组件 | 隐藏但仍运行 | 只在数据设置页主动执行本地存储/文件清理，没有后台常驻服务，暂不删除 |
| 通用设置 | 通用设置页 | `packages/stage-pages/src/components/settings-general-fields.vue`、设置 store | 隐藏但仍运行 | Pet Lite 固定为亮色、简体中文、小图标、关闭分析，不向用户暴露无用选项 |
| 配色方案 | 配色方案页 | `packages/stage-pages/src/pages/settings/system/color-scheme.vue`、`packages/stage-ui/src/stores/settings/theme.ts` | 隐藏但仍运行 | 只调整界面主色相和配色预设，不是亮/暗主题；当前沿用默认配色 |
| 窗口快捷方式 | Window Shortcuts 页面 | `apps/stage-tamagotchi/src/renderer/pages/settings/system/window-shortcuts.vue`、Spotlight shortcut IPC | 可恢复停用 | 全局快捷键服务不再被活动窗口装配；不影响桌宠窗口置顶、拖拽或隐藏 |
| 登录/账户/Welcome | Welcome、账户入口、认证按钮 | `src/main/windows/onboarding/`、`src/main/services/airi/auth.ts` | 隐藏但仍运行 | Welcome 不再自动弹出；认证只在用户主动登录时启动回环服务，页面和代码暂留 |
| Artistry、Spotlight、游戏扩展 | Artistry/Spotlight/Discord/X/Minecraft/Factorio 等入口 | `src/main/services/airi/widgets/artistry-bridge.ts`、`src/main/windows/spotlight/`、`packages/stage-ui/src/stores/modules/` | 可恢复停用 | Artistry bridge 与 Spotlight 不再初始化；插件宿主保留给开发者工具，不归入本次停用 |
| 连接状态诊断岛 | 桌宠窗口中的连接状态/Wi-Fi 指示 | `src/renderer/components/stage-islands/status-island/`、channel server | 隐藏但仍运行 | 当前入口已隐藏；channel-server 本体仍作为共享基础设施运行 |

## 当前实际改动的边界

本阶段已经做的事情只有：

- 设置首页过滤 Provider、Modules、Memory、Connection、Data 入口。
- 隐藏桌宠控制区的聊天、听觉和认证按钮。
- 隐藏开发环境中的连接状态岛。
- 停止自动打开 Welcome 页面。
- 设置窗口和 Welcome 窗口默认隐藏 Electron 的 `File / Edit / View / Window` 菜单。

本阶段新增的后台边界：

- 增加 `petLiteRuntimeFeatures` 作为可恢复停用开关。
- 聊天、Spotlight、全局快捷键和 Artistry bridge 从活动 Electron 装配图断开，源码仍保留。
- 主页面和 App 启动流程会阻止旧配置重新启用麦克风，并释放已有音频流。
- 插件宿主继续运行，因为开发者工具的插件检查功能依赖它。
- MCP 管理器不再进入 Pet Lite 根启动图，主/设置窗口不再注册 MCP IPC，渲染器也不再刷新 MCP 工具；源码和设置页保留。

本阶段没有做的事情：

- 没有删除 AI 服务、MCP、插件、聊天窗口或共享 store。
- 没有停止 `channel-server` 或插件宿主的初始化；MCP 管理器已停止初始化。
- 没有处理 Desktop Overlay。
- 没有删除开发者工具、角色模型导入、外观设置或通知。

## 后续裁剪规则

每次决定删除一个后台模块，都必须先记录：

1. 它的启动入口和停止入口。
2. 它依赖的共享模块，以及哪些保留功能仍会使用这些依赖。
3. 空闲、桌宠显示、设置打开、通知弹出和应用退出时的行为。
4. 停止后通过类型检查、测试和真实 Electron 启动验证。

只有完成以上四项，状态才能从“隐藏但仍运行”或“待审计”改成“确认移除”。目前没有任何模块达到“确认移除”。

## 2026-07-14 共享后台审计结论

本次只做代码审计，没有停用第二批模块：

- `channel-server` 在 `setupServerChannel()` 中注册应用启动/停止钩子，并默认监听 `127.0.0.1:6121`。窗口基础 IPC 会注册它的配置处理器，插件宿主、连接状态和多个窗口也复用同一个服务；现在不能仅因为连接设置被隐藏就停止它。
- MCP 管理器默认不会自动启动外部 MCP 子进程；本次已进一步将它从 Pet Lite 根启动图、主/设置窗口 IPC 和渲染器工具刷新边界断开。源码和设置页仍保留，恢复时重新接回对应窗口依赖即可。
- 认证管理器只维护窗口回调上下文。真正的网络登录发生在用户主动登录时，届时才启动回环回调服务；退出登录会关闭回环服务，没有发现常驻网络任务。
- 数据维护由设置页触发，负责本地应用数据、聊天会话或桌面状态的导入、删除和重置，没有独立的后台常驻服务。保留它不会增加桌宠空闲运行负担。

因此第二批只停用了 MCP 管理器；`channel-server`、认证和数据维护仍保持原状。后续若要继续减负，必须先把插件宿主、窗口基础 IPC 和连接状态迁移到明确的可选依赖后再考虑 channel-server。

## 可恢复性规则

真正裁剪后台时，先使用“可恢复停用”作为中间状态：

- 不删除模块源码、共享类型、依赖和原始入口。
- 只在明确的服务启动/停止边界上阻止初始化或停止运行。
- 在本清单记录停用原因、恢复开关和验证结果。
- 观察确认没有影响保留功能后，才讨论是否进入“确认移除”。

以后重新启用某个功能时，先恢复策略开关和入口，再恢复服务初始化，最后按同一组验证步骤验收。这样恢复操作不依赖聊天记录，也不需要从零重写。

## 下一步

当前已将保留模块作为稳定基线。第一批可恢复停用已经落地。下一阶段审计可能影响启动开销的 `channel-server`、MCP 和数据/认证共享依赖；角色卡、模型、外观、通知、开发者工具和 Desktop Overlay 不进入裁剪批次。
