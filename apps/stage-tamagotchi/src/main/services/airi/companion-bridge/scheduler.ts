import type { CompanionEvent } from '@proj-airi/plugin-protocol/types'

import type {
  ReactionAck,
  ReactionQueueItem,
  ReactionScheduler,
  ReactionSchedulerOptions,
  ReactionSchedulerSnapshot,
  ResolvedCompanionReaction,
} from './contracts'
import { defaultReactionTtlMs, priorityRank } from './contracts'

interface ScheduledItem extends ReactionQueueItem {
  expiryTimer?: ReturnType<typeof setTimeout>
}

function isExpired(event: CompanionEvent, now: number): boolean {
  const ttlMs = event.ttlMs ?? defaultReactionTtlMs
  return event.createdAt + ttlMs <= now
}

export function createReactionScheduler(options: ReactionSchedulerOptions = {}): ReactionScheduler {
  const now = options.now ?? Date.now
  const queue: ScheduledItem[] = []
  const records = new Map<string, ReactionAck>()
  let current: ScheduledItem | undefined
  let disposed = false

  const clearItemTimer = (item: ScheduledItem) => {
    if (item.expiryTimer) {
      clearTimeout(item.expiryTimer)
      item.expiryTimer = undefined
    }
  }

  const recordDropped = (item: ScheduledItem, reason: ReactionAck['reason']): ReactionAck => {
    clearItemTimer(item)
    const ack: ReactionAck = { eventId: item.event.id, status: 'dropped', reason }
    records.set(item.event.id, ack)
    return ack
  }

  const startNext = () => {
    if (disposed || current || queue.length === 0) return

    while (queue.length > 0) {
      const next = queue.shift()!
      clearItemTimer(next)
      if (isExpired(next.event, now())) {
        recordDropped(next, 'expired')
        continue
      }

      current = next
      options.onStart?.(next)
      return
    }
  }

  const dropQueuedByKey = (coalesceKey: string) => {
    for (let index = queue.length - 1; index >= 0; index--) {
      if (queue[index].event.coalesceKey === coalesceKey) {
        recordDropped(queue[index], 'superseded')
        queue.splice(index, 1)
      }
    }
  }

  const interruptCurrent = () => {
    if (!current) return
    options.onInterrupt?.(current)
    recordDropped(current, 'superseded')
    current = undefined
  }

  const enqueue = (event: CompanionEvent, reaction: ResolvedCompanionReaction): ReactionAck => {
    const existing = records.get(event.id)
    if (existing) return { ...existing, reason: 'duplicate' }

    if (disposed || isExpired(event, now())) {
      return recordDropped({ event, reaction, acceptedAt: now() }, 'expired')
    }

    const item: ScheduledItem = { event, reaction, acceptedAt: now() }
    records.set(event.id, { eventId: event.id, status: 'accepted' })

    if (event.coalesceKey) dropQueuedByKey(event.coalesceKey)

    const currentRank = current ? priorityRank(current.event.priority) : 0
    const incomingRank = priorityRank(event.priority)
    const shouldInterrupt = current && (event.priority === 'critical' || (event.priority === 'high' && current.event.priority === 'low'))

    if (shouldInterrupt) interruptCurrent()

    if (!current && (incomingRank >= currentRank || event.priority === 'low')) {
      current = item
      options.onStart?.(item)
    }
    else {
      queue.push(item)
    }

    const ttlMs = event.ttlMs ?? defaultReactionTtlMs
    item.expiryTimer = setTimeout(() => {
      if (current?.event.id === event.id) return
      const index = queue.findIndex(queued => queued.event.id === event.id)
      if (index >= 0) queue.splice(index, 1)
      if (records.get(event.id)?.status === 'accepted') recordDropped(item, 'expired')
    }, Math.max(0, event.createdAt + ttlMs - now()))

    return { eventId: event.id, status: 'accepted' }
  }

  const complete = (eventId: string): ReactionAck | undefined => {
    if (current?.event.id !== eventId) return records.get(eventId)
    const item = current
    current = undefined
    clearItemTimer(item)
    const ack: ReactionAck = { eventId, status: 'completed' }
    records.set(eventId, ack)
    startNext()
    return ack
  }

  const cancel = (eventId: string, reason: ReactionAck['reason'] = 'unavailable'): ReactionAck | undefined => {
    if (current?.event.id === eventId) {
      const item = current
      options.onInterrupt?.(item)
      current = undefined
      const ack = recordDropped(item, reason)
      startNext()
      return ack
    }

    const index = queue.findIndex(item => item.event.id === eventId)
    if (index < 0) return records.get(eventId)
    const [item] = queue.splice(index, 1)
    return recordDropped(item, reason)
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (current) {
      options.onInterrupt?.(current)
      recordDropped(current, 'unavailable')
      current = undefined
    }
    for (const item of queue.splice(0)) recordDropped(item, 'unavailable')
  }

  const snapshot = (): ReactionSchedulerSnapshot => ({
    current: current?.event.id ?? null,
    queued: queue.map(item => item.event.id),
    records: Object.fromEntries(Array.from(records.entries()).map(([id, ack]) => [id, { ...ack }])),
  })

  return { enqueue, complete, cancel, dispose, snapshot }
}
