<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import { useToast } from '@/shared/composables/useToast'
import { useAuthStore } from '@/features/auth'
import { fetchMyRooms, type RoomSummary } from '../api/rooms'
import RoomDeleteDialog from './RoomDeleteDialog.vue'

/**
 * 내가 만든 방 — 랜딩에는 가장 최근 방 1개만 "돌아가기"로 승격하고(게임 Continue 패턴),
 * 나머지는 바텀 시트로 강등한다(progressive disclosure). 랜딩의 주인공은 코드 입장·방
 * 만들기 두 행동이므로 이 섹션이 그보다 시각적으로 커지면 안 된다.
 *
 * 방 삭제(P09)도 시트의 방 행에서만 연다 — 그래서 시트는 방이 1개여도 보인다(지울 방이 하나뿐인
 * 진행자도 지울 수 있어야 한다).
 */
const router = useRouter()
const authStore = useAuthStore()
const { toast } = useToast()

const rooms = ref<RoomSummary[]>([])

/** fetchMyRooms가 최신순으로 정렬해 주므로 첫 항목이 곧 가장 최근 방이다 */
const latestRoom = computed(() => rooms.value[0] ?? null)

// 목록은 보조 정보라 실패해도 화면을 막지 않는다 — 빈 목록과 같이 섹션을 숨긴다
onMounted(async () => {
  const uid = authStore.user?.uid
  if (!uid) return
  try {
    rooms.value = await fetchMyRooms(uid)
  } catch {
    rooms.value = []
  }
})

/** 방금 만든 방은 serverTimestamp 반영 전이라 createdAt이 없을 수 있다 */
function formatCreatedAt(createdAt: Date | null): string {
  if (!createdAt) return '방금'
  return createdAt.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function enterRoom(code: string) {
  router.push({ name: 'waiting-room', params: { roomCode: code } })
}

const deleteTargetCode = ref<string | null>(null)
const isDeleteDialogOpen = ref(false)

function requestDelete(code: string) {
  deleteTargetCode.value = code
  isDeleteDialogOpen.value = true
}

function dropRoom(code: string) {
  rooms.value = rooms.value.filter((room) => room.code !== code)
}

function onRoomDeleted(code: string) {
  dropRoom(code)
  toast({ title: `ROOM ${code} 방을 삭제했어요.`, tone: 'success' })
}

// 이미 없던 방은 모달을 닫을 때 목록에서 뺀다 — 바로 빼면 마지막 방일 때 섹션째 사라져
// "이미 삭제된 방이에요" 안내를 읽기도 전에 모달이 닫힌다
const goneRoomCode = ref<string | null>(null)
watch(isDeleteDialogOpen, (isOpen) => {
  if (isOpen || goneRoomCode.value === null) return
  dropRoom(goneRoomCode.value)
  goneRoomCode.value = null
})
</script>

<template>
  <!-- 만든 방이 없으면 섹션 자체를 렌더하지 않아 히어로를 깔끔하게 유지한다 -->
  <section v-if="latestRoom" aria-label="내가 만든 방">
    <!-- 이어하기: 행 전체가 탭 대상(터치 타겟 48px+) -->
    <BaseButton variant="ghost" size="lg" class="w-full" @click="enterRoom(latestRoom.code)">
      ROOM {{ latestRoom.code }} 대기실로 돌아가기
    </BaseButton>

    <!-- 2차 공개(1단계): 나머지 방은 요청 시에만 시트로 보여준다 -->
    <BaseBottomSheet title="내가 만든 방">
      <template #trigger>
        <BaseButton variant="ghost" size="md" class="mt-2 w-full">
          지난 방 모두 보기 ({{ rooms.length }})
        </BaseButton>
      </template>
      <ul class="flex flex-col gap-2">
        <!-- 행 = 입장(넓게) + 삭제(아이콘 한 칸). 파괴 액션은 오른쪽 끝에 작게 둬 입장 탭과 갈라 놓는다 -->
        <li v-for="room in rooms" :key="room.code" class="flex gap-2">
          <BaseButton variant="ghost" size="md" class="min-w-0 flex-1" @click="enterRoom(room.code)">
            ROOM {{ room.code }} · {{ formatCreatedAt(room.createdAt) }}
          </BaseButton>
          <BaseButton
            variant="ghost"
            size="md"
            padding="none"
            class="w-(--pr-size-control-md) text-danger"
            :aria-label="`ROOM ${room.code} 삭제`"
            @click="requestDelete(room.code)"
          >
            <svg aria-hidden="true" class="size-5" viewBox="0 0 16 16" fill="none">
              <path
                d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.75 6.5v4.5M9.25 6.5v4.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </BaseButton>
        </li>
      </ul>
    </BaseBottomSheet>

    <RoomDeleteDialog
      v-model:open="isDeleteDialogOpen"
      :room-code="deleteTargetCode"
      @deleted="onRoomDeleted"
      @gone="goneRoomCode = $event"
    />
  </section>
</template>
