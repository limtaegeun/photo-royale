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
  <!-- 트랙(inset) 위에서 선택된 세그먼트만 brand로 채워지는 풀폭 토글 -->
  <div class="flex gap-1 rounded-full border border-stroke bg-canvas p-1" role="radiogroup">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      :data-value="option.value"
      class="h-10 flex-1 rounded-full text-label font-bold transition-colors duration-100 ease-standard"
      :class="
        model === option.value
          ? 'bg-brand text-on-brand'
          : 'text-content-secondary hover:text-content'
      "
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
