import type { CompanionCapabilities, CompanionEvent } from '@proj-airi/plugin-protocol/types'

import { describe, expect, it, vi } from 'vitest'

import { resolveCompanionReaction } from './resolver'
import { createReactionScheduler } from './scheduler'

const capabilities: CompanionCapabilities = {
  caption: true,
  motion: { live2d: true },
  voice: false,
  commands: [],
}

function event(overrides: Partial<CompanionEvent> = {}): CompanionEvent {
  return {
    id: 'event-1',
    source: 'test',
    topic: 'task.completed',
    intent: 'success',
    priority: 'normal',
    text: '完成',
    createdAt: Date.now(),
    ...overrides,
  }
}

describe('resolveCompanionReaction', () => {
  it('maps success to the semantic happy recipe', () => {
    expect(resolveCompanionReaction(event(), capabilities)).toEqual({
      eventId: 'event-1',
      text: '完成',
      showCaption: true,
      motion: 'semantic',
      semantic: 'happy',
      minimumDurationMs: 3000,
    })
  })

  it('maps warning and reminder to neutral and error to sad', () => {
    expect(resolveCompanionReaction(event({ id: 'warning', intent: 'warning' }), capabilities).semantic).toBe('neutral')
    expect(resolveCompanionReaction(event({ id: 'reminder', intent: 'reminder' }), capabilities).semantic).toBe('neutral')
    expect(resolveCompanionReaction(event({ id: 'error', intent: 'error' }), capabilities).semantic).toBe('sad')
  })

  it('accepts only named recipes and falls back to caption-only without motion', () => {
    expect(resolveCompanionReaction(event({ reactionHint: 'caption-neutral' }), capabilities).semantic).toBe('neutral')
    expect(resolveCompanionReaction(event({ reactionHint: 'caption-random', priority: 'low' }), capabilities).motion).toBe('random')
    expect(resolveCompanionReaction(event({ reactionHint: 'unknown' }), capabilities).semantic).toBe('happy')
    expect(resolveCompanionReaction(event(), { ...capabilities, motion: { live2d: false } })).toMatchObject({
      motion: 'none',
      semantic: undefined,
    })
  })
})

describe('createReactionScheduler', () => {
  it('starts normal items FIFO and starts the next item after completion', () => {
    const started: string[] = []
    const scheduler = createReactionScheduler({ onStart: item => started.push(item.event.id) })

    expect(scheduler.enqueue(event(), resolveCompanionReaction(event(), capabilities))).toMatchObject({ status: 'accepted' })
    expect(scheduler.enqueue(event({ id: 'event-2' }), resolveCompanionReaction(event({ id: 'event-2' }), capabilities))).toMatchObject({ status: 'accepted' })
    expect(started).toEqual(['event-1'])

    scheduler.complete('event-1')

    expect(started).toEqual(['event-1', 'event-2'])
    expect(scheduler.snapshot().records['event-1']).toMatchObject({ status: 'completed' })
  })

  it('lets critical interrupt current work and high interrupt only low work', () => {
    const interrupted: string[] = []
    const scheduler = createReactionScheduler({ onInterrupt: item => interrupted.push(item.event.id) })
    const low = event({ id: 'low', priority: 'low' })
    const normal = event({ id: 'normal', priority: 'normal' })

    scheduler.enqueue(low, resolveCompanionReaction(low, capabilities))
    scheduler.enqueue(event({ id: 'high', priority: 'high' }), resolveCompanionReaction(event({ id: 'high', priority: 'high' }), capabilities))
    expect(interrupted).toEqual(['low'])

    scheduler.complete('high')
    scheduler.enqueue(normal, resolveCompanionReaction(normal, capabilities))
    scheduler.enqueue(event({ id: 'critical', priority: 'critical' }), resolveCompanionReaction(event({ id: 'critical', priority: 'critical' }), capabilities))
    expect(interrupted).toEqual(['low', 'normal'])
  })

  it('coalesces queued events, deduplicates IDs and expires queued events', () => {
    vi.useFakeTimers()
    const scheduler = createReactionScheduler()
    const current = event({ id: 'current' })
    scheduler.enqueue(current, resolveCompanionReaction(current, capabilities))

    const queued = event({ id: 'queued', priority: 'normal', coalesceKey: 'task' })
    const replacement = event({ id: 'replacement', priority: 'normal', coalesceKey: 'task' })
    scheduler.enqueue(queued, resolveCompanionReaction(queued, capabilities))
    scheduler.enqueue(replacement, resolveCompanionReaction(replacement, capabilities))
    expect(scheduler.snapshot().records.queued).toMatchObject({ status: 'dropped', reason: 'superseded' })
    expect(scheduler.enqueue(current, resolveCompanionReaction(current, capabilities))).toMatchObject({ status: 'accepted' })

    vi.advanceTimersByTime(30_001)
    expect(scheduler.snapshot().records.replacement).toMatchObject({ status: 'dropped', reason: 'expired' })
    vi.useRealTimers()
  })

  it('cleans all owned timers when disposed', () => {
    vi.useFakeTimers()
    const scheduler = createReactionScheduler()
    const first = event({ id: 'first' })
    scheduler.enqueue(first, resolveCompanionReaction(first, capabilities))
    scheduler.dispose()
    vi.advanceTimersByTime(60_000)
    expect(scheduler.snapshot().records.first).toMatchObject({ status: 'dropped', reason: 'unavailable' })
    vi.useRealTimers()
  })
})
