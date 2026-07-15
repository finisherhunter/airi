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

## 2026-07-16 Windows 打包记录

- 生产构建单独执行通过，随后执行 Windows electron-builder。
- `dist/AIRI-0.11.0-windows-x64-setup.exe` 已生成，大小 `623341967` bytes；`latest-x64.yml` 与 blockmap 已生成，安装包 SHA-512 与 `latest-x64.yml` 一致，文件头为有效 Windows PE（`MZ`）。
- 本次打包命令最终退出失败，原因是残留的另一组 electron-builder 进程与当前命令同时操作同一 `dist` 目录，导致 `win-unpacked/electron.exe` 重命名竞争并出现 `ENOENT`。这不是代码构建错误，但本次命令不能标记为干净成功。
- 另外记录了 `engines/stage-tamagotchi-godot/build/win` 不存在的 warning；Godot 当前为停用能力，首包未因此中止，但正式交付前应明确是否从 Windows 打包配置移除该可选资源声明。
- 后续再次打包前必须确认没有旧的 electron-builder/makensis 进程，只允许单组打包进程运行；不能复用这次并发产生的结论。

### 干净重打包结果

- 清理旧的生成目录并确认没有打包进程后，重新执行 `corepack pnpm exec electron-builder --win`。
- 本次只有一组实际 electron-builder 进程，命令以退出码 `0` 完成。
- 安装包、blockmap、`latest-x64.yml`、`win-unpacked/airi.exe` 和 `resources/app.asar` 均已生成；安装包大小仍为 `623341967` bytes。
- Godot Windows 资源目录缺失仍只是 warning；当前 Godot 能力停用，不影响本次 AIRI Pet Lite 包生成。

## 2026-07-16 首包体积基线

- Windows 安装包：`623341967` bytes，约 `594 MB`。
- `dist/win-unpacked`：约 `1.3 GB`；Electron 运行时本体约 `213 MB`，不是主要问题。
- `resources/app.asar`：约 `1.08 GB`。
- `app.asar` 内：`node_modules` 约 `973 MB`，`out/renderer/assets` 约 `325 MB`。
- 依赖体积大户：`@proj-airi` 约 `233 MB`、`onnxruntime-node` 约 `208 MB`、`onnxruntime-web` 约 `132 MB`、`@duckdb` 约 `137 MB`、`@fontsource` 约 `66 MB`。
- 资源体积大户：DuckDB WASM 三份约 `98 MB`、Hiyori 模型压缩包约 `44 MB`、示例 VRM 约 `53 MB`、字体约 `51 MB`、ONNX WASM 约 `24 MB`。
- 下一步先做运行时依赖与打包边界审计，再决定哪些资源改为可选下载；不直接删除模型导入、外观设置或桥接能力。

### 第一批静态过滤结果

- 在 `electron-builder.config.ts` 增加了生产包过滤：workspace 依赖的 source map、类型声明、测试文件、测试配置和 `.turbo` 缓存。
- `typecheck`、生产 `build`、定向 ESLint 均通过；`electron-builder --dir` 生成成功。
- `app.asar` 从约 `1078 MB` 降至约 `955 MB`，其中 `node_modules` 从约 `973 MB` 降至约 `852 MB`，未压缩目录实际减少约 `120 MB`。
- 当前只验证了未压缩目录，尚未重新生成安装包；下一步需要用单一 electron-builder 进程生成安装包并重新测量压缩后体积。
- 这一批没有删除模型、字体、DuckDB、ONNX、Live2D/VRM、桥接或设置功能。

### 第二批重复 workspace 资源过滤结果

- 精确排除了 `stage-ui`、CJK/Xiaolai/ChillRoundM 字体包中已被生产构建产物替代的 `src/**`。
- `electron-builder --dir` 验证通过；`out/renderer/assets` 中的 Hiyori Pro、Hiyori Free、VRM A/B 和 `out/main` 桥接代码均仍存在。
- 未压缩目录从约 `1527 MB` 降至约 `1365 MB`；`app.asar` 从约 `955 MB` 降至约 `793 MB`，实际减少约 `162 MB`。
- 这两批过滤合计将 `app.asar` 从首包约 `1078 MB` 降至约 `793 MB`，但尚未重新生成压缩安装包。
- 下一步再处理平台 native 依赖、可选模型和已停用能力的资源；每项都必须先验证运行时引用和功能回归。

### 优化后 Windows 包结果

- 使用两批过滤后的配置重新执行单一 `electron-builder --win`，命令退出码 `0`。
- 安装包从首包 `623341967` bytes（约 `594.2 MB`）降至 `479612254` bytes（约 `457.4 MB`），减少 `143729713` bytes，约 `23%`。
- `latest-x64.yml` 中记录的 SHA-512 与安装包实际 SHA-512 一致；blockmap、`airi.exe` 和 `resources/app.asar` 均存在。
- Godot Windows 资源目录缺失仍产生 warning；Godot 当前停用，本次包未因此失败，但正式发布前仍需决定是否条件化该 `extraResources` 声明。

## 2026-07-16 后续体积评估

- Windows x64 的 `onnxruntime-node` 多平台 native 文件理论上可再省约 `175 MiB` 未压缩；必须做成 Windows x64 专用打包规则，不能影响 macOS、Linux 和 Windows ARM 构建。回归范围包括本地推理、快捷键、窗口拖拽和 Companion Bridge。
- Hiyori Pro 是首屏默认模型，必须保留；Hiyori Free、VRM A/B 是选择后才加载的预置资源，可以评估为独立资源包，但不能删除模型导入、模型设置、外观和动作能力。
- DuckDB WASM 当前在 Stage 挂载时执行未来功能桩，应改为真实记忆功能首次使用时加载；保留 API、worker 和恢复路径。
- ONNX WASM、听觉/抠图/推理资源可移出 Pet Lite 首屏路径，保留首次启用时加载和缓存能力。
- 后续实施顺序：先做 Windows x64 native 裁剪实验，再做 DuckDB/ONNX 延迟加载，最后评估可选模型和字体资源拆包；每批都要重新生成包并做对应功能回归。
