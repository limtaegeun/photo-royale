<script setup lang="ts">
import { watch } from 'vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseDialog from '@/shared/components/BaseDialog.vue'
import { useRoomDeletion } from '../composables/useRoomDeletion'

/**
 * 방 삭제 확인 모달(P09) — 지워질 것의 개수를 먼저 보여 주고, 확인을 받은 뒤에만 지운다.
 * 개수는 모달이 열릴 때마다 새로 센다: 목록을 불러온 뒤에도 방에 사람·킬샷이 더 쌓였을 수 있다.
 */
const props = defineProps<{
  /** 지울 방 코드 — 모달이 닫혀 있는 동안은 null일 수 있다 */
  roomCode: string | null
}>()

const emit = defineEmits<{
  /** 삭제를 끝냈다 — 목록에서 빼고 결과를 알리는 것은 부모 몫이다 */
  deleted: [code: string]
  /** 이미 없는 방이었다(다른 기기에서 지웠다) — 목록에서만 뺀다 */
  gone: [code: string]
}>()

const open = defineModel<boolean>('open', { default: false })

const { summary, summaryState, isDeleting, deleteError, loadSummary, removeRoom } = useRoomDeletion()

watch(
  [open, () => props.roomCode],
  ([isOpen, code]) => {
    if (isOpen && code !== null) void loadSummary(code)
  },
  { immediate: true },
)

watch(summaryState, (state) => {
  if (state === 'missing' && props.roomCode !== null) emit('gone', props.roomCode)
})

/**
 * 삭제 확정 — 끝날 때까지 모달을 열어 둔다(강퇴처럼 먼저 닫지 않는다). 여러 번 쓰는 긴 작업이라
 * 먼저 닫으면 진행 중인지 끝났는지 보이지 않고, 실패하면 같은 자리에서 다시 눌러야 하기 때문이다.
 */
async function confirmDelete() {
  const code = props.roomCode
  if (code === null) return
  if (await removeRoom(code)) {
    open.value = false
    emit('deleted', code)
  }
}
</script>

<template>
  <BaseDialog
    v-model:open="open"
    :title="`ROOM ${roomCode ?? ''} 방을 삭제할까요?`"
    description="아래 내용이 모두 지워지고 되돌릴 수 없어요."
  >
    <div class="flex flex-col gap-5">
      <p
        v-if="summaryState === 'loading'"
        role="status"
        class="text-body text-content-secondary"
      >
        지울 내용을 확인하고 있어요…
      </p>
      <p v-else-if="summaryState === 'error'" role="alert" class="text-body text-danger">
        지울 내용을 불러오지 못했어요. 창을 닫고 다시 시도해 주세요.
      </p>
      <p v-else-if="summaryState === 'missing'" role="status" class="text-body text-content-secondary">
        이미 삭제된 방이에요.
      </p>
      <template v-else-if="summaryState === 'ready' && summary">
        <ul aria-label="지워질 내용" class="flex flex-col gap-2 text-body text-content">
          <li class="flex justify-between">
            <span>참가자</span><span>{{ summary.counts.participants }}명</span>
          </li>
          <li class="flex justify-between">
            <span>킬샷 사진</span><span>{{ summary.counts.submissions }}장</span>
          </li>
          <li class="flex justify-between">
            <span>라운드 기록</span><span>{{ summary.counts.rounds }}개</span>
          </li>
          <li class="flex justify-between">
            <span>공지</span><span>{{ summary.counts.notices }}개</span>
          </li>
          <li class="flex justify-between">
            <span>행사장 지도</span><span>{{ summary.counts.assets }}장</span>
          </li>
        </ul>
        <p
          v-if="summary.status === 'playing'"
          class="text-caption leading-(--pr-line-height-relaxed) break-keep text-warning"
        >
          게임이 진행 중인 방이에요. 삭제하면 참가자 화면에서도 게임이 바로 끝나요.
        </p>
      </template>

      <p v-if="deleteError" role="alert" class="text-caption text-danger">{{ deleteError }}</p>

      <!-- 위 = 안전(그대로 두기), 아래 = 파괴(삭제하기) — 내보내기·게임 종료 모달과 순서·무게를 맞춘다 -->
      <div class="flex flex-col gap-3">
        <BaseButton
          variant="ghost"
          size="lg"
          class="w-full"
          :disabled="isDeleting"
          @click="open = false"
        >
          그대로 두기
        </BaseButton>
        <BaseButton
          variant="danger"
          size="lg"
          class="w-full"
          :loading="isDeleting"
          :disabled="summaryState !== 'ready'"
          @click="confirmDelete"
        >
          삭제하기
        </BaseButton>
      </div>
    </div>
  </BaseDialog>
</template>
