<script setup lang="ts">
import { RadioGroupItem, RadioGroupRoot } from 'reka-ui'

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
  <!-- 세그먼트 선택 컨트롤 — Reka RadioGroup 기반(화살표키 네비·roving tabindex 확보). -->
  <!-- 트랙(inset) 위에서 선택된 세그먼트만 brand로 채워지는 풀폭 토글 -->
  <RadioGroupRoot
    v-model="model"
    orientation="horizontal"
    class="flex gap-1 rounded-full border border-stroke bg-canvas p-1"
  >
    <RadioGroupItem
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :data-value="option.value"
      class="h-10 flex-1 rounded-full text-label font-bold transition-colors duration-100 ease-standard
             text-content-secondary data-[state=unchecked]:hover:text-content
             data-[state=checked]:bg-brand data-[state=checked]:text-on-brand
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {{ option.label }}
    </RadioGroupItem>
  </RadioGroupRoot>
</template>
