import { describe, expect, it, vi } from 'vitest'

import type { CaptionChannelEvent, CompanionReactionRequest } from '../../shared/eventa'
import { useCaptionItems } from './useCaptionItems'
import { createCompanionReactionHandler } from './companion-reaction'

describe('caption-companion presentation', () => {
  it('replaces only the previous bridge caption and expires after ten seconds', () => {
    vi.useFakeTimers()

    try {
      const captions = useCaptionItems({ ttlMs: 10_000 })

      captions.add({ type: 'caption-speaker', text: 'speaker' })
      captions.add({ type: 'caption-assistant', text: 'assistant' })
      captions.add({ type: 'caption-companion', text: 'first bridge' })
      captions.add({ type: 'caption-companion', text: 'second bridge' })

      expect(captions.items.value).toEqual([
        expect.objectContaining({ type: 'caption-speaker', text: 'speaker' }),
        expect.objectContaining({ type: 'caption-assistant', text: 'assistant' }),
        expect.objectContaining({ type: 'caption-companion', text: 'second bridge' }),
      ])

      vi.advanceTimersByTime(9_999)
      expect(captions.items.value).toHaveLength(3)

      vi.advanceTimersByTime(1)
      expect(captions.items.value).toEqual([
        expect.objectContaining({ type: 'caption-speaker', text: 'speaker' }),
        expect.objectContaining({ type: 'caption-assistant', text: 'assistant' }),
      ])
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('clears an empty bridge caption without clearing speaker or assistant captions', () => {
    const captions = useCaptionItems()

    captions.add({ type: 'caption-speaker', text: 'speaker' })
    captions.add({ type: 'caption-assistant', text: 'assistant' })
    captions.add({ type: 'caption-companion', text: 'bridge' })
    captions.add({ type: 'caption-companion', text: ' ' })

    expect(captions.items.value.map(item => item.text)).toEqual(['speaker', 'assistant'])
  })
})

function createHandler(overrides: Partial<Parameters<typeof createCompanionReactionHandler>[0]> = {}) {
  const postCaption = vi.fn<(event: CaptionChannelEvent) => void>()
  const setMotion = vi.fn<(motion: { group: string, index: number }) => void>()
  const handler = createCompanionReactionHandler({
    getRenderer: () => 'live2d',
    hasMotionProfile: () => true,
    postCaption,
    setMotion,
    random: () => 0,
    ...overrides,
  })

  return { handler, postCaption, setMotion }
}

describe('createCompanionReactionHandler', () => {
  it.each([
    ['happy', { group: 'Tap', index: 1 }],
    ['sad', { group: 'Flick@Body', index: 0 }],
    ['neutral', { group: 'Flick', index: 0 }],
  ] as const)('maps semantic %s to its internal Hiyori action', (semantic, motion) => {
    const { handler, postCaption, setMotion } = createHandler()
    const request: CompanionReactionRequest = {
      text: `${semantic} reaction`,
      showCaption: true,
      motion: 'semantic',
      semantic,
    }

    handler(request)

    expect(postCaption).toHaveBeenCalledWith({ type: 'caption-companion', text: `${semantic} reaction` })
    expect(setMotion).toHaveBeenCalledWith(motion)
  })

  it('does not repeat the same random action twice in a row', () => {
    const { handler, setMotion } = createHandler({ random: () => 0 })
    const request: CompanionReactionRequest = { text: 'random', showCaption: false, motion: 'random' }

    handler(request)
    handler(request)

    expect(setMotion.mock.calls.map(([motion]) => motion)).toEqual([
      { group: 'Tap', index: 1 },
      { group: 'Flick@Body', index: 0 },
    ])
  })

  it('shows the caption but skips motion for a non-Live2D model', () => {
    const { handler, postCaption, setMotion } = createHandler({ getRenderer: () => 'vrm' })

    handler({ text: 'caption only', showCaption: true, motion: 'semantic', semantic: 'happy' })

    expect(postCaption).toHaveBeenCalledWith({ type: 'caption-companion', text: 'caption only' })
    expect(setMotion).not.toHaveBeenCalled()
  })

  it('shows the caption but skips motion when the internal profile is unavailable', () => {
    const { handler, postCaption, setMotion } = createHandler({ hasMotionProfile: () => false })

    handler({ text: 'unknown profile', showCaption: true, motion: 'random' })

    expect(postCaption).toHaveBeenCalledWith({ type: 'caption-companion', text: 'unknown profile' })
    expect(setMotion).not.toHaveBeenCalled()
  })
})
