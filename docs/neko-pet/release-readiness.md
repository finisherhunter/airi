# Neko Pet 收尾与打包清单

## 当前结论

截至 2026-07-15，AIRI 侧 Pet Lite 和 Neko Companion Bridge 已经完成真实联调，不是 mock：

- Neko 订阅 `tool:done`、`tool:error`、`tool:cancelled`。
- Neko 将终态事件映射为 `companion:event`，通过原生 WebSocket 发送。
- AIRI 从 loopback channel server 接收事件，解析语义，驱动独立字幕窗口和 Live2D 动作，并返回 ACK。
- Neko 通过 `companion-bridge.json` 发现 AIRI 的 endpoint 和 token。
- 已有诊断测试入口 `sendTestReaction()`，真实事件来源包括设备安装、文件传输、PAK、PC 部署和蓝盾终态。

本阶段不再重复设计桥接协议，后续工作是回归验证、打包和性能收尾。

## 性能与依赖策略

### 已完成

- Caption 窗口使用最小运行时，不初始化聊天会话和完整舞台运行时。
- `inferencePreload` 随关闭的 chat/hearing 能力停用。
- chat/hearing 都关闭时，跳过聊天 session store 的创建和初始化；chat/hearing 任一开启时保留原有恢复路径。
- 字幕跟随关闭、隐藏或销毁时会取消 trailing 位置任务；重复开启跟随不会重复注册主窗口监听器，显示后会恢复跟随。
- 已审计 Godot 关闭态：manager 构造本身不启动 Godot，只保留状态/RPC/残留进程清理能力；简单 gated 会破坏设置页和恢复入口，因此本批次不改。
- 已完成 workspace 依赖声明、类型检查、生产构建和测试恢复。
- 当前没有足够证据删除模型、字体、Live2D/VRM、DuckDB WASM、ONNX 或开发者工具相关依赖。

### 打包前做

只做有明确证据、低风险的入口优化：

1. chat 已停用时，确认并跳过不需要的 chat session/sync 初始化；保留数据和恢复入口。
2. Godot 已停用时，确认是否可以延迟 manager 构造和 IPC 注册；保留 Godot 源码和恢复能力。
3. 修复字幕跟随的生命周期问题：关闭跟随后取消 trailing 更新，重复开启跟随不重复注册监听器。
4. 每项修改都必须重新通过 typecheck、build 和全套 Vitest，并做一次桌宠启动回归。

### 首个可用包之后做

先记录启动耗时、空闲 CPU、空闲内存、打开模型后的内存和包体组成，再逐项处理：

- 只删除有 import graph、构建产物或运行时证据证明无用的直接依赖。
- 不因为某个 chunk 很大就删除依赖；动态路由和懒加载会保留合法功能。
- 不在没有用户确认的情况下删除角色模型、模型导入、外观设置、通知、开发者工具或桥接能力。
- 每删除一个依赖都单独构建并验证相关设置页、模型导入和桥接。

## 打包前硬性检查

### 代码与环境

- [ ] `git status --short` 只有预期改动，临时记录留在 `.Codex-tmp/`。
- [ ] 只运行一个安装/构建进程；长任务不使用短超时。
- [ ] `pnpm install` 正常结束，workspace 链接完整。
- [ ] 安装结束后没有无意的 `pnpm-lock.yaml` 漂移。
- [ ] 运行 `corepack pnpm -F @proj-airi/stage-tamagotchi typecheck`。
- [ ] 运行 `corepack pnpm -F @proj-airi/stage-tamagotchi build`。
- [ ] 运行 `corepack pnpm exec vitest run --config vitest.config.ts`。

### AIRI 功能

- [ ] 桌宠窗口能启动并加载当前测试模型。
- [ ] 模型导入、外观设置、通知、开发者工具仍可用。
- [ ] 独立字幕窗口默认状态、跟随开关、位置和尺寸行为正常。
- [ ] Caption 事件会显示文本，Live2D 模型会播放对应动作；非 Live2D 模型只显示文本。
- [ ] AIRI 重启后能重新生成或恢复 bridge discovery 配置。

### Neko-AIRI 联调

- [ ] Neko 能读取 `companion-bridge.json`，并校验 loopback endpoint 与 token。
- [ ] Neko 的测试反应能收到 `accepted` 和 `completed` 回执。
- [ ] 文件传输、设备安装、PAK/PC 部署的成功、失败、取消终态各至少验证一次。
- [ ] Neko 重启而 AIRI 保持运行时，连接能恢复；AIRI 重启而 Neko 保持运行时，连接能恢复。
- [ ] 两者同时启动时，不会把旧 token、旧 PID 或旧连接状态当成有效连接。
- [ ] 中间进度和日志不直接触发大量桌宠反应；优先使用低频终态事件。

### Windows 打包

- [ ] 先完成开发版回归，再执行 Windows 打包命令。
- [ ] 安装包能独立启动 AIRI；Neko 不启动 AIRI 时仍可独立运行。
- [ ] Neko 可选启动 AIRI，不把 AIRI 强行合并进 Neko 主进程。
- [ ] 首次启动、已有配置启动、缺少模型资源和 bridge 未连接时都有明确可见状态。
- [ ] 记录最终安装包大小、资源目录大小、启动耗时和空闲资源占用。

## 下一阶段顺序

1. 回归昨天已跑通的 Neko 测试反应和一条真实终态事件。
2. 完成打包前的低风险初始化与字幕跟随修正。
3. 再次执行 typecheck、build、Vitest 和开发版启动验收。
4. 生成第一个可用 Windows 包并记录基线指标。
5. 以基线为依据进行依赖和性能优化，不在首包前进行猜测式删包。

## 2026-07-15 打包前验收记录

- `corepack pnpm -F @proj-airi/stage-tamagotchi typecheck`：通过。
- `corepack pnpm -F @proj-airi/stage-tamagotchi build`：通过；构建约 3 分钟。保留已有插件耗时、DuckDB browser externalize、UnoCSS unmatched utility 和 `inlineDynamicImports` 弃用警告，均未导致失败。
- 本次新增/相关 focused tests：2 个文件、12 个测试通过。
- 桌宠配置范围测试：排除既有 `src/main/services/airi/plugins/index.test.ts` 后，60 个测试文件、354 个测试通过、1 个跳过。
- 完整桌宠测试仍有 1 个既有失败：插件自动重载测试在 Windows 临时配置文件 rename 处出现 `EPERM`，随后 `afterSessionId` 为空；单独重跑仍可复现。本批次未修改插件持久化逻辑，首个 Windows 包前需要单独处理或明确豁免它。
- 全仓 Vitest 还会触发与本桌宠批次无关的 cap-vite 跨平台路径/终端测试、plugin-sdk 路径断言和 server 数据库 hook 超时；不纳入本批次改动。
- 定向 lint（本批次触碰的 5 个文件）：通过。全包 lint 仍有既有 Companion Bridge、channel-server、依赖排序等问题，未在本批次扩展修复范围。
