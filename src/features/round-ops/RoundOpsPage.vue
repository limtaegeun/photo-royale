<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseSegmented from '@/shared/components/BaseSegmented.vue'
import { normalizeRoomCode } from '@/features/waiting-room'
import { useToast } from '@/shared/composables/useToast'
import NoticeCard from './components/NoticeCard.vue'
import NoticeSheet from './components/NoticeSheet.vue'
import RoundTimerCard from './components/RoundTimerCard.vue'
import TimeAdjustCard from './components/TimeAdjustCard.vue'
import { useRoundTimer } from './composables/useRoundTimer'
import { ROUND_STATE_LABEL, ROUND_STATE_TONE } from './roundStateStyles'
import { useRoundOpsStore } from './stores/useRoundOpsStore'

/**
 * H04 라운드 운영 — 호스트(진행자)가 게임 시작 후 보는 화면. 호스트는 플레이어가 아니라
 * 진행자이므로 카메라 콕핏이 아니라 이 화면으로 들어온다(대기실의 playing 전이 분기).
 *
 * 운영 탭은 방 문서(rooms/{code}.round)를 정본으로 삼아 실제 타이머·올스탑·시간 반영·공지를
 * 수행한다. 판정/기록 탭은 화면 자체가 후속 작업이라 자리만 알린다.
 */

const route = useRoute()
const router = useRouter()
const { toast } = useToast()
const store = useRoundOpsStore()
const {
  roomCode,
  phase,
  round,
  gameStatus,
  isHost,
  myId,
  assignmentRound,
  assignedTeamCount,
  latestNotice,
  pendingAdjustMinutes,
  isActionPending,
  actionError,
  isSendingNotice,
} = storeToRefs(store)

/** 운영 중인 방 코드 — 새로고침·딥링크에도 유지되도록 경로 파라미터에서 읽는다 */
const routeRoomCode = computed(() => normalizeRoomCode(String(route.params.roomCode)))

const { nowMs, formatted, displayState } = useRoundTimer(round)

/** 하단 탭 — 판정/기록은 아직 화면이 없어 준비 중 안내만 보여준다 */
const TABS = [
  { label: '운영', value: 'ops' },
  { label: '판정', value: 'judge' },
  { label: '기록', value: 'log' },
] as const

const activeTab = ref<string>('ops')
const isNoticeSheetOpen = ref(false)

/** 라운드 컨트롤은 게임이 실제로 진행 중일 때만 의미가 있다(rules도 playing에서만 쓰기를 허용한다) */
const isPlaying = computed(() => gameStatus.value === 'playing')
/** 시작 전·종료 상태에서는 조정할 대상이 없어 '라운드 시작' 하나로 화면을 단순화한다 */
const canControlTimer = computed(
  () => displayState.value === 'running' || displayState.value === 'paused',
)

/**
 * 호스트 전용 가드 — 컨트롤이 실쓰기라 게스트가 URL로 직접 들어오면 403만 보게 된다.
 * 방 문서를 받아 본 뒤(스냅샷 도착) 역할을 판정해 각자의 화면으로 돌려보낸다.
 *
 * **세션이 끊긴 경우는 '게스트'가 아니다.** 로그인 상태가 사라지면 myId가 null이 되어 isHost도
 * false가 되는데, 이때 게스트 분기를 타면 진행자가 카메라 콕핏으로 튕긴다 — 이 화면이 막으려던
 * 바로 그 상황이다(QA O-01). 세션 없음은 로그인 화면으로 보내고 돌아올 목적지를 보존한다.
 */
watch([phase, isHost, gameStatus, myId], () => {
  if (phase.value === 'not-found') {
    toast({ title: '방을 찾을 수 없어요.', tone: 'danger' })
    router.replace({ name: 'entry' })
    return
  }
  if (myId.value === null) {
    router.replace({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  if (phase.value !== 'ready' || isHost.value) return
  router.replace(
    isPlaying.value
      ? { name: 'camera' }
      : { name: 'waiting-room', params: { roomCode: routeRoomCode.value } },
  )
})

// 액션 실패는 화면을 되돌리지 않고 토스트로만 알린다 — 마지막 스냅샷을 유지한 채 재시도할 수 있게
watch(actionError, (message) => {
  if (message !== null) toast({ title: message, tone: 'danger' })
})

/** 전송에 성공했을 때만 시트를 닫는다 — 실패하면 입력을 남겨 둔 채 재시도할 수 있어야 한다 */
async function sendNotice(text: string) {
  const sent = await store.submitNotice(text)
  if (!sent) return
  isNoticeSheetOpen.value = false
  toast({ title: '공지를 보냈어요.', tone: 'success' })
}

onMounted(() => {
  store.enter(routeRoomCode.value)
})
onUnmounted(() => {
  store.leave()
})
</script>

<template>
  <!-- 타이틀·설명 헤더는 앱 셸 공용 헤더(AppHeader)가 route meta로 담당한다 -->
  <!-- 하단 safe-area는 화면이 아니라 아래의 sticky 탭 바가 직접 갖는다 — sticky는 뷰포트 하단에
       붙으므로 부모 패딩으로는 홈 인디케이터를 피할 수 없다 -->
  <section class="flex flex-1 flex-col bg-canvas px-6 pt-3">
    <!-- 블록 사이 여백은 mt-* 체인이 아니라 컨테이너 gap으로 준다 -->
    <div class="flex flex-1 flex-col gap-6 pt-3">
      <template v-if="activeTab === 'ops'">
        <!-- 운영 중인 방 + 진행 상태. 방 코드는 받아 적는 값이라 mono + 자간으로 오독을 줄인다 -->
        <div class="flex items-center justify-between gap-3">
          <p class="text-label text-content-secondary">
            ROOM
            <span class="font-mono tracking-widest text-content">
              {{ roomCode ?? routeRoomCode }}
            </span>
          </p>
          <BaseBadge :tone="ROUND_STATE_TONE[displayState]" appearance="outline">
            {{ ROUND_STATE_LABEL[displayState] }}
          </BaseBadge>
        </div>

        <template v-if="phase === 'ready' && isPlaying">
          <RoundTimerCard
            :formatted="formatted"
            :state="displayState"
            :round-number="assignmentRound"
            :team-count="assignedTeamCount"
          />

          <!-- 올스탑 — 일시정지/재개는 동등한 무게의 두 액션이라 2열로 나란히 둔다.
               시작 전·종료에는 되돌릴 상태가 없으므로 '라운드 시작' 한 개로 대체한다 -->
          <div v-if="canControlTimer" class="grid grid-cols-2 gap-3">
            <BaseButton
              variant="danger"
              size="lg"
              :disabled="displayState !== 'running' || isActionPending"
              @click="store.pause()"
            >
              일시정지
            </BaseButton>
            <BaseButton
              variant="accent"
              size="lg"
              :disabled="displayState !== 'paused' || isActionPending"
              @click="store.resume()"
            >
              재개
            </BaseButton>
          </div>
          <BaseButton
            v-else
            variant="primary"
            size="lg"
            class="w-full"
            :loading="isActionPending"
            @click="store.start()"
          >
            라운드 시작
          </BaseButton>

          <!-- 시간 조정 — 진행 중인 타이머가 있을 때만 의미가 있다 -->
          <TimeAdjustCard
            v-if="canControlTimer"
            :pending-minutes="pendingAdjustMinutes"
            :disabled="isActionPending"
            @adjust="store.adjustBy($event)"
            @apply="store.applyAdjust()"
          />

          <NoticeCard
            :notice="latestNotice"
            :now-ms="nowMs"
            @open="isNoticeSheetOpen = true"
          />
        </template>

        <!-- 아직 시작하지 않은 방 — rules도 playing에서만 라운드 쓰기를 허용한다 -->
        <BaseCard v-else-if="phase === 'ready'" padding="lg">
          <h2 class="text-subheading text-content">게임이 아직 시작되지 않았어요</h2>
          <p class="mt-3 text-body text-content-secondary">
            대기실에서 팀 배정을 확정하고 게임을 시작하면 라운드를 운영할 수 있어요.
          </p>
          <BaseButton
            variant="primary"
            size="md"
            class="mt-5 w-full"
            @click="router.replace({ name: 'waiting-room', params: { roomCode: routeRoomCode } })"
          >
            대기실로
          </BaseButton>
        </BaseCard>

        <!-- 세션이 사라진 경계 상황 — 방 없음(not-found)은 가드가 이미 다른 화면으로 보냈다 -->
        <BaseCard v-else-if="phase === 'error'" padding="lg">
          <h2 class="text-subheading text-content">운영 화면을 열지 못했어요</h2>
          <p class="mt-3 text-body text-content-secondary">
            네트워크 상태를 확인하고 잠시 후 다시 시도해 주세요.
          </p>
          <BaseButton
            variant="primary"
            size="md"
            class="mt-5 w-full"
            @click="router.replace({ name: 'entry' })"
          >
            입장 화면으로
          </BaseButton>
        </BaseCard>

        <p v-else class="text-body text-content-secondary" role="status">
          라운드 상태를 불러오는 중…
        </p>
      </template>

      <!-- 판정·기록 탭은 화면 자체가 후속 작업이라 자리만 알린다 -->
      <BaseCard v-else padding="lg">
        <h2 class="text-subheading text-content">
          {{ activeTab === 'judge' ? '판정' : '기록' }} 화면 준비 중
        </h2>
        <p class="mt-3 text-body text-content-secondary">
          이 탭은 다음 단계에서 구현돼요. 지금은 운영 탭만 동작합니다.
        </p>
      </BaseCard>
    </div>

    <!-- 하단 고정 탭 — 목업이 하단 고정이고, 콘텐츠가 길어져도 탭이 화면 밖으로 밀리지 않아야 한다
         (QA B-06). 배경을 깔아 아래로 지나가는 카드가 비쳐 보이지 않게 한다 -->
    <div class="sticky bottom-0 bg-canvas pt-6 pb-[calc(var(--pr-inset-bottom-safe)+1rem)]">
      <BaseSegmented v-model="activeTab" :options="[...TABS]" />
    </div>

    <NoticeSheet
      v-model:open="isNoticeSheetOpen"
      :sending="isSendingNotice"
      @send="sendNotice"
    />
  </section>
</template>
