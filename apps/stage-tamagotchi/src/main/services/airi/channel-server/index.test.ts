import { Mutex } from 'async-mutex'
import { describe, expect, it, vi } from 'vitest'

import { registerServerChannelLifecycle } from './index'

describe('registerServerChannelLifecycle', () => {
  it('does not register server hooks when channel server runtime is disabled', () => {
    const lifecycle = {
      appHooks: {
        onStart: vi.fn(),
        onStop: vi.fn(),
      },
    }

    registerServerChannelLifecycle({
      lifecycle,
      serverChannel: {
        start: vi.fn(),
        stop: vi.fn(),
      },
      mutex: new Mutex(),
      enabled: false,
    })

    expect(lifecycle.appHooks.onStart).not.toHaveBeenCalled()
    expect(lifecycle.appHooks.onStop).not.toHaveBeenCalled()
  })
})
