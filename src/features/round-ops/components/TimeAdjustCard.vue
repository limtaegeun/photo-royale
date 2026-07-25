<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCard from '@/shared/components/BaseCard.vue'

/**
 * 시간 조정 — 스테퍼로 대기값을 쌓고 '반영'을 눌러야 서버에 커밋한다. 한 번 누를 때마다
 * 참가자 전원의 타이머가 튀면 진행이 산만해지므로, 오조작을 반영 전에 되돌릴 수 있게 두 단계로 나눈다.
 */
interface Props {
  /** 아직 반영하지 않은 누적 조정값(분). 0이면 반영할 것이 없다 */
  pendingMinutes: number
  /** 다른 라운드 쓰기가 진행 중이면 중복 요청을 막는다 */
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), { disabled: false })

const emit = defineEmits<{
  /** 스테퍼 클릭 — 대기값에 더할 분 */
  adjust: [minutes: number]
  /** 대기값을 서버에 반영 */
  apply: []
}>()

const hasPending = computed(() => props.pendingMinutes !== 0)

/** 부호를 항상 붙여 방향을 분명히 한다(+1분 / -2분) */
const caption = computed(() =>
  hasPending.value
    ? `대기 변경값: ${props.pendingMinutes > 0 ? '+' : ''}${props.pendingMinutes}분 · 반영 시 모든 참가자에게 적용`
    : '-1분 / +1분으로 조정한 뒤 반영을 누르면 참가자 전원에게 적용돼요.',
)
</script>

<template>
  <BaseCard>
    <h2 class="text-label text-content">시간 조정</h2>
    <div class="mt-4 grid grid-cols-3 gap-3">
      <BaseButton variant="ghost" size="md" :disabled="disabled" @click="emit('adjust', -1)">
        -1분
      </BaseButton>
      <BaseButton variant="ghost" size="md" :disabled="disabled" @click="emit('adjust', 1)">
        +1분
      </BaseButton>
      <BaseButton
        variant="primary"
        size="md"
        :disabled="!hasPending || disabled"
        @click="emit('apply')"
      >
        반영
      </BaseButton>
    </div>
    <!-- 대기값은 눌러도 화면 어디서도 변하지 않으면 반영 여부를 알 수 없다 — 라이브 영역으로 알린다 -->
    <p class="mt-3 text-caption text-content-secondary" role="status">{{ caption }}</p>
  </BaseCard>
</template>
