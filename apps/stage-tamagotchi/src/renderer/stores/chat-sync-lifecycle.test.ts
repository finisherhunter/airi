import { beforeEach, describe, expect, it, vi } from 'vitest'

const chatSyncStoreMock = vi.hoisted(() => ({
  dispose: vi.fn(),
  initialize: vi.fn(),
}))

const useChatSyncStoreMock = vi.hoisted(() => vi.fn(() => chatSyncStoreMock))

vi.mock('./chat-sync', () => ({
  useChatSyncStore: useChatSyncStoreMock,
}))

describe('createChatSyncWindowLifecycle', async () => {
  const {
    createChatSyncWindowLifecycle,
    resolveInitialChatSyncRoutePath,
  } = await import('./chat-sync-lifecycle')

  beforeEach(() => {
    chatSyncStoreMock.dispose.mockClear()
    chatSyncStoreMock.initialize.mockClear()
    useChatSyncStoreMock.mockClear()
  })

  it('issue #1743: keeps main window chat sync owned by the renderer root', () => {
    // https://github.com/moeru-ai/airi/issues/1743
    const lifecycle = createChatSyncWindowLifecycle('/', '')

    lifecycle.initialize()
    lifecycle.dispose()

    expect(chatSyncStoreMock.initialize).toHaveBeenCalledWith('authority')
    expect(chatSyncStoreMock.dispose).toHaveBeenCalledTimes(1)
  })

  it('issue #1743: resolves chat windows from the initial hash before router readiness', () => {
    // https://github.com/moeru-ai/airi/issues/1743
    const lifecycle = createChatSyncWindowLifecycle('/', '#/chat')

    lifecycle.initialize()
    lifecycle.dispose()

    expect(chatSyncStoreMock.initialize).toHaveBeenCalledWith('follower')
    expect(chatSyncStoreMock.dispose).toHaveBeenCalledTimes(1)
  })

  it('resolves spotlight windows as followers', () => {
    const lifecycle = createChatSyncWindowLifecycle('/', '#/spotlight')

    lifecycle.initialize()
    lifecycle.dispose()

    expect(chatSyncStoreMock.initialize).toHaveBeenCalledWith('follower')
    expect(chatSyncStoreMock.dispose).toHaveBeenCalledTimes(1)
  })

  it('skips chat sync store setup when the chat runtime is disabled', () => {
    // ROOT CAUSE:
    //
    // App.vue used to obtain and initialize the chat sync store for every
    // main-window startup, even when both chat and hearing were disabled.
    // That assembled the chat store graph before any chat-capable path existed.
    //
    // The lifecycle now gates store creation while keeping its default enabled
    // behavior for restored chat/hearing runtimes.
    const lifecycle = createChatSyncWindowLifecycle('/', '', false)

    lifecycle.initialize()
    lifecycle.dispose()

    expect(useChatSyncStoreMock).not.toHaveBeenCalled()
    expect(chatSyncStoreMock.initialize).not.toHaveBeenCalled()
    expect(chatSyncStoreMock.dispose).not.toHaveBeenCalled()
  })

  it('does not initialize chat sync for unrelated windows', () => {
    const lifecycle = createChatSyncWindowLifecycle('/', '#/widgets')

    lifecycle.initialize()
    lifecycle.dispose()

    expect(chatSyncStoreMock.initialize).not.toHaveBeenCalled()
    expect(chatSyncStoreMock.dispose).not.toHaveBeenCalled()
  })

  it('does not initialize chat sync for settings windows', () => {
    const lifecycle = createChatSyncWindowLifecycle('/', '#/settings')

    lifecycle.initialize()
    lifecycle.dispose()

    expect(chatSyncStoreMock.initialize).not.toHaveBeenCalled()
    expect(chatSyncStoreMock.dispose).not.toHaveBeenCalled()
  })

  it('does not initialize chat sync for nested settings windows', () => {
    const lifecycle = createChatSyncWindowLifecycle('/', '#/settings/unrelated')

    lifecycle.initialize()
    lifecycle.dispose()

    expect(chatSyncStoreMock.initialize).not.toHaveBeenCalled()
    expect(chatSyncStoreMock.dispose).not.toHaveBeenCalled()
  })

  it('normalizes hash query strings when resolving the initial route', () => {
    expect(resolveInitialChatSyncRoutePath('/', '#/chat?source=tray')).toBe('/chat')
  })
})
