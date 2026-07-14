import type { CaptionChannelEvent, CompanionReactionRequest } from '../../shared/eventa'

interface CompanionMotion {
  group: string
  index: number
}

interface CompanionReactionHandlerOptions {
  getRenderer: () => string | undefined
  hasMotionProfile: () => boolean
  postCaption: (event: CaptionChannelEvent) => void
  setMotion: (motion: CompanionMotion) => void
  random?: () => number
}

const hiyoriMotions: CompanionMotion[] = [
  { group: 'Tap', index: 1 },
  { group: 'Flick@Body', index: 0 },
  { group: 'Flick', index: 0 },
]

/**
 * Handles one renderer-side companion reaction.
 *
 * Eventa carries only semantic fields. Concrete Live2D group/index values stay
 * inside this adapter and are sent only to the existing motion store.
 */
export function createCompanionReactionHandler(options: CompanionReactionHandlerOptions) {
  const random = options.random ?? Math.random
  let lastRandomMotion = -1

  function selectRandomMotion() {
    const requestedIndex = Math.min(hiyoriMotions.length - 1, Math.floor(random() * hiyoriMotions.length))
    const selectedIndex = requestedIndex === lastRandomMotion
      ? (requestedIndex + 1) % hiyoriMotions.length
      : requestedIndex
    lastRandomMotion = selectedIndex
    return hiyoriMotions[selectedIndex]!
  }

  return (request: CompanionReactionRequest) => {
    options.postCaption({
      type: 'caption-companion',
      text: request.showCaption ? request.text : '',
    })

    if (request.motion === 'none' || options.getRenderer() !== 'live2d' || !options.hasMotionProfile())
      return

    if (request.motion === 'semantic') {
      const motion = request.semantic === 'happy'
        ? hiyoriMotions[0]
        : request.semantic === 'sad'
          ? hiyoriMotions[1]
          : request.semantic === 'neutral'
            ? hiyoriMotions[2]
            : undefined
      if (motion)
        options.setMotion(motion)
      return
    }

    options.setMotion(selectRandomMotion())
  }
}
