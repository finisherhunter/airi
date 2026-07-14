export const petLiteFeatures = {
  characterImport: true,
  appearanceSettings: true,
  notifications: true,
  developerTools: true,
  connectionStatus: false,
  chat: false,
  hearing: false,
  authentication: false,
} as const

export const petLiteDefaults = {
  language: 'zh-Hans',
  controlsIslandIconSize: 'small',
  analyticsEnabled: false,
  dark: false,
} as const

const hiddenSettingsRoutes = new Set([
  '/settings/providers',
  '/settings/modules',
  '/settings/memory',
  '/settings/connection',
  '/settings/data',
  '/settings/system/general',
  '/settings/system/color-scheme',
  '/settings/system/window-shortcuts',
])

export function isPetLiteSettingsRouteVisible(path: string) {
  return !hiddenSettingsRoutes.has(path)
}
