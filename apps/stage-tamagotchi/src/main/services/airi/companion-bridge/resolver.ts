import type { CompanionCapabilities, CompanionEvent } from '@proj-airi/plugin-protocol/types'

import type { ReactionRecipe, ReactionSemantic, ResolvedCompanionReaction } from './contracts'
import { defaultReactionDurationMs } from './contracts'

const semanticByIntent: Record<CompanionEvent['intent'], ReactionSemantic> = {
  info: 'neutral',
  success: 'happy',
  warning: 'neutral',
  error: 'sad',
  reminder: 'neutral',
}

const semanticByRecipe: Record<Exclude<ReactionRecipe, 'caption-only' | 'caption-random'>, ReactionSemantic> = {
  'caption-neutral': 'neutral',
  'caption-happy': 'happy',
  'caption-sad': 'sad',
}

const knownRecipes = new Set<ReactionRecipe>([
  'caption-only',
  'caption-random',
  'caption-neutral',
  'caption-happy',
  'caption-sad',
])

function resolveRecipe(event: CompanionEvent): ReactionRecipe {
  if (event.reactionHint && knownRecipes.has(event.reactionHint as ReactionRecipe)) {
    return event.reactionHint as ReactionRecipe
  }

  return `caption-${semanticByIntent[event.intent]}` as ReactionRecipe
}

export function resolveCompanionReaction(
  event: CompanionEvent,
  capabilities: CompanionCapabilities,
): ResolvedCompanionReaction {
  const recipe = resolveRecipe(event)
  const hasCaption = capabilities.caption && event.text.trim().length > 0

  if (recipe === 'caption-only' || !capabilities.motion.live2d) {
    return {
      eventId: event.id,
      text: event.text,
      showCaption: hasCaption,
      motion: 'none',
      minimumDurationMs: defaultReactionDurationMs,
    }
  }

  if (recipe === 'caption-random') {
    return {
      eventId: event.id,
      text: event.text,
      showCaption: hasCaption,
      motion: 'random',
      minimumDurationMs: defaultReactionDurationMs,
    }
  }

  return {
    eventId: event.id,
    text: event.text,
    showCaption: hasCaption,
    motion: 'semantic',
    semantic: semanticByRecipe[recipe],
    minimumDurationMs: defaultReactionDurationMs,
  }
}
