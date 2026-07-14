# Neko AIRI Pet 快速索引

这是本项目的快速接手入口。先读 `AGENTS.md`，再读本文件；需要了解裁剪边界时读 `docs/superpowers/airi-pet-lite-backend-scope.md`，不要从全仓库重新扫描开始。

## 当前基线

项目是 AIRI 派生的可选 Neko Pet。当前桌宠基线保留：

- 角色模型与 AIRI Card 导入/切换
- 场景、外观、窗口行为和通知
- 开发者工具
- Desktop Overlay 暂不处理

普通用户入口已隐藏但后台暂未删除：认证、Provider、Modules、Memory、Connection、Data、通用设置和配色方案。
第一批后台已进入 `可恢复停用`：聊天、麦克风听觉输入、Spotlight/全局快捷键和 Artistry bridge。插件宿主仍运行，因为开发者工具依赖它。所有源码和依赖仍保留。

## 先看这些文件

| 文件 | 用途 |
|---|---|
| `AGENTS.md` | AIRI 技术栈、开发命令和项目约束 |
| `apps/stage-tamagotchi/src/shared/pet-lite-features.ts` | Pet Lite 用户入口策略和固定默认值 |
| `docs/superpowers/airi-pet-lite-backend-scope.md` | 前端入口、后台边界、裁剪状态和恢复规则 |
| `docs/superpowers/plans/2026-07-14-airi-pet-lite-scope.md` | 第一阶段实现与验证记录 |
| `.Codex-tmp/_context-recovery.md` | 最近阶段的上下文恢复记录 |

## 关键代码地图

| 功能 | 入口/实现 |
|---|---|
| 桌宠控制区 | `apps/stage-tamagotchi/src/renderer/components/stage-islands/controls-island/index.vue` |
| 桌宠主页面 | `apps/stage-tamagotchi/src/renderer/pages/index.vue` |
| 设置首页过滤 | `apps/stage-tamagotchi/src/renderer/pages/settings/index.vue` |
| 系统设置过滤 | `apps/stage-tamagotchi/src/renderer/pages/settings/system/index.vue` |
| 角色模型页面 | `apps/stage-tamagotchi/src/renderer/pages/settings/models/index.vue` |
| 模型设置组件 | `packages/stage-ui/src/components/scenarios/settings/model-settings/` |
| 简体中文词条 | `packages/i18n/src/locales/zh-Hans/settings.yaml` |
| 英文回退词条 | `packages/i18n/src/locales/en/settings.yaml` |
| 主进程服务装配 | `apps/stage-tamagotchi/src/main/index.ts` |

## 可恢复操作规则

1. **入口层**：先改 `pet-lite-features.ts` 的开关或隐藏路由集合。
2. **后台层**：通过服务自己的启动/停止边界停用，先不删除源码和依赖。
3. **记录层**：同步更新范围清单，状态先用“可恢复停用”，通过验证后才可改为“确认移除”。
4. **恢复功能**：恢复入口、打开对应策略，再运行类型检查、测试和真实 Electron 启动验证。

任何新增功能都先登记到范围清单，再决定是保留、隐藏、可恢复停用还是确认移除。

## 快速检索

优先阅读本索引列出的文件，再用局部检索：

```powershell
rg -n "功能名|服务名|路由名" apps/stage-tamagotchi packages/stage-ui packages/i18n
git log --oneline -- <文件路径>
```

不要把构建产物、`.Codex-tmp` 临时文件或全仓库依赖目录作为业务实现依据。
