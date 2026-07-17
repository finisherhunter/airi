import type { ClientOptions } from '@proj-airi/server-sdk'
import type { CompanionEvent } from '@proj-airi/plugin-protocol/types'

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { petLiteRuntimeFeatures } from '../../../../shared/pet-lite-features'
import { createCompanionBridge, companionDiscoveryFileName } from './service'
import type { CompanionBridgeClient, CompanionBridgeLifecycle, CompanionReactionRenderer } from './service'

function createEvent(overrides: Partial<CompanionEvent> = {}): CompanionEvent {
  return {
    id: 'event-1',
    source: 'test',
    topic: 'task.completed',
    intent: 'success',
    priority: 'normal',
    text: '完成',
    createdAt: 1_000,
    ...overrides,
  }
}

function createFakeClient() {
  let eventHandler: ((message: { data: { event: unknown } }) => void | Promise<void>) | undefined
  let options: ClientOptions | undefined

  const client: CompanionBridgeClient & {
    emitEvent: (event: unknown) => Promise<void>
    triggerReady: () => void
    options: () => ClientOptions | undefined
    sent: Array<{ type: string, data: unknown }>
  } = {
    sent: [],
    onEvent: (_event, handler) => {
      eventHandler = handler
      return () => {
        eventHandler = undefined
      }
    },
    send: (message) => {
      client.sent.push(message)
      return true
    },
    close: vi.fn(),
    emitEvent: async (event) => {
      await eventHandler?.({ data: { event } })
    },
    triggerReady: () => options?.onReady?.(),
    options: () => options,
  }

  return {
    client,
    createClient: (nextOptions: ClientOptions) => {
      options = nextOptions
      return client
    },
  }
}

function createLifecycle(): CompanionBridgeLifecycle {
  return {
    appHooks: {
      onStart: vi.fn(),
      onStop: vi.fn(),
    },
  }
}

function createRenderer(): CompanionReactionRenderer {
  return {
    ensureReady: vi.fn(async () => undefined),
    emit: vi.fn(),
    dispose: vi.fn(),
  }
}

describe('createCompanionBridge', () => {
  it('writes discovery atomically and removes it on stop', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'airi-companion-bridge-'))
    const fake = createFakeClient()
    const renderer = createRenderer()
    const service = createCompanionBridge({
      lifecycle: createLifecycle(),
      app: { getPath: () => userData },
      serverChannel: {
        getConnectionInfo: vi.fn(async () => ({
          endpoint: 'ws://127.0.0.1:6121/ws',
          token: 'configured-token',
        })),
      },
      renderer,
      createClient: fake.createClient,
      now: () => 1_000,
    })

    await service.start()
    fake.client.triggerReady()

    expect(fake.client.sent).toContainEqual({
      type: 'companion:capabilities',
      data: { capabilities: { caption: true, motion: { live2d: true }, voice: false, commands: [] } },
    })

    const discoveryPath = join(userData, companionDiscoveryFileName)
    const discovery = JSON.parse(await readFile(discoveryPath, 'utf8')) as {
      protocolVersion: number
      endpoint: string
      token: string
    }
    expect(discovery).toEqual({
      protocolVersion: 1,
      endpoint: 'ws://127.0.0.1:6121/ws',
      token: 'configured-token',
      pid: process.pid,
    })

    await service.stop()
    await expect(readFile(discoveryPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })

    await rm(userData, { recursive: true, force: true })
  })

  it('drops invalid events at the service boundary', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'airi-companion-bridge-'))
    const fake = createFakeClient()
    const service = createCompanionBridge({
      lifecycle: createLifecycle(),
      app: { getPath: () => userData },
      serverChannel: { getConnectionInfo: async () => ({ endpoint: 'ws://127.0.0.1:6121/ws', token: 'token' }) },
      renderer: createRenderer(),
      createClient: fake.createClient,
      now: () => 1_000,
    })

    await service.start()
    await fake.client.emitEvent(createEvent({ id: 'invalid', text: ' '.repeat(2_049) }))
    await fake.client.emitEvent(createEvent({ id: 'expired', createdAt: 0, ttlMs: 500 }))

    expect(fake.client.sent).toContainEqual({
      type: 'companion:ack',
      data: { ack: { eventId: 'invalid', status: 'dropped', reason: 'invalid' } },
    })
    expect(fake.client.sent).toContainEqual({
      type: 'companion:ack',
      data: { ack: { eventId: 'expired', status: 'dropped', reason: 'expired' } },
    })

    await service.stop()
    await rm(userData, { recursive: true, force: true })
  })

  it('keeps duplicate IDs idempotent while returning the recorded status', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'airi-companion-bridge-'))
    const fake = createFakeClient()
    const renderer = createRenderer()
    const service = createCompanionBridge({
      lifecycle: createLifecycle(),
      app: { getPath: () => userData },
      serverChannel: { getConnectionInfo: async () => ({ endpoint: 'ws://127.0.0.1:6121/ws', token: 'token' }) },
      renderer,
      createClient: fake.createClient,
      now: () => 1_000,
    })

    await service.start()
    const event = createEvent()
    await fake.client.emitEvent(event)
    await fake.client.emitEvent(event)

    expect(renderer.emit).toHaveBeenCalledTimes(1)
    expect(fake.client.sent).toContainEqual({
      type: 'companion:ack',
      data: { ack: { eventId: 'event-1', status: 'accepted' } },
    })
    expect(fake.client.sent).toContainEqual({
      type: 'companion:ack',
      data: { ack: { eventId: 'event-1', status: 'accepted', reason: 'duplicate' } },
    })

    await service.stop()
    await rm(userData, { recursive: true, force: true })
  })

  it('disposes the client, renderer boundary, and lifecycle listeners on stop', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'airi-companion-bridge-'))
    const fake = createFakeClient()
    const renderer = createRenderer()
    const lifecycle = createLifecycle()
    const service = createCompanionBridge({
      lifecycle,
      app: { getPath: () => userData },
      serverChannel: { getConnectionInfo: async () => ({ endpoint: 'ws://127.0.0.1:6121/ws', token: 'token' }) },
      renderer,
      createClient: fake.createClient,
      now: () => 1_000,
    })

    await service.start()
    await service.stop()

    expect(fake.client.close).toHaveBeenCalledOnce()
    expect(renderer.dispose).toHaveBeenCalledOnce()
    expect(lifecycle.appHooks.onStart).toHaveBeenCalledOnce()
    expect(lifecycle.appHooks.onStop).toHaveBeenCalledOnce()

    await rm(userData, { recursive: true, force: true })
  })

  it('only enables the companion bridge in Pet Lite runtime features', () => {
    expect(petLiteRuntimeFeatures.companionBridge).toBe(true)
    expect(petLiteRuntimeFeatures.chat).toBe(false)
    expect(petLiteRuntimeFeatures.hearing).toBe(false)
    expect(petLiteRuntimeFeatures.mcp).toBe(false)
    expect(petLiteRuntimeFeatures.artistry).toBe(false)
  })
})
