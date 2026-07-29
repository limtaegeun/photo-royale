<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseDialog from '@/shared/components/BaseDialog.vue'
import BaseSegmented from '@/shared/components/BaseSegmented.vue'
import { normalizeRoomCode } from '@/features/waiting-room'
import { useToast } from '@/shared/composables/useToast'
import type { Submission, SubmissionRecord, SubmissionTarget } from './api/submissions'
import JudgeQueueList from './components/JudgeQueueList.vue'
import JudgeSheet from './components/JudgeSheet.vue'
import NoticeCard from './components/NoticeCard.vue'
import NoticeSheet from './components/NoticeSheet.vue'
import RecordDetailSheet from './components/RecordDetailSheet.vue'
import RecordLogList from './components/RecordLogList.vue'
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
 * 수행하고, 판정 탭은 참가자들이 제출한 킬샷(submissions)을 확정/반려한다.
 * 기록 탭은 같은 submissions 컬렉션의 전 라운드 이력(대기 포함)을 최신순으로 되짚어 본다.
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
  participants,
  latestNotice,
  pendingSubmissions,
  submissionRecords,
  pendingAdjustMinutes,
  pendingAction,
  actionError,
  submissionListenError,
  recordListenError,
  isSendingNotice,
} = storeToRefs(store)

/** 운영 중인 방 코드 — 새로고침·딥링크에도 유지되도록 경로 파라미터에서 읽는다 */
const routeRoomCode = computed(() => normalizeRoomCode(String(route.params.roomCode)))

const { nowMs, formatted, displayState } = useRoundTimer(round)
const JUDGE_ERROR_MESSAGE = '판정을 처리하지 못했어요. 다시 시도해 주세요.'

/** 하단 탭 — 판정 탭은 다른 탭에서도 킬샷 도착을 알 수 있게 대기 건수 배지를 단다(도착 시 펄스). */
const tabs = computed(() => [
  { label: '운영', value: 'ops' },
  {
    label: '판정',
    value: 'judge',
    badge: {
      count: pendingSubmissions.value.length,
      ariaLabel: `${pendingSubmissions.value.length}건 판정 대기`,
    },
  },
  { label: '기록', value: 'log' },
])

const activeTab = ref<string>('ops')
const isNoticeSheetOpen = ref(false)
const isEndGameDialogOpen = ref(false)
const isJudgeSheetOpen = ref(false)
/** 시트에서 판정 중인 킬샷 — 큐에서 고른 스냅샷을 들고 있는다(닫힌 뒤에도 애니메이션 동안 유지) */
const judgingSubmission = ref<Submission | null>(null)
const isRecordSheetOpen = ref(false)
/** 상세 시트에서 보는 기록 — 판정 시트와 같은 이유로 스냅샷을 들고 있는다 */
const viewingRecord = ref<SubmissionRecord | null>(null)

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
watch([phase, isHost, gameStatus, myId, round], () => {
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
  // 게스트의 목적지는 대기실의 전이 규칙과 같아야 한다 — 라운드가 시작되기 전이면 콕핏이 아니라
  // 대기실(배정 카드)이다. 두 화면이 다른 기준을 쓰면 URL을 직접 연 게스트만 카메라가 켜진다.
  router.replace(
    isPlaying.value && round.value !== null
      ? { name: 'camera', params: { roomCode: routeRoomCode.value } }
      : { name: 'waiting-room', params: { roomCode: routeRoomCode.value } },
  )
})

/**
 * 게임이 끝나면(playing → waiting) 호스트를 대기실로 돌려보낸다. 스냅샷 기준이라 종료를 누른
 * 창뿐 아니라 같은 계정으로 열어 둔 다른 기기도 함께 돌아간다.
 *
 * 전이(playing이었다가 waiting)일 때만 움직인다 — 처음부터 waiting인 방에 딥링크로 들어온
 * 호스트는 안내 카드를 보고 스스로 판단하게 둔다(그 화면에 '대기실로' 버튼이 있다).
 */
watch(gameStatus, (status, previous) => {
  if (!isHost.value || previous !== 'playing' || status !== 'waiting') return
  router.replace({ name: 'waiting-room', params: { roomCode: routeRoomCode.value } })
})

// 액션 실패는 화면을 되돌리지 않고 토스트로만 알린다 — 마지막 스냅샷을 유지한 채 재시도할 수 있게
watch(actionError, (message) => {
  if (message !== null) toast({ title: message, tone: 'danger' })
})
watch(submissionListenError, (message) => {
  if (message !== null) toast({ title: message, tone: 'danger' })
})
watch(recordListenError, (message) => {
  if (message !== null) toast({ title: message, tone: 'danger' })
})

// 기록 로그는 사진 포함 전체 이력이라 무겁다 — 기록 탭이 처음 열릴 때 게으르게 구독을 시작한다
// (스토어가 중복 시작을 막는다). 방 스냅샷 도착 전이면 phase가 ready로 바뀔 때 다시 시도한다.
watch([activeTab, phase], ([tab, currentPhase]) => {
  if (tab === 'log' && currentPhase === 'ready') store.watchRecordLog()
})

/**
 * 게임 종료 — 성공하면 방 status가 waiting이 되고, 대기실 복귀는 아래 watch(스냅샷)가 맡는다.
 * 여기서 직접 라우팅하지 않는 이유: 호스트가 기기를 두 대 열어 둔 경우 한쪽에서 종료해도
 * 두 창이 모두 대기실로 돌아가야 하기 때문이다.
 */
async function endGame() {
  const ended = await store.finishGame()
  isEndGameDialogOpen.value = false
  if (ended) toast({ title: '게임을 종료했어요.', tone: 'success' })
}

/** 전송에 성공했을 때만 시트를 닫는다 — 실패하면 입력을 남겨 둔 채 재시도할 수 있어야 한다 */
async function sendNotice(text: string) {
  const sent = await store.submitNotice(text)
  if (!sent) return
  isNoticeSheetOpen.value = false
  toast({ title: '공지를 보냈어요.', tone: 'success' })
}

function openJudgeSheet(submission: Submission) {
  if (pendingAction.value === 'judge') return
  judgingSubmission.value = submission
  isJudgeSheetOpen.value = true
}

/**
 * 기록 행 선택 — 이번 라운드의 대기 건이면 기록 탭에서도 바로 판정할 수 있게 판정 시트를
 * 연다(판정 큐와 같은 문서라 기존 판정 플로우를 그대로 탄다). 그 외(판정 완료, 판정 없이
 * 라운드가 지난 대기 건)는 사진을 크게 확인하는 읽기 전용 상세 시트로 보낸다 —
 * rules가 지난 라운드 판정을 막으므로 판정 시트를 열어 줘도 확정이 실패한다.
 */
function openRecord(record: SubmissionRecord) {
  if (record.status === 'pending' && record.round === assignmentRound.value && isPlaying.value) {
    openJudgeSheet(record)
    return
  }
  viewingRecord.value = record
  isRecordSheetOpen.value = true
}

/** 실패 원인을 큐의 로컬 상태로 추정하지 않고 서버 문서의 확정 상태로 판별한다. */
async function handleJudgeFailure(submissionId: string) {
  let status = null
  try {
    status = await store.getSubmissionStatus(submissionId)
  } catch {
    // 서버 확인까지 실패하면 선판정으로 단정하지 않고 재시도 가능한 일반 오류로 남긴다.
  }
  if (!isJudgeSheetOpen.value || judgingSubmission.value?.id !== submissionId) return
  if (status === 'approved' || status === 'rejected') {
    isJudgeSheetOpen.value = false
    toast({ title: '이미 판정된 킬샷이에요.', tone: 'neutral' })
    return
  }
  toast({ title: JUDGE_ERROR_MESSAGE, tone: 'danger' })
}

async function approveKillshot(target: SubmissionTarget) {
  const current = judgingSubmission.value
  if (current === null) return
  const approved = await store.approveSubmission(current.id, target)
  if (judgingSubmission.value?.id !== current.id) return
  if (!approved) {
    await handleJudgeFailure(current.id)
    return
  }
  isJudgeSheetOpen.value = false
  toast({ title: `팀 ${target.team} 킬샷으로 판정했어요.`, tone: 'success' })
}

async function rejectKillshot() {
  const current = judgingSubmission.value
  if (current === null) return
  const rejected = await store.rejectSubmission(current.id)
  if (judgingSubmission.value?.id !== current.id) return
  if (!rejected) {
    await handleJudgeFailure(current.id)
    return
  }
  isJudgeSheetOpen.value = false
  toast({ title: '킬샷을 반려했어요.', tone: 'neutral' })
}

// 같은 계정 다른 기기에서 먼저 판정된 킬샷이 시트에 남아 이중 판정을 시도하지 않게 닫는다.
// 내 판정 성공 직후의 스냅샷은 시트가 이미 닫혀 있어(open 가드) 토스트가 중복되지 않는다.
watch(pendingSubmissions, (submissions) => {
  const current = judgingSubmission.value
  if (!isJudgeSheetOpen.value || current === null || pendingAction.value === 'judge') return
  if (submissions.some((submission) => submission.id === current.id)) return
  // Listen 자체가 종료되며 store가 stale 큐를 비운 경우는 다른 기기의 선판정이 아니다.
  // 오류 카드를 가리는 stale 시트만 닫고, 원인을 오인시키는 "이미 판정" 안내는 내보내지 않는다.
  if (submissionListenError.value !== null) {
    isJudgeSheetOpen.value = false
    return
  }
  isJudgeSheetOpen.value = false
  toast({ title: '이미 판정된 킬샷이에요.', tone: 'neutral' })
})

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
          />

          <!-- 올스탑 — 일시정지/재개는 동등한 무게의 두 액션이라 2열로 나란히 둔다.
               시작 전·종료에는 되돌릴 상태가 없으므로 '라운드 시작' 한 개로 대체한다 -->
          <div v-if="canControlTimer" class="grid grid-cols-2 gap-3">
            <BaseButton
              variant="danger"
              size="lg"
              :disabled="displayState !== 'running'"
              :loading="pendingAction === 'pause'"
              @click="store.pause()"
            >
              일시정지
            </BaseButton>
            <BaseButton
              variant="accent"
              size="lg"
              :disabled="displayState !== 'paused'"
              :loading="pendingAction === 'resume'"
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
            :loading="pendingAction === 'start'"
            @click="store.start()"
          >
            라운드 시작
          </BaseButton>

          <!-- 시간 조정 — 진행 중인 타이머가 있을 때만 의미가 있다 -->
          <TimeAdjustCard
            v-if="canControlTimer"
            :pending-minutes="pendingAdjustMinutes"
            :applying="pendingAction === 'adjust'"
            @adjust="store.adjustBy($event)"
            @apply="store.applyAdjust()"
          />

          <NoticeCard
            :notice="latestNotice"
            :now-ms="nowMs"
            @open="isNoticeSheetOpen = true"
          />

          <!-- 게임 종료 — 전원을 대기실로 되돌리는 파괴적 액션이라 진행 컨트롤과 멀리 떨어뜨리고
               ghost로 낮춘다. 실제 실행은 확인 다이얼로그를 거친다 -->
          <BaseButton
            variant="ghost"
            size="md"
            class="w-full text-danger"
            @click="isEndGameDialogOpen = true"
          >
            게임 종료
          </BaseButton>
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

      <template v-else-if="activeTab === 'judge'">
        <BaseCard v-if="submissionListenError !== null" padding="lg">
          <h2 class="text-subheading text-danger">판정 큐 연결 오류</h2>
          <p class="mt-3 text-body text-content-secondary">
            {{ submissionListenError }} 연결이 복구되기 전에는 남아 있던 판정 항목을 사용할 수 없어요.
          </p>
        </BaseCard>
        <JudgeQueueList
          v-else-if="phase === 'ready' && isPlaying"
          :submissions="pendingSubmissions"
          :participants="participants"
          :now-ms="nowMs"
          @select="openJudgeSheet"
        />

        <!-- rules도 playing에서만 제출을 허용한다 — 시작 전에는 모일 킬샷이 없다 -->
        <BaseCard v-else-if="phase === 'ready'" padding="lg">
          <h2 class="text-subheading text-content">게임이 아직 시작되지 않았어요</h2>
          <p class="mt-3 text-body text-content-secondary">
            게임을 시작하면 참가자들이 제출한 킬샷이 이곳에 모여요.
          </p>
        </BaseCard>

        <p v-else class="text-body text-content-secondary" role="status">
          판정 큐를 불러오는 중…
        </p>
      </template>

      <template v-else>
        <BaseCard v-if="recordListenError !== null" padding="lg">
          <h2 class="text-subheading text-danger">기록 연결 오류</h2>
          <p class="mt-3 text-body text-content-secondary">
            {{ recordListenError }} 연결이 복구되기 전에는 기록을 확인할 수 없어요.
          </p>
        </BaseCard>
        <RecordLogList
          v-else-if="phase === 'ready' && isPlaying"
          :records="submissionRecords"
          :participants="participants"
          :now-ms="nowMs"
          @select="openRecord"
        />

        <!-- 판정 탭과 같은 기준 — 시작 전에는 쌓일 기록이 없다 -->
        <BaseCard v-else-if="phase === 'ready'" padding="lg">
          <h2 class="text-subheading text-content">게임이 아직 시작되지 않았어요</h2>
          <p class="mt-3 text-body text-content-secondary">
            게임을 시작하면 킬샷 제출과 판정 결과가 이곳에 쌓여요.
          </p>
        </BaseCard>

        <p v-else class="text-body text-content-secondary" role="status">
          기록을 불러오는 중…
        </p>
      </template>
    </div>

    <!-- 하단 고정 탭 — 목업이 하단 고정이고, 콘텐츠가 길어져도 탭이 화면 밖으로 밀리지 않아야 한다
         (QA B-06). 배경을 깔아 아래로 지나가는 카드가 비쳐 보이지 않게 한다 -->
    <div class="sticky bottom-0 bg-canvas pt-6 pb-[calc(var(--pr-inset-bottom-safe)+1rem)]">
      <BaseSegmented v-model="activeTab" :options="tabs" />
    </div>

    <NoticeSheet
      v-model:open="isNoticeSheetOpen"
      :sending="isSendingNotice"
      @send="sendNotice"
    />

    <JudgeSheet
      v-model:open="isJudgeSheetOpen"
      :submission="judgingSubmission"
      :participants="participants"
      :assignment-round="assignmentRound"
      :judging="pendingAction === 'judge'"
      :now-ms="nowMs"
      @approve="approveKillshot"
      @reject="rejectKillshot"
    />

    <RecordDetailSheet
      v-model:open="isRecordSheetOpen"
      :record="viewingRecord"
      :participants="participants"
      :assignment-round="assignmentRound"
      :now-ms="nowMs"
    />

    <!-- 되돌릴 수 없는 액션이라 무엇이 사라지는지 밝히되, 두 문장을 한 덩어리로 두면
         읽히지 않는다. 결과(중요)는 설명으로, 안심 문구(보조)는 캡션으로 위계를 나눈다 -->
    <BaseDialog
      v-model:open="isEndGameDialogOpen"
      title="게임을 종료할까요?"
      description="참가자 전원이 대기실로 돌아가고, 진행 중인 라운드는 사라져요."
    >
      <div class="flex flex-col gap-5">
        <p class="text-caption leading-(--pr-line-height-relaxed) break-keep text-content-tertiary">
          팀 배정은 그대로 남아 다음 라운드를 이어서 준비할 수 있어요.
        </p>

        <div class="flex flex-col gap-3">
          <BaseButton
            variant="danger"
            size="lg"
            class="w-full"
            :loading="pendingAction === 'end'"
            @click="endGame"
          >
            게임 종료
          </BaseButton>
          <BaseButton
            variant="ghost"
            size="md"
            class="w-full"
            @click="isEndGameDialogOpen = false"
          >
            계속 진행
          </BaseButton>
        </div>
      </div>
    </BaseDialog>
  </section>
</template>
