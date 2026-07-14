import type { ClientOptions } from '@proj-airi/server-sdk'
import type { CompanionCapabilities, CompanionEvent, CompanionIntent, CompanionPriority } from '@proj-airi/plugin-protocol/types'
import type { WebSocketEventOptionalSource } from '@proj-airi/server-shared/types'
import type { Lifecycle } from 'injeca'

import { randomUUID } from 'node:crypto'
import { chmod, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { Client } from '@proj-airi/server-sdk'

import type { CompanionReactionRequest } from '../../../../shared/eventa'
import type { ReactionAck, ReactionQueueItem } from './contracts'
import { defaultReactionTtlMs } from './contracts'
import { resolveCompanionReaction } from './resolver'
import { createReactionScheduler } from './scheduler'

export const companionDiscoveryFileName = 'companion-bridge.json'
const companionProtocolVersion = 1
const maxCompanionTextLength = 2_048

type CompanionIncomingMessage = { data: { event: unknown } }

export interface CompanionBridgeClient {
  onEvent: (event: 'companion:event', callback: (message: CompanionIncomingMessage) => void | Promise<void>) => () => void
  send: (message: WebSocketEventOptionalSource) => boolean
  close: () => void
}

export type CompanionBridgeLifecycle = Pick<Lifecycle, 'appHooks'>

export interface CompanionBridgeRenderer {
  ensureReady: () => void | Promise<void>
  emit: (request: CompanionReactionRequest) => void
  dispose: () => void
}

export type CompanionReactionRenderer = CompanionBridgeRenderer

export interface CompanionBridgeServerChannel {
  getConnectionInfo: () => Promise<{ endpoint: string, token: string }>
}

export interface CompanionBridgeApp {
  getPath: (name: 'userData') => string
}

export interface CompanionBridgeServiceOptions {
  lifecycle: CompanionBridgeLifecycle
  app: CompanionBridgeApp
  serverChannel: CompanionBridgeServerChannel
  renderer: CompanionBridgeRenderer
  enabled?: boolean
  now?: () => number
  createClient?: (options: ClientOptions) => CompanionBridgeClient
}

export interface CompanionBridgeService {
  start: () => Promise<void>
  stop: () => Promise<void>
}

export type CompanionEventValidation
  = { event: CompanionEvent }
    | { eventId: string, reason: 'invalid' | 'expired' }

const capabilities: CompanionCapabilities = {
  caption: true,
  motion: { live2d: true },
  voice: false,
  commands: [],
}

function createDefaultClient(options: ClientOptions): CompanionBridgeClient {
  return new Client(options)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function isCompanionIntent(value: unknown): value is CompanionIntent {
  switch (value) {
    case 'info':
    case 'success':
    case 'warning':
    case 'error':
    case 'reminder':
      return true
    default:
      return false
  }
}

function isCompanionPriority(value: unknown): value is CompanionPriority {
  switch (value) {
    case 'critical':
    case 'high':
    case 'normal':
    case 'low':
      return true
    default:
      return false
  }
}

function getEventId(value: unknown): string {
  return isRecord(value) && typeof value.id === 'string' ? value.id : ''
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Validates and classifies an untrusted companion event before it reaches the
 * resolver or scheduler.
 */
export function validateCompanionEvent(value: unknown, now = Date.now()): CompanionEventValidation {
  const eventId = getEventId(value)
  if (!isRecord(value)) {
    return { eventId, reason: 'invalid' }
  }

  if (!isNonEmptyString(value.id)
    || !isNonEmptyString(value.source)
    || !isNonEmptyString(value.topic)
    || !isNonEmptyString(value.text)
    || value.text.length > maxCompanionTextLength
    || !isCompanionIntent(value.intent)
    || !isCompanionPriority(value.priority)
    || typeof value.createdAt !== 'number'
    || !Number.isFinite(value.createdAt)) {
    return { eventId, reason: 'invalid' }
  }

  if (value.reactionHint !== undefined && typeof value.reactionHint !== 'string') {
    return { eventId, reason: 'invalid' }
  }
  if (value.coalesceKey !== undefined && !isNonEmptyString(value.coalesceKey)) {
    return { eventId, reason: 'invalid' }
  }
  if (value.ttlMs !== undefined && (typeof value.ttlMs !== 'number' || !Number.isFinite(value.ttlMs) || value.ttlMs <= 0)) {
    return { eventId, reason: 'invalid' }
  }

  const event: CompanionEvent = {
    id: value.id,
    source: value.source,
    topic: value.topic,
    intent: value.intent,
    priority: value.priority,
    text: value.text,
    createdAt: value.createdAt,
    ...(value.reactionHint === undefined ? {} : { reactionHint: value.reactionHint }),
    ...(value.coalesceKey === undefined ? {} : { coalesceKey: value.coalesceKey }),
    ...(value.ttlMs === undefined ? {} : { ttlMs: value.ttlMs }),
  }

  const ttlMs = event.ttlMs ?? defaultReactionTtlMs
  return event.createdAt + ttlMs <= now
    ? { eventId: event.id, reason: 'expired' }
    : { event }
}

function createDiscoveryPayload(endpoint: string, token: string) {
  return {
    protocolVersion: companionProtocolVersion,
    endpoint,
    token,
    pid: process.pid,
  }
}

function createReactionRequest(item: ReactionQueueItem): CompanionReactionRequest {
  return {
    text: item.reaction.text,
    showCaption: item.reaction.showCaption,
    motion: item.reaction.motion,
    semantic: item.reaction.semantic,
  }
}

function createClearRequest(): CompanionReactionRequest {
  return { text: '', showCaption: true, motion: 'none' }
}

function ackKey(ack: ReactionAck): string {
  return `${ack.status}:${ack.reason ?? ''}`
}

/**
 * Owns the optional AIRI-side companion transport. The server itself is
 * started by the existing channel-server lifecycle; this service only reads
 * its resolved connection details, bridges protocol events, and cleans up its
 * client, renderer boundary, timers, and discovery record.
 */
export function createCompanionBridge(params: CompanionBridgeServiceOptions): CompanionBridgeService {
  const enabled = params.enabled ?? true
  const now = params.now ?? Date.now
  const createClient = params.createClient ?? createDefaultClient
  const discoveryPath = join(params.app.getPath('userData'), companionDiscoveryFileName)
  const schedulerTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const sentAckKeys = new Map<string, string>()
  const scheduler = createReactionScheduler({
    now,
    onStart: item => {
      void deliverReaction(item)
    },
    onInterrupt: (item) => {
      if (activeReactionId !== item.event.id) {
        return
      }

      clearActiveReactionTimer()
      activeReactionId = undefined
      if (running) {
        params.renderer.emit(createClearRequest())
      }
    },
  })

  let client: CompanionBridgeClient | undefined
  let removeEventListener: (() => void) | undefined
  let activeReactionId: string | undefined
  let activeReactionTimer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let starting = false
  let rendererDisposed = false

  function send(message: WebSocketEventOptionalSource) {
    client?.send(message)
  }

  function sendAck(ack: ReactionAck) {
    send({ type: 'companion:ack', data: { ack } })
    sentAckKeys.set(ack.eventId, ackKey(ack))
  }

  function flushSchedulerAcks() {
    for (const ack of Object.values(scheduler.snapshot().records)) {
      const key = ackKey(ack)
      if (sentAckKeys.get(ack.eventId) === key) {
        continue
      }
      sendAck(ack)
    }
  }

  function clearActiveReactionTimer() {
    if (activeReactionTimer) {
      clearTimeout(activeReactionTimer)
      activeReactionTimer = undefined
    }
  }

  function scheduleAckFlush(event: CompanionEvent) {
    const ttlMs = event.ttlMs ?? defaultReactionTtlMs
    const delay = Math.max(0, event.createdAt + ttlMs - now()) + 1
    const timer = setTimeout(() => {
      schedulerTimers.delete(event.id)
      flushSchedulerAcks()
    }, delay)
    schedulerTimers.set(event.id, timer)
  }

  async function deliverReaction(item: ReactionQueueItem) {
    if (!running) {
      return
    }

    try {
      await params.renderer.ensureReady()
      if (!running || scheduler.snapshot().current !== item.event.id) {
        return
      }

      params.renderer.emit(createReactionRequest(item))
      activeReactionId = item.event.id
      activeReactionTimer = setTimeout(() => {
        activeReactionTimer = undefined
        if (activeReactionId !== item.event.id) {
          return
        }
        activeReactionId = undefined
        scheduler.complete(item.event.id)
        flushSchedulerAcks()
      }, item.reaction.minimumDurationMs)
    }
    catch {
      scheduler.cancel(item.event.id, 'unavailable')
      flushSchedulerAcks()
    }
  }

  async function handleEvent(value: unknown) {
    const validation = validateCompanionEvent(value, now())
    if ('reason' in validation) {
      sendAck({ eventId: validation.eventId, status: 'dropped', reason: validation.reason })
      return
    }

    if (!client || !running) {
      sendAck({ eventId: validation.event.id, status: 'dropped', reason: 'unavailable' })
      return
    }

    const reaction = resolveCompanionReaction(validation.event, capabilities)
    const ack = scheduler.enqueue(validation.event, reaction)
    sendAck(ack)
    scheduleAckFlush(validation.event)
    flushSchedulerAcks()
  }

  function publishCapabilities() {
    send({ type: 'companion:capabilities', data: { capabilities } })
  }

  async function start() {
    if (!enabled || running || starting) {
      return
    }

    starting = true
    try {
      const connection = await params.serverChannel.getConnectionInfo()
      const discovery = JSON.stringify(createDiscoveryPayload(connection.endpoint, connection.token))
      const temporaryPath = `${discoveryPath}.${process.pid}.${randomUUID()}.tmp`
      await writeFile(temporaryPath, `${discovery}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, discoveryPath)
      try {
        await chmod(discoveryPath, 0o600)
      }
      catch {
        // Windows may ignore chmod; the atomic rename still avoids partial records.
      }

      running = true
      let createdClient: CompanionBridgeClient | undefined
      createdClient = createClient({
        url: connection.endpoint,
        name: 'airi-companion-bridge',
        token: connection.token,
        possibleEvents: ['companion:event', 'companion:ack', 'companion:capabilities'],
        autoConnect: true,
        autoReconnect: true,
        onReady: () => {
          if (running && client === createdClient) {
            publishCapabilities()
          }
        },
        onError: () => {
          // An absent Neko must not create a retry log storm in AIRI.
        },
        onClose: () => {},
      })
      client = createdClient
      removeEventListener = client.onEvent('companion:event', message => handleEvent(message.data.event))
    }
    catch {
      running = false
      client = undefined
      try {
        await unlink(discoveryPath)
      }
      catch {
        // Discovery may not have been installed when startup failed.
      }
    }
    finally {
      starting = false
    }
  }

  async function stop() {
    if (!running && !client && !starting && rendererDisposed) {
      return
    }

    if (activeReactionId && !rendererDisposed) {
      params.renderer.emit(createClearRequest())
    }
    running = false
    clearActiveReactionTimer()
    activeReactionId = undefined
    for (const timer of schedulerTimers.values()) {
      clearTimeout(timer)
    }
    schedulerTimers.clear()
    scheduler.dispose()
    flushSchedulerAcks()
    removeEventListener?.()
    removeEventListener = undefined
    client?.close()
    client = undefined
    if (!rendererDisposed) {
      params.renderer.dispose()
      rendererDisposed = true
    }

    try {
      await unlink(discoveryPath)
    }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
        throw error
      }
    }
  }

  if (enabled) {
    params.lifecycle.appHooks.onStart(start)
    params.lifecycle.appHooks.onStop(stop)
  }

  return { start, stop }
}
