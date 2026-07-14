# AIRI Companion Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AIRI 与 Neko 之间接通第一条可用的通用 Companion Bridge，让 Neko 的业务终态事件在 AIRI 中表现为独立字幕和一个轻量 Live2D 动作。

**Architecture:** AIRI 复用现有 `server-runtime`、`plugin-protocol` 和 `server-sdk`，作为本机回环 WebSocket 服务端；Neko 作为来源客户端，只发送最终文本和通用语义。AIRI 内部依次经过协议校验、反应解析、优先级调度和表现适配，字幕沿用现有独立 Caption 窗口，动作沿用当前模型运行时。

**Tech Stack:** Electron、Vue、TypeScript、Eventa、AIRI `server-runtime/server-sdk/plugin-protocol`、Vitest；Neko Tauri 2、Solid、TypeScript、浏览器 WebSocket、现有 Tauri 事件桥。

## Global Constraints

- AIRI 是桌宠表现能力的唯一宿主；Neko 旧 Companion、气泡、贴纸和动作调度不作为表现基线或兜底。
- 不创建第二套 WebSocket 服务或 Neko 私有消息格式；必须复用 AIRI 现有协议和回环服务。
- 只监听 `127.0.0.1`；第一阶段不开放局域网，不由 Neko 自动启动、安装或更新 AIRI。
- 外部事件只能携带 `source/topic/intent/priority/text/reactionHint/coalesceKey/ttlMs/createdAt`，不能携带 Live2D 文件名、自由动作脚本、Rust command、路径或原始高频进度。
- 回执只有 `accepted`、`completed`、`dropped`；事件 ID 必须幂等，重复发送不重复入队。
- 反应最多包含字幕、一个模型动作和未来语音占位；第一阶段不做 TTS、嘴部动画、多段动作或复杂编舞。
- Hiyori Pro 初始动作映射固定为：开心 `Tap[1] -> hiyori_m08.motion3.json`，难过 `Flick@Body[0] -> hiyori_m10.motion3.json`，中性 `Flick[0] -> hiyori_m03.motion3.json`。外部不得看到资源名。
- 语义默认映射：`info/warning/reminder -> neutral`，`success -> happy`，`error -> sad`；随机动作只用于明确指定的低风险环境消息。
- 同时只播放一个反应：`critical` 可打断，`high` 可打断 `low`，`normal` FIFO，`low` 只在空闲时执行；同 `coalesceKey` 只保留最新项；默认 TTL 30 秒。
- 每个代码任务必须由一个 agent 独占写入边界；agent 不得回退其他人的改动。临时报告、任务简报和日志必须写在项目 `.Codex-tmp/companion-bridge/`，不得散落到源码目录。
- 我负责 leader 工作：决定边界、分配任务、检查 diff、处理审查意见、运行跨项目验证和提交；子 agent 的“完成”报告不能替代实际验收。
- 每个独立交付物完成后提交。UI 视觉验收留给用户明天进行；今天必须完成类型检查、单元测试、真实 AIRI 启动检查和 Neko 连接/发送链路检查。

## File Map

### AIRI

- `packages/plugin-protocol/src/types/events.ts`: Companion 事件、能力、回执的协议类型和事件登记。
- `packages/plugin-protocol/test/companion-events.test.ts`: 协议事件结构和字段边界测试。
- `apps/stage-tamagotchi/src/main/services/airi/companion-bridge/`: AIRI 主进程桥接客户端、解析器、调度器和播放器协调层。
- `apps/stage-tamagotchi/src/main/services/airi/companion-bridge/*.test.ts`: 纯逻辑单元测试。
- `apps/stage-tamagotchi/src/shared/eventa/index.ts`: 主进程到 Stage/Caption renderer 的最小 Eventa 事件。
- `apps/stage-tamagotchi/src/renderer/pages/caption.vue`: 新增独立桥接字幕来源，不能改变语音字幕语义。
- `apps/stage-tamagotchi/src/renderer/composables/useCaptionItems.ts`: 桥接字幕的替换和清理行为。
- `packages/stage-ui/src/components/scenes/Stage.vue` 及当前模型 store/composable: 复用现有动作 API，登记 Hiyori 能力档案。
- `apps/stage-tamagotchi/src/main/index.ts`: 装配桥接服务并绑定生命周期；不得恢复被 Pet Lite 隐藏的聊天/听觉/MCP/Godot 等模块。
- `docs/superpowers/specs/2026-07-14-companion-bridge-reaction-design.md`: 已确认的产品设计，不随实现擅自改方向。

### Neko

- `app/src/hub/features/companion/`: 新增独立来源适配器和 AIRI 客户端生命周期，不挂在仅负责 toast 的 `HubRuntimeBridge` 上。
- `app/src/hub/features/device/transfer/`、`app/src/hub/features/device/install/`、`app/src/hub/features/device/pak/`、`app/src/hub/features/device/deploy/`: 在 Controller 已归一化的终态边界调用来源适配器，只映射完成/失败/取消等低频业务节点。
- `app/src/hub/features/blueking/download/`: 只接已有下载/部署终态；当前链接解析没有独立完成/失败事件，本次不凭空补造。
- 需要新增的 Neko 测试文件与上面来源适配器同目录，测试客户端不可用时的静默降级和幂等发送。
- `docs/superpowers/` 下已有用户改动必须保留；如需补充桥接契约，只追加与本计划一致的内容。

---

### Task 1: Shared Companion Protocol

**Files:**
- Modify: `F:/dev/neko-airi-pet/packages/plugin-protocol/src/types/events.ts`
- Create: `F:/dev/neko-airi-pet/packages/plugin-protocol/test/companion-events.test.ts`

**Interfaces:**
- Produces `CompanionEvent`, `CompanionAck`, `CompanionCapabilities` and `ProtocolEvents` entries `companion:event`, `companion:ack`, `companion:capabilities`.
- The event payload has the exact fields and literal unions from the Global Constraints section.

- [ ] Step 1: Write tests for valid success/error/reminder payloads, invalid priority/intent, empty text and duplicate ACK semantics.
- [ ] Step 2: Run the targeted protocol test and confirm it fails for the missing event types.
- [ ] Step 3: Add the protocol types and event registrations, using existing `defineProtocolEventa` and `ProtocolEvents` conventions.
- [ ] Step 4: Run the targeted test and package typecheck; confirm the event map and payload types compile.
- [ ] Step 5: Inspect the diff for no transport or unrelated event changes, then commit `feat(protocol): add companion bridge events`.

### Task 2: AIRI Reaction Core

**Files:**
- Create: `F:/dev/neko-airi-pet/apps/stage-tamagotchi/src/main/services/airi/companion-bridge/contracts.ts`
- Create: `F:/dev/neko-airi-pet/apps/stage-tamagotchi/src/main/services/airi/companion-bridge/resolver.ts`
- Create: `F:/dev/neko-airi-pet/apps/stage-tamagotchi/src/main/services/airi/companion-bridge/scheduler.ts`
- Create: `F:/dev/neko-airi-pet/apps/stage-tamagotchi/src/main/services/airi/companion-bridge/reaction-core.test.ts`

**Interfaces:**
- `resolveCompanionReaction(event, capabilities): ResolvedCompanionReaction`.
- `createReactionScheduler(clock?): ReactionScheduler` with `enqueue`, `cancel`, `dispose`, `snapshot` and the ACK status transitions required by the spec.

- [ ] Step 1: Write tests for intent mapping, named recipe validation, semantic fallback, FIFO, critical/high interruption, coalescing, expiry and idempotency.
- [ ] Step 2: Run the targeted test and confirm it fails.
- [ ] Step 3: Implement the smallest pure resolver/scheduler; use injectable clock/timers so tests do not wait in real time.
- [ ] Step 4: Run targeted tests and AIRI lint/typecheck for the new folder.
- [ ] Step 5: Commit `feat(companion): add reaction resolver and scheduler`.

### Task 3: Caption and Model Presentation Adapter

**Files:**
- Modify: `F:/dev/neko-airi-pet/apps/stage-tamagotchi/src/shared/eventa/index.ts`
- Modify: `F:/dev/neko-airi-pet/apps/stage-tamagotchi/src/renderer/pages/caption.vue`
- Modify: `F:/dev/neko-airi-pet/apps/stage-tamagotchi/src/renderer/composables/useCaptionItems.ts`
- Modify: `F:/dev/neko-airi-pet/packages/stage-ui/src/components/scenes/Stage.vue` or the current model action owner found during implementation
- Create: `F:/dev/neko-airi-pet/apps/stage-tamagotchi/src/renderer/composables/companion-reaction.ts`
- Create: `F:/dev/neko-airi-pet/apps/stage-tamagotchi/src/renderer/composables/companion-reaction.test.ts`

**Interfaces:**
- Main process emits a typed reaction request; renderer translates it to `caption-companion` and the current model action API.
- Caption bridge source replaces only the previous bridge item and never clears `caption-speaker` or `caption-assistant`.
- Hiyori mappings remain internal to AIRI and degrade to caption-only when the current model lacks the requested capability.

- [ ] Step 1: Add tests for caption replacement/isolation and capability fallback.
- [ ] Step 2: Run the focused tests and confirm the new source is absent/failing.
- [ ] Step 3: Add the typed event and renderer adapter, reusing existing caption window lifecycle and model API.
- [ ] Step 4: Run caption tests, stage-ui tests relevant to the touched model API and typecheck.
- [ ] Step 5: Commit `feat(companion): play caption and model reactions`.

### Task 4: AIRI Bridge Service and Lifecycle

**Files:**
- Create: `F:/dev/neko-airi-pet/apps/stage-tamagotchi/src/main/services/airi/companion-bridge/service.ts`
- Modify: `F:/dev/neko-airi-pet/apps/stage-tamagotchi/src/main/index.ts`
- Modify: `F:/dev/neko-airi-pet/apps/stage-tamagotchi/src/shared/pet-lite-features.ts` only if a dedicated reversible `companionBridge` flag is needed
- Create: `F:/dev/neko-airi-pet/apps/stage-tamagotchi/src/main/services/airi/companion-bridge/service.test.ts`

**Interfaces:**
- `setupCompanionBridge({ lifecycle, serverChannel, ... }): Promise<CompanionBridgeService>`.
- The service starts only when AIRI is running and the bridge flag is enabled, starts the existing loopback server through `setupServerChannel`, and uses one internal `@proj-airi/server-sdk` client to observe `companion:event` and send `companion:ack`/`companion:capabilities`; it disposes the client, listeners and timers on stop.

- [ ] Step 1: Write lifecycle tests for disabled/enabled startup, stop cleanup, duplicate event IDs and reconnect/closed-client behavior.
- [ ] Step 2: Run the focused service test and confirm it fails.
- [ ] Step 3: Implement the bridge on top of the existing AIRI server protocol/client lifecycle; do not create a second server or re-enable unrelated Pet Lite modules.
- [ ] Step 4: Run service tests, `pnpm -F @proj-airi/stage-tamagotchi typecheck`, and the relevant server-runtime tests.
- [ ] Step 5: Commit `feat(companion): run bridge with AIRI lifecycle`.

### Task 5: Neko Source Adapter

**Files:**
- Modify: `F:/dev/neko-shell/app/src/hub/features/shell/HubRuntimeBridge.tsx` or add a focused sibling adapter owned by the Neko worker
- Modify: `F:/dev/neko-shell/app/src/hub/features/device/transfer/` only at the existing terminal-state boundary
- Modify: `F:/dev/neko-shell/app/src/hub/features/blueking/` only at parse terminal-state boundary
- Create: Neko adapter tests next to the adapter and terminal event mapping

**Interfaces:**
- `createCompanionSourceAdapter({ endpoint, token, source }): { send(event): Promise<'sent' | 'unavailable'>, dispose(): void }`.
- `mapNekoTerminalEvent(input): CompanionEvent | null` maps only the real task completed/failed/cancelled and install/download/deploy terminal states available after Controller normalization. Device disconnect and Blueking link-parse completion/failure stay deferred until Neko has reliable source events.

- [ ] Step 1: Write tests proving AIRI unavailable does not break Hub behavior and only terminal events produce messages.
- [ ] Step 2: Run the focused Neko tests and confirm failure.
- [ ] Step 3: Implement a quiet loopback WebSocket client using the AIRI wire event shape and a source adapter owned by the Hub application lifecycle; send no raw progress, paths, URLs or action names.
- [ ] Step 4: Run Neko frontend tests/typecheck/build checks available in the repository.
- [ ] Step 5: Commit `feat(hub): publish terminal events to companion bridge` without touching the user’s unrelated docs changes.

### Task 6: Real Integration and Leader Acceptance

**Files:**
- Modify only files proven necessary by Tasks 1-5.
- Update: `F:/dev/neko-airi-pet/.Codex-tmp/companion-bridge/progress.md`
- Update: `F:/dev/neko-airi-pet/.Codex-tmp/_context-recovery.md`
- Update: `F:/dev/neko-airi-pet/INDEX.md` only if the bridge file map changes.

- [ ] Step 1: Review every task diff and commit independently; reject unplanned protocol duplication, direct model-name leakage, or uncancelled timers/listeners.
- [ ] Step 2: Run AIRI protocol/reaction/caption tests, typecheck and desktop build.
- [ ] Step 3: Start real AIRI Electron and real Neko Tauri, verify Neko can connect when AIRI is available and remains functional when AIRI is closed.
- [ ] Step 4: Send a real Neko task-complete event and verify `accepted`, Caption window text, Hiyori m08 motion, action cleanup and `completed`.
- [ ] Step 5: Verify duplicate ID, expired event, Neko restart, AIRI restart and no-AIRI behavior.
- [ ] Step 6: Record evidence, update the recovery ledger, and commit any final integration fix separately.

## Deferred

TTS、嘴部动画、自定义反应编辑器、更多模型档案、AI 润色/动作选择、LAN、Neko 自动启动 AIRI、复杂桌面覆盖层和 UI 视觉微调不进入本次实现。

## Leader Review Gates

每个 Task 都要有：实现 agent 报告、实际 diff 检查、针对性测试、独立 reviewer 结论；有 Critical/Important 问题必须修复并重新审查。全部任务结束后再做一次跨 AIRI/Neko 的整体审查。用户明天负责视觉验收，但桥接功能、生命周期和无 AIRI 降级必须在今天由 leader 完成。
