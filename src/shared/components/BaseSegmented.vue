<script setup lang="ts">
interface Option {
  label: string
  value: string
}

interface Props {
  options: Option[]
}

defineProps<Props>()

const model = defineModel<string>()
</script>

<template>
  <!-- 세그먼트 선택 컨트롤 — 선택 값을 옵션으로 주입(성별·팀 등 재사용) -->
  <div class="flex gap-2" role="radiogroup">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      :data-value="option.value"
      class="h-8 min-w-20 rounded-full px-4 text-caption font-bold transition-colors duration-100 ease-standard"
      :class="
        model === option.value
          ? 'bg-brand text-on-brand'
          : 'border border-stroke-strong text-content'
      "
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
