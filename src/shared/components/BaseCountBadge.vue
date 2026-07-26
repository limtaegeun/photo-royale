<script setup lang="ts">
import { ref, watch } from 'vue'
import type { CountBadgeTone } from './baseCountBadge'

interface Props {
  count: number
  ariaLabel?: string
  tone?: CountBadgeTone
}

const props = withDefaults(defineProps<Props>(), {
  ariaLabel: undefined,
  tone: 'danger',
})

const pulseKey = ref(0)
watch(
  () => props.count,
  (count, previousCount) => {
    if (count > previousCount) pulseKey.value += 1
  },
)

const TONE_CLASS: Record<CountBadgeTone, string> = {
  brand: 'bg-brand text-on-brand',
  accent: 'bg-accent text-on-accent',
  danger: 'bg-danger-solid text-on-danger',
  neutral: 'bg-neutral text-content',
}
</script>

<template>
  <span
    v-if="count > 0"
    :key="pulseKey"
    :aria-label="ariaLabel ?? String(count)"
    class="count-badge inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1
           text-caption font-semibold"
    :class="TONE_CLASS[tone]"
  >
    <span aria-hidden="true">{{ count }}</span>
  </span>
</template>

<style scoped>
.count-badge {
  animation: count-badge-pulse var(--pr-duration-slow) var(--pr-easing-decelerate);
}

@keyframes count-badge-pulse {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.35);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .count-badge {
    animation: none;
  }
}
</style>
