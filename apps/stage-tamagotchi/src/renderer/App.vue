<script setup lang="ts">
import { defineInvokeHandler } from '@moeru/eventa'
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { themeColorFromValue, useThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { artistrySyncConfig } from '@proj-airi/stage-shared'
import { ToasterRoot } from '@proj-airi/stage-ui/components'
import { useInferencePreload } from '@proj-airi/stage-ui/composables'
import { useSharedAnalyticsStore } from '@proj-airi/stage-ui/stores/analytics'
import { useCharacterOrchestratorStore } from '@proj-airi/stage-ui/stores/character'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { usePluginHostInspectorStore } from '@proj-airi/stage-ui/stores/devtools/plugin-host-debug'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { useContextBridgeStore } from '@proj-airi/stage-ui/stores/mods/api/context-bridge'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { usePerfTracerBridgeStore } from '@proj-airi/stage-ui/stores/perf-tracer-bridge'
import { listProvidersForPluginHost, shouldPublishPluginHostCapabilities } from '@proj-airi/stage-ui/stores/plugin-host-capabilities'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import ResizeHandler from './components/ResizeHandler.vue'

import {
  electronGetServerChannelConfig,
  electronSettingsNavigate,
  electronStartTrackMousePosition,
  i18nGetLocale,
  i18nSetLocale,
} from '../shared/eventa'
import {
  electronPluginUpdateCapability,
  pluginProtocolListProviders,
  pluginProtocolListProvidersEventName,
} from '../shared/eventa/plugin/capabilities'
import {
  electronPluginInspect,
  electronPluginList,
  electronPluginLoad,
  electronPluginLoadEnabled,
  electronPluginSetAutoReload,
  electronPluginSetEnabled,
  electronPluginUnload,
} from '../shared/eventa/plugin/host'
import { electronPluginToolsChanged } from '../shared/eventa/plugin/tools'
import { petLiteDefaults, petLiteRuntimeFeatures } from '../shared/pet-lite-features'
import { initializeElectronAuthCallbackBridge } from './bridges/electron-auth-callback'
import { initializeStageThreeRuntimeTraceBridge } from './bridges/stage-three-runtime-trace'
import { useLanguage } from './composables/use-language'
import { createChatSyncWindowLifecycle, resolveInitialChatSyncRoutePath } from './stores/chat-sync-lifecycle'
import { useTamagotchiMcpToolsStore } from './stores/mcp-tools'
import { useTamagotchiPluginToolsStore } from './stores/plugin-tools'
import { useServerChannelSettingsStore } from './stores/settings/server-channel'
import { useStageWindowLifecycleStore } from './stores/stage-window-lifecycle'

const { isDark: dark } = useTheme()
const settingsStore = useSettings()
const { language, themeColorsHue, themeColorsHueDynamic } = storeToRefs(settingsStore)

dark.value = petLiteDefaults.dark
language.value = petLiteDefaults.language
settingsStore.controlsIslandIconSize = petLiteDefaults.controlsIslandIconSize
settingsStore.analyticsEnabled = petLiteDefaults.analyticsEnabled
const router = useRouter()
const route = useRoute()
const context = useElectronEventaContext()
const getMainLocale = useElectronEventaInvoke(i18nGetLocale)
const setLocale = useElectronEventaInvoke(i18nSetLocale)
const initialWindowRoutePath = resolveInitialChatSyncRoutePath(route.path)
const isSpotlightWindowRoute = initialWindowRoutePath === '/spotlight'
const isCaptionWindowRoute = initialWindowRoutePath === '/caption' || route.path === '/caption'
const chatRuntimeEnabled = petLiteRuntimeFeatures.chat || petLiteRuntimeFeatures.hearing
const chatSessionStore = chatRuntimeEnabled && !isCaptionWindowRoute ? useChatSessionStore() : undefined
const chatSyncLifecycle = createChatSyncWindowLifecycle(route.path, undefined, chatRuntimeEnabled)
const isSettingsWindowRoute = initialWindowRoutePath.startsWith('/settings')

function createFullStageRuntime() {
  const contextBridgeStore = useContextBridgeStore()
  const displayModelsStore = useDisplayModelsStore()
  const serverChannelSettingsStore = useServerChannelSettingsStore()
  const cardStore = useAiriCardStore()
  const serverChannelStore = useModsServerChannelStore()
  const characterOrchestratorStore = useCharacterOrchestratorStore()
  const analyticsStore = useSharedAnalyticsStore()
  // Local inference preload only supports the chat/hearing runtime paths.
  const inferencePreload = petLiteRuntimeFeatures.chat || petLiteRuntimeFeatures.hearing
    ? useInferencePreload()
    : undefined
  const pluginHostInspectorStore = usePluginHostInspectorStore()
  const mcpToolsStore = petLiteRuntimeFeatures.mcp ? useTamagotchiMcpToolsStore() : undefined
  const pluginToolsStore = useTamagotchiPluginToolsStore()
  const stageWindowLifecycleStore = useStageWindowLifecycleStore()
  const settingsAudioDeviceStore = useSettingsAudioDevice()
  const getServerChannelConfig = useElectronEventaInvoke(electronGetServerChannelConfig)
  const listPlugins = useElectronEventaInvoke(electronPluginList)
  const setPluginEnabled = useElectronEventaInvoke(electronPluginSetEnabled)
  const setPluginAutoReload = useElectronEventaInvoke(electronPluginSetAutoReload)
  const loadEnabledPlugins = useElectronEventaInvoke(electronPluginLoadEnabled)
  const loadPlugin = useElectronEventaInvoke(electronPluginLoad)
  const unloadPlugin = useElectronEventaInvoke(electronPluginUnload)
  const inspectPluginHost = useElectronEventaInvoke(electronPluginInspect)
  const startTrackingCursorPoint = useElectronEventaInvoke(electronStartTrackMousePosition)
  const reportPluginCapability = useElectronEventaInvoke(electronPluginUpdateCapability)
  const syncArtistryConfig = useElectronEventaInvoke(artistrySyncConfig)
  const isAuxiliaryChatRoute = initialWindowRoutePath === '/chat'
  const isWidgetsWindowRoute = () => route.path === '/widgets'

  async function refreshPluginRuntimeTools() {
    try {
      await pluginToolsStore.refresh()
    }
    catch (error) {
      console.warn('[App] Failed to refresh plugin runtime tools:', error)
    }
  }

  usePerfTracerBridgeStore()
  initializeStageThreeRuntimeTraceBridge()
  initializeElectronAuthCallbackBridge()
  void stageWindowLifecycleStore.initializeWindowLifecycleBridge()

  watch(() => route.path, () => {
    contextBridgeStore.setSparkNotifyHostRole(isWidgetsWindowRoute() ? 'client' : 'main')
  }, { immediate: true })

  // NOTICE: register plugin host bridge during setup to avoid race with pages using it in immediate watchers.
  pluginHostInspectorStore.setBridge({
    list: () => listPlugins(),
    setEnabled: async (payload) => {
      const result = await setPluginEnabled(payload)
      await refreshPluginRuntimeTools()
      return result
    },
    setAutoReload: payload => setPluginAutoReload(payload),
    loadEnabled: async () => {
      const result = await loadEnabledPlugins()
      await refreshPluginRuntimeTools()
      return result
    },
    load: async (payload) => {
      const result = await loadPlugin(payload)
      await refreshPluginRuntimeTools()
      return result
    },
    unload: async (payload) => {
      const result = await unloadPlugin(payload)
      await refreshPluginRuntimeTools()
      return result
    },
    inspect: () => inspectPluginHost(),
  })

  // NOTICE: Runtime tool stores must register during setup so renderer consumers can see them
  // before `onMounted()` finishes the rest of the startup flow.
  if (mcpToolsStore) {
    void mcpToolsStore.refresh().catch((error) => {
      console.warn('[App] Failed to refresh MCP runtime tools:', error)
    })
  }
  void refreshPluginRuntimeTools()

  if (petLiteRuntimeFeatures.artistry) {
    const artistryStore = useArtistryStore()
    const { activeProvider, artistryGlobals, activeModel, defaultPromptPrefix, providerOptions } = storeToRefs(artistryStore)

    watch([activeProvider, artistryGlobals, activeModel, defaultPromptPrefix, providerOptions], () => {
      if (activeProvider.value) {
        void syncArtistryConfig({
          provider: activeProvider.value as string,
          globals: JSON.parse(JSON.stringify(artistryGlobals.value)),
          model: activeModel.value,
          promptPrefix: defaultPromptPrefix.value,
          options: providerOptions.value,
        })
      }
    }, { deep: true, immediate: true })
  }

  context.value.on(electronPluginToolsChanged, () => {
    void refreshPluginRuntimeTools()
  })

  return {
    async initialize() {
      analyticsStore.initialize()
      await displayModelsStore.initialize()
      cardStore.initialize()

      await displayModelsStore.loadDisplayModelsFromIndexedDB()
      await settingsStore.initializeStageModel()
      if (petLiteRuntimeFeatures.hearing) {
        await settingsAudioDeviceStore.initialize()
      }
      else {
        settingsAudioDeviceStore.enabled = false
        settingsAudioDeviceStore.stopStream()
      }

      if (petLiteRuntimeFeatures.channelServer) {
        const serverChannelConfig = await getServerChannelConfig()
        serverChannelSettingsStore.tlsConfig = serverChannelConfig.tlsConfig ?? null
        serverChannelSettingsStore.hostname = serverChannelConfig.hostname
        serverChannelSettingsStore.authToken = serverChannelConfig.authToken

        await serverChannelStore.initialize({
          token: serverChannelConfig.authToken || undefined,
          possibleEvents: ['ui:configure'],
        }).catch(err => console.error('Failed to initialize Mods Server Channel in App.vue:', err))
        if (!isAuxiliaryChatRoute)
          contextBridgeStore.initialize()
      }

      if (!isAuxiliaryChatRoute && !isWidgetsWindowRoute()) {
        if (petLiteRuntimeFeatures.channelServer)
          characterOrchestratorStore.initialize()

        await startTrackingCursorPoint()
      }

      defineInvokeHandler(context.value, pluginProtocolListProviders, async () => listProvidersForPluginHost())

      if (shouldPublishPluginHostCapabilities()) {
        await reportPluginCapability({
          key: pluginProtocolListProvidersEventName,
          state: 'ready',
          metadata: {
            source: 'stage-ui',
          },
        })
      }

      void inferencePreload?.triggerPreload()
    },
    dispose() {
      if (!isAuxiliaryChatRoute)
        contextBridgeStore.dispose()
      mcpToolsStore?.dispose()
      pluginToolsStore.dispose()
    },
  }
}

function createCaptionRuntime() {
  const displayModelsStore = useDisplayModelsStore()

  return {
    async initialize() {
      // Caption reactions only need the persisted renderer/model selection to
      // decide whether a Live2D motion can be forwarded to the stage window.
      // Avoid loading chat, plugin, audio, and stage runtime services here.
      await displayModelsStore.loadDisplayModelsFromIndexedDB()
      await settingsStore.initializeStageModel()
    },
    dispose() {},
  }
}

const stageRuntime = (() => {
  if (isSpotlightWindowRoute)
    return null
  if (isCaptionWindowRoute)
    return createCaptionRuntime()
  return createFullStageRuntime()
})()

const { restore: restoreLocale } = useLanguage(language, getMainLocale, setLocale)

const { updateThemeColor } = useThemeColor(themeColorFromValue({ light: 'rgb(255 255 255)', dark: 'rgb(18 18 18)' }))
watch(dark, () => updateThemeColor(), { immediate: true })
watch(route, () => updateThemeColor(), { immediate: true })
onMounted(() => updateThemeColor())

if (isSettingsWindowRoute) {
  context.value.on(electronSettingsNavigate, (event) => {
    const targetRoute = event?.body?.route
    if (!targetRoute || route.fullPath === targetRoute) {
      return
    }

    void router.push(targetRoute).catch((error) => {
      console.warn('Failed to navigate settings window:', error)
    })
  })
}

onMounted(async () => {
  chatSyncLifecycle.initialize()

  // NOTICE: Issue #1658
  // When Electron restarts, renderer localStorage may not be flushed to disk.
  // The store's onMounted hook falls back to navigator.language, which triggers
  // watch(language) and overwrites the main-process config with the OS locale.
  // We must restore the correct locale from main process before allowing sync.
  // https://github.com/moeru-ai/airi/issues/1658
  await restoreLocale()

  if (chatSessionStore)
    await chatSessionStore.initialize()

  await stageRuntime?.initialize()
})

onUnmounted(() => {
  chatSyncLifecycle.dispose()
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })

onUnmounted(() => {
  stageRuntime?.dispose()
})
</script>

<template>
  <ToasterRoot @close="id => toast.dismiss(id)">
    <Toaster />
  </ToasterRoot>
  <ResizeHandler v-if="!isSpotlightWindowRoute && !isCaptionWindowRoute" />
  <RouterView />
</template>

<style>
/* We need this to properly animate the CSS variable */
@property --chromatic-hue {
  syntax: '<number>';
  initial-value: 0;
  inherits: true;
}

@keyframes hue-anim {
  from {
    --chromatic-hue: 0;
  }
  to {
    --chromatic-hue: 360;
  }
}

.dynamic-hue {
  animation: hue-anim 10s linear infinite;
}
</style>
