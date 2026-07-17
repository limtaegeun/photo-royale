<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import { useAuthStore } from '@/features/auth'
import { fetchMyRooms, type RoomSummary } from '../api/rooms'

/**
 * 내가 만든 방 — 랜딩에는 가장 최근 방 1개만 "돌아가기"로 승격하고(게임 Continue 패턴),
 * 나머지는 바텀 시트로 강등한다(progressive disclosure). 랜딩의 주인공은 코드 입장·방
 * 만들기 두 행동이므로 이 섹션이 그보다 시각적으로 커지면 안 된다.
 */
const router = useRouter()
const authStore = useAuthStore()

const rooms = ref<RoomSummary[]>([])

/** fetchMyRooms가 최신순으로 정렬해 주므로 첫 항목이 곧 가장 최근 방이다 */
const latestRoom = computed(() => rooms.value[0] ?? null)
const olderRoomCount = computed(() => Math.max(0, rooms.value.length - 1))

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
</script>

<template>
  <!-- 만든 방이 없으면 섹션 자체를 렌더하지 않아 히어로를 깔끔하게 유지한다 -->
  <section v-if="latestRoom" aria-label="내가 만든 방">
    <!-- 이어하기: 행 전체가 탭 대상(터치 타겟 48px+) -->
    <BaseButton variant="ghost" size="lg" class="w-full" @click="enterRoom(latestRoom.code)">
      ROOM {{ latestRoom.code }} 대기실로 돌아가기
    </BaseButton>

    <!-- 2차 공개(1단계): 나머지 방은 요청 시에만 시트로 보여준다 -->
    <BaseBottomSheet v-if="olderRoomCount > 0" title="내가 만든 방">
      <template #trigger>
        <BaseButton variant="ghost" size="md" class="mt-2 w-full">
          지난 방 모두 보기 ({{ rooms.length }})
        </BaseButton>
      </template>
      <ul class="flex flex-col gap-2">
        <li v-for="room in rooms" :key="room.code">
          <BaseButton variant="ghost" size="md" class="w-full" @click="enterRoom(room.code)">
            ROOM {{ room.code }} · {{ formatCreatedAt(room.createdAt) }}
          </BaseButton>
        </li>
      </ul>
    </BaseBottomSheet>
  </section>
</template>
