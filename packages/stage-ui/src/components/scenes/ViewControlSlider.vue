<script setup lang="ts">
import { RoundRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted } from 'vue'

import {
  defaultControlConfig as live2dControlConfig,
  formatter as live2dFormatter,
  useL2dViewControl,
} from '../../stores/live2d'
import { useSettingsStageModel } from '../../stores/settings/stage-model'

const { stageModelRenderer } = storeToRefs(useSettingsStageModel())
const live2d = useL2dViewControl()

const activeRenderer = computed<'live2d' | null>(() => {
  if (stageModelRenderer.value === 'live2d')
    return 'live2d'
  return null
})

const controlEnabled = computed(() => {
  if (activeRenderer.value === 'live2d')
    return live2d.viewControlsEnabled.value
  return false
})

const activeControlKey = computed(() => {
  if (activeRenderer.value === 'live2d')
    return live2d.viewControlMode.value
  return null
})

const activeControlConfig = computed(() => {
  if (activeRenderer.value === 'live2d')
    return live2dControlConfig[live2d.viewControlMode.value]
  return null
})

const controlledValue = computed({
  get() {
    if (activeRenderer.value === 'live2d') {
      switch (live2d.viewControlMode.value) {
        case 'x':
          return live2d.position.value.x
        case 'y':
          return live2d.position.value.y
        case 'scale':
          return live2d.scale.value
      }
    }

    return 0
  },
  set(value) {
    if (activeRenderer.value === 'live2d') {
      live2d.set(live2d.viewControlMode.value, value)
      return
    }

  },
})

const formattedValue = computed(() => {
  if (activeRenderer.value === 'live2d')
    return live2dFormatter[live2d.viewControlMode.value](controlledValue.value)
  return ''
})

onUnmounted(() => {
  live2d.viewControlsEnabled.value = false
})
</script>

<template>
  <Transition name="fade-side-pops-in">
    <fieldset v-if="controlEnabled && activeControlConfig">
      <Transition name="fade-side-pops-in" mode="out-in">
        <div :key="activeControlKey ?? 'none'" relative class="[&_.round-range-tooltip]:hover:opacity-100">
          <RoundRange
            v-model="controlledValue"
            :min="activeControlConfig.min"
            :max="activeControlConfig.max"
            :step="activeControlConfig.step"
            handle-wheel
            data-direction="vertical"
            h="50%"
            write-vertical-left
          />
          <div
            class="round-range-tooltip"
            absolute left-10 top="50%"
            translate-y="[-50%]"
            font-mono op-0
            transition="all duration-200 ease-in-out"
          >
            {{ formattedValue }}
          </div>
        </div>
      </Transition>
    </fieldset>
  </Transition>
</template>

<style scoped>
.fade-side-pops-in-enter-active,
.fade-side-pops-in-leave-active {
  transition: all 0.2s ease-in-out;
}

.fade-side-pops-in-enter-from,
.fade-side-pops-in-leave-to {
  opacity: 0;
  transform: translateX(-100%) scale(0.8);
}

.fade-side-pops-in-enter-to,
.fade-side-pops-in-leave-from {
  opacity: 1;
  transform: translateX(0) scale(1);
}
</style>
