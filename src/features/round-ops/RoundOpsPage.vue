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
  room,
  round,
  gameStatus,
  isHost,
  myId,
  assignmentRound,
  participants,
  latestNotice,
  pendingSubmissions,
  submissionRecords,
  recordsLoaded,
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

const TAB_VALUES = ['ops', 'judge', 'log'] as const

/**
 * 진입 탭 — 대기실의 '지난 라운드 기록 보기'가 `?tab=log`로 들어온다. 쿼리를 믿지 않고
 * 아는 값일 때만 채택한다(오타·오래된 링크는 기본 탭으로 수렴).
 */
const initialTab = String(route.query.tab ?? '')
const activeTab = ref<string>(
  (TAB_VALUES as readonly string[]).includes(initialTab) ? initialTab : 'ops',
)
const isNoticeSheetOpen = ref(false)
const isEndGameDialogOpen = ref(false)
const isFinishRoundDialogOpen = ref(false)
/**
 * 종료 확인에 쓸 값 — 다이얼로그가 **열리는 순간**에 고정한다. 반응형 보간으로 두면 다이얼로그가
 * 떠 있는 동안 다른 기기가 판정을 끝냈을 때 문구가 "0건이 남았어요"로 바뀌어, 진행자가 읽고
 * 판단한 근거와 실제로 확인 중인 대상이 어긋난다.
 */
const finishDialogInfo = ref<{ count: number; uncertain: boolean } | null>(null)
const isJudgeSheetOpen = ref(false)
/** 시트에서 판정 중인 킬샷 — 큐에서 고른 스냅샷을 들고 있는다(닫힌 뒤에도 애니메이션 동안 유지) */
const judgingSubmission = ref<Submission | null>(null)
const isRecordSheetOpen = ref(false)
/** 상세 시트에서 보는 기록 — 판정 시트와 같은 이유로 스냅샷을 들고 있는다 */
const viewingRecord = ref<SubmissionRecord | null>(null)
/** 기록 필터 — 탭을 오가며 목록이 언마운트돼도 좁혀 둔 조건을 잃지 않게 페이지가 들고 있는다 */
const recordStatusFilter = ref<string>('all')
const recordRoundFilter = ref<number | null>(null)

/** 라운드 컨트롤은 게임이 실제로 진행 중일 때만 의미가 있다(rules도 playing에서만 쓰기를 허용한다) */
const isPlaying = computed(() => gameStatus.value === 'playing')
/** 시작 전·종료 상태에는 되돌릴 타이머가 없어 일시정지/재개·시간 조정을 감춘다 */
const canControlTimer = computed(
  () => displayState.value === 'running' || displayState.value === 'paused',
)
/**
 * 타이머가 0에 닿은 상태 — 주 액션은 타이머 재시작이 **아니라** '라운드 종료'다.
 * 기획서 타임테이블이 "1차 게임 20분 → 2차 팀편성 10분"이라, 한 모드는 20분 한 번으로 끝나고
 * 그 자리에 오는 것은 재편성이다(모드마다 편성 단위가 달라 같은 배정을 이어 쓸 수 없다).
 * 재시작을 주 액션으로 두면 startRound가 assignmentRound를 올리지 않으므로 직전 라운드의
 * 미판정 킬샷이 새 20분의 판정 큐에 그대로 남고, 기록도 두 라운드가 한 라운드로 뭉친다.
 */
const isRoundEnded = computed(() => displayState.value === 'ended')

/**
 * 판정 탭의 "라운드 진행 중이 아님" 카드 본문 — assignmentRound>0(적어도 한 번 라운드를 치른 방)
 * 에서는 미판정 건수에 따라 기록 탭으로 보내는 문구가 갈린다. 템플릿에 3중 분기를 그대로 두면
 * 가독성이 떨어지므로 finishDialogDescription과 같은 방식으로 computed로 뺀다.
 */
const judgeIdleCardBody = computed(() =>
  pendingSubmissions.value.length > 0
    ? `판정되지 않은 킬샷 ${pendingSubmissions.value.length}건은 기록 탭에서 확인할 수 있어요.`
    : '지난 라운드의 기록은 기록 탭에서 확인할 수 있어요.',
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
// 게임 상태(playing)는 보지 않는다 — 기록은 라운드가 끝난 대기 상태에서 되짚어 보는 것이라
// 렌더 조건도 같은 기준이어야 한다(둘이 어긋나면 구독만 열리고 화면은 안내 카드에 머문다).
watch([activeTab, phase], ([tab, currentPhase]) => {
  if (tab === 'log' && currentPhase === 'ready') store.subscribeToRecordLog()
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

/**
 * 라운드 종료 — 쓰기는 게임 종료와 같다(방을 waiting으로 되돌리고 round를 지운다). 다른 액션이
 * 아니라 같은 액션에 다른 진입점을 준 것이다: 타이머가 0에 닿은 뒤에는 이게 중단이 아니라
 * 한 라운드를 정상적으로 닫는 정규 경로다. 배정 이력(assignmentRound·완장)은 남으므로 대기실이
 * 다음 차수 배정 CTA를 띄우고, 그 화면에서 다음 라운드의 게임 모드를 고른다.
 */
async function finishRound() {
  const finished = await store.finishGame()
  isFinishRoundDialogOpen.value = false
  if (finished) {
    toast({ title: '라운드를 종료했어요. 대기실에서 다음 라운드를 배정해 주세요.', tone: 'success' })
  }
}

/**
 * 판정하지 않은 킬샷이 남아 있으면 확인을 받고, 없으면 바로 종료한다. 종료하면 방이 waiting이
 * 되어 판정 쓰기가 막히고(rules: playing에서만), 다음 차수 배정을 확정하면 영구히 판정할 수
 * 없다 — 남은 건수가 결정을 바꾸는 정보라 확인을 끼운다. 남은 게 없는 흔한 경우에 다이얼로그를
 * 끼우지 않는 이유는 이 종료가 중단이 아니라 타임테이블대로의 다음 단계이기 때문이다.
 */
function requestFinishRound() {
  // 큐 리스너가 죽으면 store가 stale 큐를 비우므로 "알 수 없음"이 "0건"으로 위장한다 — 그대로
  // 두면 남은 킬샷이 확인 한 번 없이 영구 미판정으로 넘어간다. 모르는 상태는 아는 0건과 다르게
  // 취급해 확인을 끼운다.
  const uncertain = submissionListenError.value !== null
  const count = pendingSubmissions.value.length
  if (count > 0 || uncertain) {
    finishDialogInfo.value = { count, uncertain }
    isFinishRoundDialogOpen.value = true
    return
  }
  void finishRound()
}

/** 열림 시점 스냅샷으로만 문구를 만든다 — 열려 있는 동안 건수가 바뀌어도 근거는 고정된다 */
const finishDialogDescription = computed(() => {
  const info = finishDialogInfo.value
  if (info === null) return ''
  return info.uncertain
    ? '판정 큐 연결이 끊겨 대기 건수를 확인할 수 없어요. 판정되지 않은 킬샷은 킬로 인정되지 않아요.'
    : `대기 중인 킬샷 ${info.count}건이 남았어요. 판정되지 않은 킬샷은 킬로 인정되지 않아요.`
})

/**
 * uncertain(큐 리스너 사망)은 "몇 건이 남았는지"가 아니라 "확인 자체가 불가능하다"가
 * 핵심이라 제목도 그 사실을 그대로 말한다 — count 문구를 재활용하면 알 수 없는 상태를
 * 아는 것처럼 단정하게 된다.
 */
const isFinishDialogUncertain = computed(() => finishDialogInfo.value?.uncertain === true)
const finishDialogTitle = computed(() =>
  isFinishDialogUncertain.value ? '대기 건수를 확인할 수 없어요' : '판정하지 않은 킬샷이 있어요',
)

/**
 * '먼저 판정하기' — 다이얼로그를 닫고 **판정 탭까지 데려간다**. 닫기만 하면 진행자가 탭을 손으로
 * 찾아야 해서 라벨이 약속한 동작과 어긋난다(live-qa 실측 지적).
 */
function goJudgePending() {
  isFinishRoundDialogOpen.value = false
  activeTab.value = 'judge'
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
               시작 전에는 '라운드 시작', 종료 후에는 '라운드 종료' 한 개로 대체한다 -->
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
          <!-- 20분이 끝난 라운드는 여기서 닫고 대기실(재편성)로 넘긴다. 타이머 재시작 버튼을
               두지 않는 이유는 isRoundEnded 주석 참조 -->
          <BaseButton
            v-else-if="isRoundEnded"
            variant="primary"
            size="lg"
            class="w-full"
            :loading="pendingAction === 'end'"
            @click="requestFinishRound"
          >
            라운드 종료
          </BaseButton>
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

          <!-- 시간 조정 — 종료(0:00) 상태에서도 남긴다. −1분 오조작으로 0에 닿으면 복구 수단이
               전무했는데, rules는 방이 playing이면 round 쓰기를 허용하므로 +N분 반영이 그대로
               성립하고 반영되는 순간 타이머가 running으로 돌아온다 -->
          <TimeAdjustCard
            v-if="canControlTimer || isRoundEnded"
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
               ghost로 낮춘다. 실제 실행은 확인 다이얼로그를 거친다.
               종료 상태에서는 감춘다 — 위의 '라운드 종료'와 쓰기가 완전히 같아서, 같은 일을 하는
               버튼이 두 개 보이면 진행자가 둘의 차이를 찾느라 멈춘다(중단 vs 정상 종료). -->
          <BaseButton
            v-if="!isRoundEnded"
            variant="ghost"
            size="md"
            class="w-full text-danger"
            @click="isEndGameDialogOpen = true"
          >
            게임 종료
          </BaseButton>
        </template>

        <!-- 아직 시작하지 않은 방 — rules도 playing에서만 라운드 쓰기를 허용한다.
             assignmentRound>0(적어도 한 번 라운드를 치른 방)에서는 "시작 전" 카피가 사실과
             달라 판정 탭 배지(대기 N건)와 모순되고, 그 모순이 재실행 가드('그대로 다시 시작'
             선택 유도)를 무력화한다. 한 번도 배정된 적 없는 방(0)만 기존 카피를 유지한다 -->
        <BaseCard v-else-if="phase === 'ready'" padding="lg">
          <h2 class="text-subheading text-content">
            {{ assignmentRound > 0 ? '라운드가 종료된 상태예요' : '게임이 아직 시작되지 않았어요' }}
          </h2>
          <p class="mt-3 text-body text-content-secondary">
            {{
              assignmentRound > 0
                ? '대기실에서 다음 라운드를 배정하고 게임을 시작해 주세요.'
                : '대기실에서 팀 배정을 확정하고 게임을 시작하면 라운드를 운영할 수 있어요.'
            }}
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

        <!-- rules도 playing에서만 제출을 허용한다 — 시작 전에는 모일 킬샷이 없다.
             assignmentRound>0(적어도 한 번 라운드를 치른 방)에서는 "시작 전" 카피가 사실과
             달라 판정 탭 배지(대기 N건)와 모순되고, 그 모순이 재실행 가드('그대로 다시 시작'
             선택 유도)를 무력화한다. 한 번도 배정된 적 없는 방(0)만 기존 카피를 유지한다 -->
        <BaseCard v-else-if="phase === 'ready'" padding="lg">
          <h2 class="text-subheading text-content">
            {{ assignmentRound > 0 ? '판정은 라운드 진행 중에만 할 수 있어요' : '게임이 아직 시작되지 않았어요' }}
          </h2>
          <p class="mt-3 text-body text-content-secondary">
            {{
              assignmentRound > 0
                ? judgeIdleCardBody
                : '게임을 시작하면 참가자들이 제출한 킬샷이 이곳에 모여요.'
            }}
          </p>
          <BaseButton
            v-if="assignmentRound > 0"
            variant="ghost"
            size="md"
            class="mt-5 w-full"
            @click="activeTab = 'log'"
          >
            기록 탭 열기
          </BaseButton>
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
        <!-- 판정 탭과 달리 게임 상태를 보지 않는다 — 라운드가 끝나 방이 waiting으로 돌아간 직후가
             호스트가 기록을 확인할 유일한 시점이고, 대기실의 '지난 라운드 기록 보기'도 이리로
             들어온다. 첫 스냅샷 전에는 목록을 그리지 않는다: 빈 배열이 "기록 없음"으로 읽혀
             "아직 기록이 없어요"라는 확언이 도착 전에 떴다 -->
        <RecordLogList
          v-else-if="phase === 'ready' && recordsLoaded"
          v-model:status-filter="recordStatusFilter"
          v-model:round-filter="recordRoundFilter"
          :records="submissionRecords"
          :participants="participants"
          :now-ms="nowMs"
          :round-modes="room?.roundModes ?? {}"
          @select="openRecord"
        />

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

    <!-- 종료 자체는 정규 경로라 확인을 묻지 않지만, 판정을 못 한 킬샷이 남았을 때만 끼어든다.
         남은 건수가 결정을 바꾸는 정보라 설명에 숫자를 넣는다 -->
    <BaseDialog
      v-model:open="isFinishRoundDialogOpen"
      :title="finishDialogTitle"
      :description="finishDialogDescription"
    >
      <div class="flex flex-col gap-5">
        <p class="text-caption leading-(--pr-line-height-relaxed) break-keep text-content-tertiary">
          사진은 삭제되지 않고 기록에 남아요.
        </p>

        <div class="flex flex-col gap-3">
          <BaseButton
            v-if="!isFinishDialogUncertain"
            variant="ghost"
            size="lg"
            class="w-full"
            @click="goJudgePending"
          >
            먼저 판정하기
          </BaseButton>
          <!-- uncertain은 큐 리스너가 죽어 재연결 수단이 없는 상태다 — 판정 탭도 "판정 큐 연결
               오류" 카드뿐이라 데려가도 할 수 있는 게 없으므로, 새로고침을 약속하지 않고
               다이얼로그만 닫는다 -->
          <BaseButton
            v-else
            variant="ghost"
            size="lg"
            class="w-full"
            @click="isFinishRoundDialogOpen = false"
          >
            닫기
          </BaseButton>
          <BaseButton
            variant="danger"
            size="lg"
            class="w-full"
            :loading="pendingAction === 'end'"
            @click="finishRound"
          >
            그대로 라운드 종료
          </BaseButton>
        </div>
      </div>
    </BaseDialog>

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

        <!-- 위 = 안전(계속 진행), 아래 = 파괴(종료). 같은 화면의 킬샷 종료 다이얼로그와 순서·무게를
             맞춘다 — 두 모달의 위치가 반대면 한쪽에서 익힌 손이 다른 쪽에서 오조작으로 이어진다.
             두 버튼의 size는 같게 유지하고 위계는 variant로만 준다 -->
        <div class="flex flex-col gap-3">
          <BaseButton
            variant="ghost"
            size="lg"
            class="w-full"
            @click="isEndGameDialogOpen = false"
          >
            계속 진행
          </BaseButton>
          <BaseButton
            variant="danger"
            size="lg"
            class="w-full"
            :loading="pendingAction === 'end'"
            @click="endGame"
          >
            게임 종료
          </BaseButton>
        </div>
      </div>
    </BaseDialog>
  </section>
</template>
