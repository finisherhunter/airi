import type { CompanionEvent, CompanionPriority } from '@proj-airi/plugin-protocol/types'

export type ReactionSemantic = 'neutral' | 'happy' | 'sad'
export type ReactionMotion = 'none' | 'random' | 'semantic'
export type ReactionRecipe = 'caption-only' | 'caption-random' | 'caption-neutral' | 'caption-happy' | 'caption-sad'

export interface ResolvedCompanionReaction {
  eventId: string
  text: string
  showCaption: boolean
  motion: ReactionMotion
  semantic?: ReactionSemantic
  minimumDurationMs: number
}

export interface ReactionQueueItem {
  event: CompanionEvent
  reaction: ResolvedCompanionReaction
  acceptedAt: number
}

export interface ReactionAck {
  eventId: string
  status: 'accepted' | 'completed' | 'dropped'
  reason?: 'expired' | 'invalid' | 'superseded' | 'unavailable' | 'duplicate'
}

export interface ReactionSchedulerOptions {
  now?: () => number
  onStart?: (item: ReactionQueueItem) => void
  onInterrupt?: (item: ReactionQueueItem) => void
}

export interface ReactionSchedulerSnapshot {
  current: string | null
  queued: string[]
  records: Record<string, ReactionAck>
}

export interface ReactionScheduler {
  enqueue(event: CompanionEvent, reaction: ResolvedCompanionReaction): ReactionAck
  complete(eventId: string): ReactionAck | undefined
  cancel(eventId: string, reason?: ReactionAck['reason']): ReactionAck | undefined
  dispose(): void
  snapshot(): ReactionSchedulerSnapshot
}

export const defaultReactionDurationMs = 3_000
export const defaultReactionTtlMs = 30_000

export function priorityRank(priority: CompanionPriority): number {
  switch (priority) {
    case 'critical': return 4
    case 'high': return 3
    case 'normal': return 2
    case 'low': return 1
  }
}
