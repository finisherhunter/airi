import { useChatSyncStore } from './chat-sync'

type ChatSyncWindowRole = 'authority' | 'follower'

function normalizeRoutePath(routePath: string) {
  const [path = ''] = routePath.split(/[?#]/)
  return path || '/'
}

/**
 * Resolves hash routes before Vue Router hydrates `route.path`.
 */
export function resolveInitialChatSyncRoutePath(routePath: string, hash = globalThis.location?.hash ?? '') {
  const hashPath = hash.startsWith('#') ? hash.slice(1) : ''
  return normalizeRoutePath(hashPath || routePath)
}

function resolveChatSyncWindowRole(routePath: string): ChatSyncWindowRole | null {
  const path = normalizeRoutePath(routePath)
  if (path === '/')
    return 'authority'
  if (path === '/chat' || path === '/spotlight')
    return 'follower'
  return null
}

/**
 * Owns chat-sync BroadcastChannel lifecycle for one Electron renderer window.
 *
 * The role is captured from the initial window route and must be initialized
 * from the renderer root. Route pages should not dispose the channel because
 * in-window navigation can unmount them while the BrowserWindow is still alive.
 */
export function createChatSyncWindowLifecycle(routePath: string, hash?: string, enabled = true) {
  const role = enabled ? resolveChatSyncWindowRole(resolveInitialChatSyncRoutePath(routePath, hash)) : null
  let chatSyncStore: ReturnType<typeof useChatSyncStore> | undefined

  return {
    role,
    initialize() {
      if (!role)
        return

      chatSyncStore ??= useChatSyncStore()
      chatSyncStore.initialize(role)
    },
    dispose() {
      if (chatSyncStore)
        chatSyncStore.dispose()
    },
  }
}
