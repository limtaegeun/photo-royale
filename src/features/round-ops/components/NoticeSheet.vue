<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseInput from '@/shared/components/BaseInput.vue'
import { NOTICE_TEXT_MAX_LENGTH } from '../api/notices'

/**
 * 공지 작성 시트 — 자유 텍스트 1건을 참가자 전원에게 보낸다. 전송 성공 시 시트를 닫는 판단은
 * 부모(페이지)가 한다: 실패하면 입력을 남겨 둔 채 시트를 열어 둬야 재시도가 가능하다.
 */
interface Props {
  /** 전송 요청 진행 중 — 중복 전송을 막고 버튼에 스피너를 띄운다 */
  sending?: boolean
}

withDefaults(defineProps<Props>(), { sending: false })

const emit = defineEmits<{
  /** 전송 요청 — 성공/실패 처리와 시트 닫기는 부모가 한다 */
  send: [text: string]
}>()

const open = defineModel<boolean>('open', { default: false })

const text = ref('')

// 시트를 닫을 때 입력을 비운다 — 다음에 열었을 때 지난 공지 문구가 남아 있으면 오전송으로 이어진다
watch(open, (isOpen) => {
  if (!isOpen) text.value = ''
})

const trimmedLength = computed(() => text.value.trim().length)
/**
 * maxlength가 타이핑·붙여넣기는 막지만 IME 조합 등 일부 입력 경로는 상한을 넘길 수 있다.
 * 그때 전송이 활성인 채로 스토어가 조용히 거절하면 눌러도 아무 일도 일어나지 않는다(QA C-06) —
 * 화면에서도 같은 상한을 강제하고 카운터를 경고색으로 바꿔 이유를 보이게 한다.
 */
const isOverLimit = computed(() => trimmedLength.value > NOTICE_TEXT_MAX_LENGTH)
const canSend = computed(() => trimmedLength.value > 0 && !isOverLimit.value)
</script>

<template>
  <BaseBottomSheet
    v-model:open="open"
    title="공지 보내기"
    description="참가자 전원에게 즉시 전달됩니다."
  >
    <div class="flex flex-col gap-3">
      <BaseInput
        v-model="text"
        size="lg"
        placeholder="예) 보급품 A 지점에 배치했습니다"
        :maxlength="NOTICE_TEXT_MAX_LENGTH"
        aria-label="공지 내용"
      />
      <!-- 상한은 maxlength로 이미 막히지만, 남은 글자 수를 알아야 문장을 줄일지 판단할 수 있다 -->
      <p
        class="text-right text-caption"
        :class="isOverLimit ? 'text-danger' : 'text-content-secondary'"
      >
        {{ text.length }}/{{ NOTICE_TEXT_MAX_LENGTH }}
      </p>
      <BaseButton
        variant="primary"
        size="lg"
        class="w-full"
        :disabled="!canSend"
        :loading="sending"
        @click="emit('send', text)"
      >
        전송
      </BaseButton>
    </div>
  </BaseBottomSheet>
</template>
