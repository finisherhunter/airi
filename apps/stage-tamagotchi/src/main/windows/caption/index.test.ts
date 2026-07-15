import type { BrowserWindow } from 'electron'

import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setupCaptionWindowManager } from './index'

const testState = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void

  class FakeEventTarget {
    private readonly listeners = new Map<string, Set<Listener>>()

    on(event: string, listener: Listener) {
      const listeners = this.listeners.get(event) ?? new Set<Listener>()
      listeners.add(listener)
      this.listeners.set(event, listeners)
      return this
    }

    removeListener(event: string, listener: Listener) {
      this.listeners.get(event)?.delete(listener)
      return this
    }

    removeAllListeners() {
      this.listeners.clear()
      return this
    }

    emit(event: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(event) ?? [])
        listener(...args)
    }

    listenerCount(event: string) {
      return this.listeners.get(event)?.size ?? 0
    }
  }

  class FakeBrowserWindow extends FakeEventTarget {
    static readonly instances: FakeBrowserWindow[] = []

    private bounds = { x: 100, y: 100, width: 480, height: 180 }
    private visible = false
    private destroyed = false

    readonly webContents = { setWindowOpenHandler: vi.fn() }

    constructor() {
      super()
      FakeBrowserWindow.instances.push(this)
    }

    setAlwaysOnTop() {}
    setFullScreenable() {}
    setVisibleOnAllWorkspaces() {}
    setWindowButtonVisibility() {}
    setResizable() {}
    setIgnoreMouseEvents() {}

    getBounds() {
      return { ...this.bounds }
    }

    setBounds(bounds: typeof this.bounds) {
      this.bounds = { ...bounds }
    }

    setSize(width: number, height: number) {
      this.bounds = { ...this.bounds, width, height }
    }

    isDestroyed() {
      return this.destroyed
    }

    isVisible() {
      return this.visible
    }

    isMinimized() {
      return false
    }

    restore() {}

    show() {
      this.visible = true
      this.emit('show')
    }

    hide() {
      this.visible = false
      this.emit('hide')
    }

    focus() {}

    close() {
      this.destroyed = true
      this.emit('closed')
    }
  }

  type Scheduler = (() => void) & { cancel: () => void }

  function createScheduler(callback: () => void, delay: number, cancel: () => void): Scheduler {
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule: Scheduler = (() => {
      if (timer !== undefined)
        return

      timer = setTimeout(() => {
        timer = undefined
        callback()
      }, delay)
    }) as Scheduler

    schedule.cancel = () => {
      cancel()
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
    }

    return schedule
  }

  let throttleCallCount = 0
  let debounceCallCount = 0
  let throttleCancelCount = 0
  let debounceCancelCount = 0
  const throttleCancel = () => {
    throttleCancelCount++
  }
  const debounceCancel = () => {
    debounceCancelCount++
  }
  const config = { isFollowing: true, matrices: {} as Record<string, unknown> }
  const mainWindow = new FakeEventTarget() as FakeEventTarget & {
    getBounds: () => { x: number, y: number, width: number, height: number }
    isDestroyed: () => boolean
  }
  let mainBounds = { x: 0, y: 0, width: 480, height: 180 }
  mainWindow.getBounds = () => ({ ...mainBounds })
  mainWindow.isDestroyed = () => false

  const createConfig = vi.fn(() => ({
    setup: vi.fn(),
    get: () => config,
    update: vi.fn(),
  }))
  const createReusableWindow = vi.fn((setup: () => unknown) => {
    let windowPromise: Promise<unknown> | undefined
    return {
      getWindow: async () => {
        windowPromise ??= Promise.resolve(setup())
        return windowPromise
      },
    }
  })

  return {
    FakeBrowserWindow,
    mainWindow,
    get mainBounds() {
      return mainBounds
    },
    set mainBounds(value: typeof mainBounds) {
      mainBounds = value
    },
    config,
    createConfig,
    createReusableWindow,
    throttleCancel,
    debounceCancel,
    throttle: (callback: () => void, delay: number): Scheduler => {
      throttleCallCount++
      return createScheduler(callback, delay, throttleCancel)
    },
    debounce: (callback: () => void, delay: number): Scheduler => {
      debounceCallCount++
      return createScheduler(callback, delay, debounceCancel)
    },
    animate: (_state: unknown, options: { onRender?: () => void }) => {
      options.onRender?.()
      return { pause: () => {} }
    },
    defineInvokeHandler: vi.fn(() => vi.fn()),
    eventaContext: { emit: vi.fn() },
    screen: {
      getAllDisplays: vi.fn(() => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }]),
      getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })),
    },
    resetSchedulerCounts() {
      throttleCallCount = 0
      debounceCallCount = 0
      throttleCancelCount = 0
      debounceCancelCount = 0
    },
    get throttleCallCount() {
      return throttleCallCount
    },
    get debounceCallCount() {
      return debounceCallCount
    },
    get throttleCancelCount() {
      return throttleCancelCount
    },
    get debounceCancelCount() {
      return debounceCancelCount
    },
  }
})

vi.mock('electron', () => ({
  BrowserWindow: testState.FakeBrowserWindow,
  BrowserWindowConstructorOptions: {},
  ipcMain: { setMaxListeners: vi.fn() },
  screen: testState.screen,
  shell: { openExternal: vi.fn() },
}))

vi.mock('@moeru/eventa', () => ({
  defineInvokeHandler: testState.defineInvokeHandler,
}))

vi.mock('@moeru/eventa/adapters/electron/main', () => ({
  createContext: vi.fn(() => ({ context: testState.eventaContext })),
}))

vi.mock('../../../shared/eventa', () => ({
  captionGetIsFollowingWindow: {},
  captionIsFollowingWindowChanged: {},
  companionReactionRequested: {},
}))

vi.mock('animejs', () => ({
  animate: testState.animate,
  utils: { round: vi.fn(() => (value: number) => value) },
}))

vi.mock('es-toolkit', () => ({
  throttle: testState.throttle,
  debounce: testState.debounce,
}))

vi.mock('std-env', () => ({ isMacOS: false }))
vi.mock('valibot', () => ({
  boolean: vi.fn(),
  number: vi.fn(),
  object: vi.fn(),
  optional: vi.fn(),
  record: vi.fn(),
  string: vi.fn(),
}))

vi.mock('../../libs/electron/location', () => ({
  baseUrl: vi.fn((value: string) => value),
  getElectronMainDirname: vi.fn(() => ''),
  load: vi.fn(),
  withHashRoute: vi.fn((value: string) => value),
}))

vi.mock('../../libs/electron/persistence', () => ({
  createConfig: testState.createConfig,
}))

vi.mock('../../libs/electron/window-manager', () => ({
  createReusableWindow: testState.createReusableWindow,
}))

vi.mock('../shared/window', () => ({
  setupBaseWindowElectronInvokes: vi.fn(),
  transparentWindowConfig: vi.fn(() => ({ frame: false, transparent: true })),
}))

function createManager() {
  return setupCaptionWindowManager({
    mainWindow: testState.mainWindow as unknown as BrowserWindow,
    serverChannel: {} as ServerChannel,
    i18n: {} as I18n,
  })
}

describe('setupCaptionWindowManager follow lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    testState.config.isFollowing = true
    testState.config.matrices = {}
    testState.mainBounds = { x: 0, y: 0, width: 480, height: 180 }
    testState.mainWindow.removeAllListeners()
    testState.FakeBrowserWindow.instances.length = 0
    testState.resetSchedulerCounts()
    testState.createConfig.mockClear()
    testState.createReusableWindow.mockClear()
  })

  // ROOT CAUSE:
  //
  // Detaching the main-window listeners did not cancel trailing throttle/debounce work.
  // A delayed callback could therefore still call setBounds after following was disabled.
  it('cancels pending position work when follow is disabled', async () => {
    const manager = createManager()
    const window = await manager.getWindow()
    window.show()
    vi.runAllTimers()

    const setBounds = vi.spyOn(window, 'setBounds')
    testState.mainWindow.emit('move')
    await manager.setFollowWindow(false)

    expect(testState.mainWindow.listenerCount('move')).toBe(0)
    expect(testState.mainWindow.listenerCount('resize')).toBe(0)
    expect(testState.throttleCancelCount).toBe(1)
    expect(testState.debounceCancelCount).toBe(1)

    vi.runAllTimers()

    expect(setBounds).not.toHaveBeenCalled()
  })

  it('does not register duplicate listeners when follow is enabled repeatedly', async () => {
    testState.config.isFollowing = false
    const manager = createManager()
    await manager.setFollowWindow(true)
    await manager.setFollowWindow(true)

    expect(testState.mainWindow.listenerCount('move')).toBe(1)
    expect(testState.mainWindow.listenerCount('resize')).toBe(1)
    expect(testState.throttleCallCount).toBe(1)
    expect(testState.debounceCallCount).toBe(1)
  })

  it('cancels follow work when the caption window is destroyed', async () => {
    const manager = createManager()
    const window = await manager.getWindow()
    window.show()
    vi.runAllTimers()

    const setBounds = vi.spyOn(window, 'setBounds')
    testState.mainWindow.emit('move')
    window.close()

    expect(testState.mainWindow.listenerCount('move')).toBe(0)
    expect(testState.mainWindow.listenerCount('resize')).toBe(0)
    expect(testState.throttleCancelCount).toBe(1)
    expect(testState.debounceCancelCount).toBe(1)

    vi.runAllTimers()

    expect(setBounds).not.toHaveBeenCalled()
  })

  it('stops follow work while hidden and resumes it when shown', async () => {
    const manager = createManager()
    const window = await manager.getWindow()
    window.show()
    vi.runAllTimers()

    const followedSize = window.getBounds()
    const setBounds = vi.spyOn(window, 'setBounds')
    testState.mainBounds = { x: 240, y: 120, width: 480, height: 180 }
    testState.mainWindow.emit('move')
    window.hide()

    expect(testState.mainWindow.listenerCount('move')).toBe(0)
    expect(testState.mainWindow.listenerCount('resize')).toBe(0)
    expect(testState.throttleCancelCount).toBe(1)
    expect(testState.debounceCancelCount).toBe(1)

    vi.runAllTimers()
    expect(setBounds).not.toHaveBeenCalled()

    window.show()
    expect(testState.mainWindow.listenerCount('move')).toBe(1)
    expect(testState.mainWindow.listenerCount('resize')).toBe(1)

    setBounds.mockClear()
    testState.mainBounds = { x: 360, y: 180, width: 480, height: 180 }
    testState.mainWindow.emit('move')
    vi.runAllTimers()

    expect(setBounds).toHaveBeenCalled()
    expect(setBounds).toHaveBeenLastCalledWith(expect.objectContaining({ width: followedSize.width, height: followedSize.height }))
  })
})
