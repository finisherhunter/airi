# AIRI Pet Lite Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the first-phase AI platform entry points in the AIRI derivative while preserving character import/switching, all appearance settings, notifications, and developer tools.

**Architecture:** Add one small Pet Lite feature policy at the Tamagotchi app boundary. Use it to filter ordinary settings entries, hide chat/voice/auth controls, and disconnect the first low-risk backend services from the active Electron dependency graph. Do not remove AIRI shared stores, source windows, Desktop Overlay, or developer tooling; every stopped service remains available for restoration.

**Tech Stack:** Electron, Vue 3, TypeScript, Vue Router, Vitest, pnpm.

The persistent backend scope ledger is maintained in [`docs/superpowers/airi-pet-lite-backend-scope.md`](../airi-pet-lite-backend-scope.md). It is the source of truth for the distinction between a hidden UI entry, a still-running backend service, and an approved removal.

## Global Constraints

- Preserve character model and Airi Card import, switching, and appearance configuration.
- Preserve notifications, confirmation windows, and developer tools.
- Do not modify Desktop Overlay in this phase.
- Close chat, provider, module, memory, data-maintenance, server-connection, voice, and authentication entry points for ordinary Pet Lite use.
- Do not delete shared AIRI source or dependencies before a separate runtime dependency audit.
- Keep temporary logs and reports under `F:\dev\neko-airi-pet\.Codex-tmp\` and do not commit them.

---

### Task 1: Add The Pet Lite Feature Policy

**Files:**
- Create: `apps/stage-tamagotchi/src/shared/pet-lite-features.ts`
- Test: `apps/stage-tamagotchi/src/shared/pet-lite-features.test.ts`

**Interfaces:**
- Produces `petLiteFeatures` for renderer entry points and `isPetLiteSettingsRouteVisible(path)` for the settings index.

- [x] **Step 1: Write the failing policy test**

```ts
import { describe, expect, it } from 'vitest'

import { isPetLiteSettingsRouteVisible, petLiteFeatures } from './pet-lite-features'

describe('pet lite feature policy', () => {
  it('keeps character and appearance capabilities available', () => {
    expect(petLiteFeatures.characterImport).toBe(true)
    expect(petLiteFeatures.appearanceSettings).toBe(true)
    expect(petLiteFeatures.notifications).toBe(true)
    expect(petLiteFeatures.developerTools).toBe(true)
  })

  it('hides AI platform settings while preserving model and system settings', () => {
    expect(isPetLiteSettingsRouteVisible('/settings/providers')).toBe(false)
    expect(isPetLiteSettingsRouteVisible('/settings/modules')).toBe(false)
    expect(isPetLiteSettingsRouteVisible('/settings/memory')).toBe(false)
    expect(isPetLiteSettingsRouteVisible('/settings/connection')).toBe(false)
    expect(isPetLiteSettingsRouteVisible('/settings/data')).toBe(false)
    expect(isPetLiteSettingsRouteVisible('/settings/models')).toBe(true)
    expect(isPetLiteSettingsRouteVisible('/settings/scene')).toBe(true)
    expect(isPetLiteSettingsRouteVisible('/settings/system')).toBe(true)
  })
})
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `corepack pnpm --filter @proj-airi/stage-tamagotchi exec vitest run src/shared/pet-lite-features.test.ts`

Expected: FAIL because the policy module does not exist yet.

- [x] **Step 3: Implement the minimal policy**

```ts
export const petLiteFeatures = {
  characterImport: true,
  appearanceSettings: true,
  notifications: true,
  developerTools: true,
  chat: false,
  hearing: false,
  authentication: false,
} as const

const hiddenSettingsRoutes = new Set([
  '/settings/providers',
  '/settings/modules',
  '/settings/memory',
  '/settings/connection',
  '/settings/data',
])

export function isPetLiteSettingsRouteVisible(path: string) {
  return !hiddenSettingsRoutes.has(path)
}
```

- [x] **Step 4: Run the focused test and verify it passes**

Run: `corepack pnpm --filter @proj-airi/stage-tamagotchi exec vitest run src/shared/pet-lite-features.test.ts`

Expected: PASS.

### Task 2: Close AI Platform Settings Entries

**Files:**
- Modify: `apps/stage-tamagotchi/src/renderer/pages/settings/index.vue`

**Interfaces:**
- Consumes `isPetLiteSettingsRouteVisible` from Task 1.
- Produces a settings landing page that still exposes models, scenes, system appearance/window settings, character cards, and developer tools.

- [x] **Step 1: Add the policy import and route filter**

Change the settings route projection so the existing `settingsEntry` requirement is followed by `isPetLiteSettingsRouteVisible(route.path)`. Keep route files and deep links intact for later re-enablement.

- [x] **Step 2: Run settings-related tests and typecheck**

Run: `corepack pnpm --filter @proj-airi/stage-tamagotchi exec vitest run src/shared/pet-lite-features.test.ts`

Expected: PASS.

### Task 3: Keep The Desktop Pet Controls Focused

**Files:**
- Modify: `apps/stage-tamagotchi/src/renderer/components/stage-islands/controls-island/index.vue`

**Interfaces:**
- Consumes `petLiteFeatures` from Task 1.
- Keeps settings, character profile picker, refresh, centering, theme, always-on-top, fade-on-hover, drag, and close controls.
- Hides chat, microphone/hearing, and authentication controls when their Pet Lite flags are false.

- [x] **Step 1: Add the policy import and conditional rendering**

Use `v-if` around `ControlsIslandAuthButton`, the chat control, and the hearing control. Do not remove their imports or implementation files; the flags are the re-enable boundary.

- [x] **Step 2: Run the focused policy test and the app typecheck**

Run: `corepack pnpm --filter @proj-airi/stage-tamagotchi exec vitest run src/shared/pet-lite-features.test.ts && corepack pnpm --filter @proj-airi/stage-tamagotchi typecheck`

Expected: PASS with no new type errors.

### Task 4: Verify Core Pet Paths And Record The Boundary

**Files:**
- Modify: `F:\dev\neko-shell\docs\superpowers\specs\2026-07-13-airi-pet-lite-design.md` only if implementation findings change the approved scope.
- Create: `F:\dev\neko-airi-pet\.Codex-tmp\pet-lite-scope-verification.md`

- [x] **Step 1: Run the complete targeted checks**

Run:

```powershell
corepack pnpm --filter @proj-airi/stage-tamagotchi exec vitest run src/shared/pet-lite-features.test.ts
corepack pnpm --filter @proj-airi/stage-tamagotchi typecheck
corepack pnpm --filter @proj-airi/stage-tamagotchi build
```

Expected: all commands exit `0`.

- [ ] **Step 2: Verify the visible behavior in the running AIRI window**

Confirm that character import/switching, scene/theme/appearance settings, window controls, notifications, and developer tools remain reachable. Confirm that chat, voice/hearing, authentication, provider, module, memory, connection, and data-maintenance entries are not shown on the normal settings landing page.

- [x] **Step 3: Record the visible boundary and the runtime boundary**

Record the exact commands and visible results in `.Codex-tmp/pet-lite-scope-verification.md`. Explicitly note which shared AI services remain initialized.

### Task 5: First Reversible Runtime Stop Batch

**Files:**
- Modify: `apps/stage-tamagotchi/src/main/index.ts`
- Modify: `apps/stage-tamagotchi/src/main/windows/main/`
- Modify: `apps/stage-tamagotchi/src/main/windows/settings/`
- Modify: `apps/stage-tamagotchi/src/renderer/App.vue`
- Modify: `apps/stage-tamagotchi/src/renderer/pages/index.vue`
- Modify: `apps/stage-tamagotchi/src/shared/pet-lite-features.ts`
- Modify: `docs/superpowers/airi-pet-lite-backend-scope.md`

- [x] Disconnect the chat window and its main-window IPC handler from the active graph.
- [x] Disconnect Spotlight and the global-shortcut service from active settings/window startup.
- [x] Gate Artistry bridge initialization; keep the plugin host because developer tools depend on it.
- [x] Force legacy persisted microphone state off and stop any existing stream when hearing is disabled.
- [x] Keep the original providers and source modules for restoration; do not classify them as removed.
- [x] Verify with the focused policy test, typecheck, and Electron build.

## Follow-up Boundary

The next phase is to audit `channel-server`, MCP and data/auth shared dependencies. It may stop one service group at a time, but it must not touch Desktop Overlay or the preserved character/appearance/notification/developer paths without a new review.
