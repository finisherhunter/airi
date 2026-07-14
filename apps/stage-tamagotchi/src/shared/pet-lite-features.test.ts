import { describe, expect, it } from 'vitest'

import { isPetLiteSettingsRouteVisible, petLiteDefaults, petLiteFeatures, petLiteRuntimeFeatures } from './pet-lite-features'

describe('pet lite feature policy', () => {
  it('keeps character and appearance capabilities available', () => {
    expect(petLiteFeatures.characterImport).toBe(true)
    expect(petLiteFeatures.appearanceSettings).toBe(true)
    expect(petLiteFeatures.notifications).toBe(true)
    expect(petLiteFeatures.developerTools).toBe(true)
    expect(petLiteFeatures.connectionStatus).toBe(false)
  })

  it('uses a fixed Chinese light-theme baseline for the pet shell', () => {
    expect(petLiteDefaults.language).toBe('zh-Hans')
    expect(petLiteDefaults.controlsIslandIconSize).toBe('small')
    expect(petLiteDefaults.analyticsEnabled).toBe(false)
    expect(petLiteDefaults.dark).toBe(false)
  })

  it('keeps the first backend stop batch reversible and inactive', () => {
    expect(petLiteRuntimeFeatures.chat).toBe(false)
    expect(petLiteRuntimeFeatures.hearing).toBe(false)
    expect(petLiteRuntimeFeatures.spotlight).toBe(false)
    expect(petLiteRuntimeFeatures.artistry).toBe(false)
    expect(petLiteRuntimeFeatures.mcp).toBe(false)
  })

  it('hides AI platform settings while preserving model and system settings', () => {
    expect(isPetLiteSettingsRouteVisible('/settings/providers')).toBe(false)
    expect(isPetLiteSettingsRouteVisible('/settings/modules')).toBe(false)
    expect(isPetLiteSettingsRouteVisible('/settings/memory')).toBe(false)
    expect(isPetLiteSettingsRouteVisible('/settings/connection')).toBe(false)
    expect(isPetLiteSettingsRouteVisible('/settings/data')).toBe(false)
    expect(isPetLiteSettingsRouteVisible('/settings/system/general')).toBe(false)
    expect(isPetLiteSettingsRouteVisible('/settings/system/color-scheme')).toBe(false)
    expect(isPetLiteSettingsRouteVisible('/settings/system/window-shortcuts')).toBe(false)
    expect(isPetLiteSettingsRouteVisible('/settings/models')).toBe(true)
    expect(isPetLiteSettingsRouteVisible('/settings/scene')).toBe(true)
    expect(isPetLiteSettingsRouteVisible('/settings/system')).toBe(true)
  })
})
