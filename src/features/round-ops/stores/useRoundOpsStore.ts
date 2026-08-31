import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/features/auth'
import {
  endGame,
  markRoundPlayed,
  subscribeToParticipants,
  subscribeToRoom,
  type Participant,
  type RoomInfo,
  serverNow,
} from '@/features/waiting-room'
import {
  NOTICE_TEXT_MAX_LENGTH,
  sendNotice,
  subscribeToLatestNotice,
  type Notice,
} from '../api/notices'
import {
  ROUND_ADJUST_STEP_MS,
  adjustRound,
  pauseRound,
  resumeRound,
  startRound,
} from '../api/round'
import {
  approveSubmission as requestApproveSubmission,
  getSubmissionStatusFromServer,
  rejectSubmission as requestRejectSubmission,
  subscribeToPendingSubmissions,
  subscribeToSubmissionLog,
  type Submission,
  type SubmissionRecord,
  type SubmissionTarget,
} from '../api/submissions'
import { computeRemainingMs } from '../composables/useRoundTimer'

/**
 * loading: 첫 스냅샷 대기 / ready: 방 구독 중 /
 * not-found: 방 문서 없음(잘못된 코드·삭제) / error: 세션 없음 등 진입 자체가 불가
 */
export type RoundOpsPhase = 'idle' | 'loading' | 'ready' | 'not-found' | 'error'

/**
 * 지금 서버 응답을 기다리는 액션. "쓰기 중"을 boolean 하나로 두면 화면이 그것을 모든 버튼의
 * disabled에 물리게 되고, 왕복 한 번(로컬에서도 ~50ms)마다 관계없는 컨트롤까지 회색으로
 * 깜빡인다. 어떤 액션인지 남겨 두면 눌린 버튼에만 진행 표시를 줄 수 있다.
 */
export type RoundOpsAction = 'start' | 'pause' | 'resume' | 'adjust' | 'end' | 'judge'

/** 액션 실패는 원인을 나눠 봐야 진행자가 할 일이 달라지지 않는다 — 한 문구로 모은다 */
const ACTION_ERROR_MESSAGE = '요청을 처리하지 못했어요. 다시 시도해 주세요.'

/**
 * 판정 큐 Listen의 영구 오류 안내. 리스너는 한 번 죽으면 재연결하지 않아 큐가 조용히 빈
 * 것처럼 보인다(실사례: rules 배포 전에 열려 있던 화면의 permission-denied) — 새로고침을
 * 안내해 죽은 화면을 계속 믿지 않게 한다.
 */
const SUBMISSIONS_LISTEN_ERROR_MESSAGE = '판정 큐 연결이 끊겼어요. 화면을 새로고침해 주세요.'

/** 기록 로그 Listen의 영구 오류 안내 — 판정 큐와 같은 이유(죽은 리스너는 재연결하지 않는다) */
const RECORD_LOG_LISTEN_ERROR_MESSAGE = '기록 연결이 끊겼어요. 화면을 새로고침해 주세요.'

/**
 * H04 라운드 운영 상태 — 호스트(진행자) 전용. 방 문서(rooms/{code})의 round 맵이 타이머의
 * 정본이라 새로고침·기기 교체에도 복원되고, 참가자 명단·최근 공지도 같은 방 경로에서 구독한다.
 *
 * 남은 시간은 여기에 저장하지 않는다. 쓰기 직전 클릭 순간에만 computeRemainingMs로 파생시키고
 * (화면의 1초 tick과 같은 함수), 서버에는 "지금부터 남은 시간만큼"으로 다시 앵커한다.
 */
export const useRoundOpsStore = defineStore('roundOps', () => {
  const authStore = useAuthStore()

  const roomCode = ref<string | null>(null)
  const phase = ref<RoundOpsPhase>('idle')
  const room = ref<RoomInfo | null>(null)
  const participants = ref<Participant[]>([])
  const latestNotice = ref<Notice | null>(null)
  /** 판정 대기 킬샷 — 오래된 순(api가 정렬). 판정되면 서버 필터(pending)로 자연 제거된다 */
  const pendingSubmissions = ref<Submission[]>([])
  /** 전 라운드 판정 이력 — 최신이 위(api가 정렬). 기록 탭이 처음 열릴 때만 구독한다 */
  const submissionRecords = ref<SubmissionRecord[]>([])
  /**
   * 첫 기록 스냅샷이 도착했는지 — 빈 배열만으로는 "기록이 없다"와 "아직 안 왔다"를 구분할 수
   * 없어, 화면이 구독 직후에 "아직 기록이 없어요"라는 확언을 띄우던 오표시를 막는다.
   */
  const recordsLoaded = ref(false)
  /** −1분/+1분으로 쌓는 로컬 대기값 — '반영'을 눌러야 서버(참가자 전원)에 커밋된다 */
  const pendingAdjustMinutes = ref(0)
  const pendingAction = ref<RoundOpsAction | null>(null)
  /** 쓰기 가드용 파생값 — 화면은 이 값 대신 pendingAction으로 "무엇이 실행 중인지"를 본다 */
  const isActionPending = computed(() => pendingAction.value !== null)
  const actionError = ref<string | null>(null)
  const submissionListenError = ref<string | null>(null)
  const recordListenError = ref<string | null>(null)
  const isSendingNotice = ref(false)

  let unsubscribeRoom: (() => void) | null = null
  let unsubscribeParticipants: (() => void) | null = null
  let unsubscribeNotice: (() => void) | null = null
  let unsubscribeSubmissions: (() => void) | null = null
  let unsubscribeRecords: (() => void) | null = null
  let subscribedSubmissionRound: number | null = null
  /** leave/enter를 거친 이전 화면의 비동기 완료가 현재 화면 상태를 덮지 못하게 하는 세대값 */
  let sessionGeneration = 0

  const myId = computed(() => authStore.user?.uid ?? null)
  const isHost = computed(() => room.value !== null && room.value.hostUid === myId.value)
  const gameStatus = computed(() => room.value?.status ?? null)
  /** 팀편성 차수 = 라운드 번호. 라운드 운영은 별도 번호를 두지 않고 이 값을 그대로 쓴다 */
  const assignmentRound = computed(() => room.value?.assignmentRound ?? 0)
  const round = computed(() => room.value?.round ?? null)

  function subscribeToCurrentRoundSubmissions(code: string, roundNumber: number) {
    if (subscribedSubmissionRound === roundNumber) return

    unsubscribeSubmissions?.()
    pendingSubmissions.value = []
    subscribedSubmissionRound = roundNumber
    unsubscribeSubmissions = subscribeToPendingSubmissions(
      code,
      roundNumber,
      (submissions) => {
        if (subscribedSubmissionRound !== roundNumber) return
        submissionListenError.value = null
        pendingSubmissions.value = submissions
      },
      () => {
        if (subscribedSubmissionRound !== roundNumber) return
        pendingSubmissions.value = []
        submissionListenError.value = SUBMISSIONS_LISTEN_ERROR_MESSAGE
      },
    )
  }

  /** 운영 화면 진입 — 방 문서에서 현재 배정 차수를 확인한 뒤 그 차수의 판정 큐를 구독한다. */
  function enter(code: string) {
    leave()
    roomCode.value = code
    phase.value = 'loading'

    // 라우트 가드(requiresAuth)가 미인증 진입을 막지만, 세션이 사라진 경계 상황을 방어한다
    if (!authStore.user) {
      phase.value = 'error'
      return
    }

    unsubscribeRoom = subscribeToRoom(code, (nextRoom) => {
      room.value = nextRoom
      phase.value = nextRoom === null ? 'not-found' : 'ready'
      if (nextRoom === null) {
        unsubscribeSubmissions?.()
        unsubscribeSubmissions = null
        subscribedSubmissionRound = null
        pendingSubmissions.value = []
        unsubscribeRecords?.()
        unsubscribeRecords = null
        submissionRecords.value = []
        return
      }
      subscribeToCurrentRoundSubmissions(code, nextRoom.assignmentRound ?? 0)
    })
    unsubscribeParticipants = subscribeToParticipants(code, (nextParticipants) => {
      participants.value = nextParticipants
    })
    unsubscribeNotice = subscribeToLatestNotice(code, (notice) => {
      latestNotice.value = notice
    })
  }

  /** 화면 이탈 시 구독 해제 + 로컬 대기값 폐기(다음 진입에 이전 조정이 남지 않게) */
  function leave() {
    sessionGeneration += 1
    unsubscribeRoom?.()
    unsubscribeParticipants?.()
    unsubscribeNotice?.()
    unsubscribeSubmissions?.()
    unsubscribeRecords?.()
    unsubscribeRoom = null
    unsubscribeParticipants = null
    unsubscribeNotice = null
    unsubscribeSubmissions = null
    unsubscribeRecords = null
    subscribedSubmissionRound = null
    roomCode.value = null
    room.value = null
    participants.value = []
    latestNotice.value = null
    pendingSubmissions.value = []
    submissionRecords.value = []
    recordsLoaded.value = false
    pendingAdjustMinutes.value = 0
    pendingAction.value = null
    actionError.value = null
    submissionListenError.value = null
    recordListenError.value = null
    phase.value = 'idle'
  }

  /**
   * 기록 로그 구독 시작 — 사진 포함 전체 이력이라 무거워서 enter에서 항상 열지 않고,
   * 기록 탭이 처음 활성화될 때 화면이 호출한다. 이미 구독 중이면 아무것도 하지 않는다.
   * 이름은 api 계층의 subscribeToXxx 계열과 동사를 맞춘다(같은 일에 두 동사를 쓰지 않는다).
   */
  function subscribeToRecordLog() {
    if (roomCode.value === null || unsubscribeRecords !== null) return
    unsubscribeRecords = subscribeToSubmissionLog(
      roomCode.value,
      (records) => {
        recordsLoaded.value = true
        recordListenError.value = null
        submissionRecords.value = records
      },
      // 오류 콜백에서는 loaded를 세우지 않는다 — 화면이 빈 목록이 아니라 오류 카드를 띄워야 한다
      () => {
        submissionRecords.value = []
        recordListenError.value = RECORD_LOG_LISTEN_ERROR_MESSAGE
      },
    )
  }

  /** 라운드 쓰기의 공통 가드 — 호스트 본인 + 진행 중(playing)인 방에서만, 한 번에 하나씩 */
  function canWriteRound(): boolean {
    return (
      roomCode.value !== null &&
      isHost.value &&
      gameStatus.value === 'playing' &&
      !isActionPending.value
    )
  }

  /** 실패해도 화면은 마지막 스냅샷을 유지하고 안내만 세운다(오프라인 큐는 SDK가 처리한다) */
  async function runAction(
    action: RoundOpsAction,
    write: () => Promise<void>,
    reportError = true,
  ) {
    const actionGeneration = sessionGeneration
    pendingAction.value = action
    actionError.value = null
    try {
      await write()
      return true
    } catch {
      if (reportError && actionGeneration === sessionGeneration) {
        actionError.value = ACTION_ERROR_MESSAGE
      }
      return false
    } finally {
      if (actionGeneration === sessionGeneration) pendingAction.value = null
    }
  }

  /**
   * 라운드 시작·재시작 — 기본 20분으로 카운트다운을 건다.
   *
   * 시작에 성공한 차수만 "플레이했음"으로 마크한다. 대기실의 재실행 가드(hasPlayedRound)가
   * 이 마커를 근거로 같은 차수 재시작을 확인받는데, 실패한 시도까지 마크하면 라운드가 실제로는
   * 시작되지 않은 방에서도 경고가 뜨는 오시작 복구 경로를 막는다.
   */
  async function start() {
    if (!canWriteRound()) return
    const code = roomCode.value!
    const playedRound = assignmentRound.value
    const started = await runAction('start', () => startRound(code))
    if (started) markRoundPlayed(code, playedRound)
  }

  /** 올스탑 — 진행 중일 때만. 클릭 순간의 남은 시간을 서버에 고정한다 */
  async function pause() {
    if (!canWriteRound() || round.value?.status !== 'running') return
    const remainingMs = computeRemainingMs(round.value, serverNow())
    await runAction('pause', () => pauseRound(roomCode.value!, remainingMs))
  }

  /** 재개 — 정지 중일 때만. 고정해 둔 남은 시간부터 다시 흐른다 */
  async function resume() {
    if (!canWriteRound() || round.value?.status !== 'paused') return
    const remainingMs = computeRemainingMs(round.value, serverNow())
    await runAction('resume', () => resumeRound(roomCode.value!, remainingMs))
  }

  /** −1분/+1분 — 서버에 쓰지 않고 대기값만 쌓는다(오조작을 '반영' 전에 되돌릴 수 있게) */
  function adjustBy(minutes: number) {
    pendingAdjustMinutes.value += minutes
  }

  /** 대기값 반영 — 성공했을 때만 대기값을 비운다(실패하면 그대로 두고 재시도할 수 있게) */
  async function applyAdjust() {
    const currentRound = round.value
    if (!canWriteRound() || currentRound === null || pendingAdjustMinutes.value === 0) return
    const remainingMs = computeRemainingMs(currentRound, serverNow())
    const appliedMinutes = pendingAdjustMinutes.value
    const deltaMs = appliedMinutes * ROUND_ADJUST_STEP_MS
    const applied = await runAction('adjust', () =>
      adjustRound(roomCode.value!, currentRound.status, remainingMs, deltaMs),
    )
    // 요청 중 새로 누른 조정값은 다음 반영 대상으로 남긴다. 전체를 0으로 만들면 입력이 유실된다.
    if (applied) pendingAdjustMinutes.value -= appliedMinutes
  }

  /**
   * 게임 종료 — 방을 대기 상태로 되돌리고 진행 중인 라운드를 지운다. 전원이 대기실로 돌아가는
   * 되돌릴 수 없는 액션이라, 확인 절차는 화면(다이얼로그)이 책임지고 여기서는 가드만 본다.
   * 라운드가 아직 시작되지 않았어도(round null) 게임 자체는 종료할 수 있다.
   */
  async function finishGame() {
    if (
      roomCode.value === null ||
      !isHost.value ||
      gameStatus.value !== 'playing' ||
      isActionPending.value
    ) {
      return false
    }
    return runAction('end', () => endGame(roomCode.value!))
  }

  /**
   * 판정 확정 — 사진 속 완장의 팀을 기록한다. rules가 pending → approved 단방향만 허용하므로
   * 다른 기기에서 먼저 판정된 문서면 실패한다(화면은 에러 토스트 후 스냅샷으로 수렴).
   */
  async function approveSubmission(submissionId: string, target: SubmissionTarget) {
    if (!canWriteRound()) return false
    return runAction(
      'judge',
      () => requestApproveSubmission(roomCode.value!, submissionId, target),
      false,
    )
  }

  /** 반려 — 사유 없이 상태만 남긴다(확정 스펙). 성공 여부를 돌려준다 */
  async function rejectSubmission(submissionId: string) {
    if (!canWriteRound()) return false
    return runAction(
      'judge',
      () => requestRejectSubmission(roomCode.value!, submissionId),
      false,
    )
  }

  /** 판정 실패가 실제 선판정 충돌인지 서버 정본으로 확인한다. 조회 실패는 호출부가 일반 오류로 처리한다. */
  async function getSubmissionStatus(submissionId: string) {
    if (roomCode.value === null) return null
    return getSubmissionStatusFromServer(roomCode.value, submissionId)
  }

  /**
   * 공지 전송 — 성공 여부를 돌려준다(화면이 시트를 닫고 토스트를 띄우는 판단에 쓴다).
   * 빈 문자열·상한 초과는 서버(rules)도 막지만, 왕복 없이 여기서 먼저 거른다.
   */
  async function submitNotice(text: string): Promise<boolean> {
    const trimmed = text.trim()
    if (
      roomCode.value === null ||
      !isHost.value ||
      isSendingNotice.value ||
      trimmed.length === 0 ||
      trimmed.length > NOTICE_TEXT_MAX_LENGTH
    ) {
      return false
    }
    isSendingNotice.value = true
    actionError.value = null
    try {
      await sendNotice(roomCode.value, trimmed)
      return true
    } catch {
      actionError.value = ACTION_ERROR_MESSAGE
      return false
    } finally {
      isSendingNotice.value = false
    }
  }

  return {
    roomCode,
    phase,
    room,
    participants,
    latestNotice,
    pendingSubmissions,
    submissionRecords,
    recordsLoaded,
    pendingAdjustMinutes,
    pendingAction,
    isActionPending,
    actionError,
    submissionListenError,
    recordListenError,
    isSendingNotice,
    myId,
    isHost,
    gameStatus,
    assignmentRound,
    round,
    enter,
    leave,
    subscribeToRecordLog,
    start,
    pause,
    resume,
    adjustBy,
    applyAdjust,
    finishGame,
    approveSubmission,
    rejectSubmission,
    getSubmissionStatus,
    submitNotice,
  }
})
