import { describe, expect, it } from 'vitest'

import {
  companionAck,
  companionCapabilities,
  companionEvent,
} from '../src/types/events'
import type {
  CompanionAck,
  CompanionCapabilities,
  CompanionEvent,
  CompanionIntent,
  CompanionPriority,
  ProtocolEventOf,
  ProtocolEvents,
} from '../src/types/events'

const successEvent = {
  id: 'event-success',
  source: 'airi',
  topic: 'task',
  intent: 'success',
  priority: 'normal',
  text: 'Task completed',
  createdAt: 1_700_000_000_000,
} satisfies CompanionEvent

const errorEvent = {
  id: 'event-error',
  source: 'airi',
  topic: 'task',
  intent: 'error',
  priority: 'high',
  text: 'Task failed',
  reactionHint: 'concerned',
  coalesceKey: 'task:latest',
  ttlMs: 30_000,
  createdAt: 1_700_000_000_001,
} satisfies CompanionEvent

const reminderEvent = {
  id: 'event-reminder',
  source: 'neko',
  topic: 'maintenance',
  intent: 'reminder',
  priority: 'low',
  text: 'Remember to check the device',
  createdAt: 1_700_000_000_002,
} satisfies CompanionEvent

const validCompanionIntents: CompanionIntent[] = ['info', 'success', 'warning', 'error', 'reminder']
const validCompanionPriorities: CompanionPriority[] = ['critical', 'high', 'normal', 'low']

// @ts-expect-error Companion intents are restricted to the shared protocol literals.
const invalidCompanionIntent: CompanionIntent = 'chat'
// @ts-expect-error Companion priorities are restricted to the shared protocol literals.
const invalidCompanionPriority: CompanionPriority = 'urgent'

const validAckStatuses: CompanionAck['status'][] = ['accepted', 'completed', 'dropped']
const validAckReasons: NonNullable<CompanionAck['reason']>[] = [
  'expired',
  'invalid',
  'superseded',
  'unavailable',
  'duplicate',
]

// @ts-expect-error ACK statuses are restricted to the shared protocol literals.
const invalidAckStatus: CompanionAck['status'] = 'pending'
// @ts-expect-error ACK reasons are restricted to the shared protocol literals.
const invalidAckReason: NonNullable<CompanionAck['reason']> = 'timeout'

const companionEventPayloads: ProtocolEventOf<'companion:event'>[] = [
  { event: successEvent },
  { event: errorEvent },
  { event: reminderEvent },
]

const companionAckPayloads: ProtocolEventOf<'companion:ack'>[] = validAckStatuses.map(status => ({
  ack: { eventId: 'event-success', status },
}))

const companionCapabilitiesPayload: ProtocolEventOf<'companion:capabilities'> = {
  capabilities: {
    caption: true,
    motion: { live2d: true },
    voice: false,
    commands: ['wave'],
  } satisfies CompanionCapabilities,
}

type CompanionProtocolEventName = Extract<keyof ProtocolEvents, `companion:${string}`>
const companionProtocolEventNames: CompanionProtocolEventName[] = [
  'companion:event',
  'companion:ack',
  'companion:capabilities',
]

describe('companion protocol events', () => {
  it('accepts success, error, and reminder event payloads', () => {
    expect(companionEventPayloads.map(payload => payload.event.intent)).toEqual(['success', 'error', 'reminder'])
  })

  it('keeps intent and priority values constrained to the shared literals', () => {
    expect(validCompanionIntents).toHaveLength(5)
    expect(validCompanionPriorities).toHaveLength(4)
  })

  it('keeps ACK statuses and reasons constrained to the shared literals', () => {
    expect(companionAckPayloads.map(payload => payload.ack.status)).toEqual(['accepted', 'completed', 'dropped'])
    expect(validAckReasons).toHaveLength(5)
  })

  it('registers the companion events and maps their payloads through ProtocolEventOf', () => {
    expect([companionEvent.id, companionAck.id, companionCapabilities.id]).toEqual([
      'companion:event',
      'companion:ack',
      'companion:capabilities',
    ])
    expect(companionProtocolEventNames).toEqual([
      'companion:event',
      'companion:ack',
      'companion:capabilities',
    ])
    expect(companionCapabilitiesPayload.capabilities.motion.live2d).toBe(true)
  })
})
