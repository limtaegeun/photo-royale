import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchMyGender, useAuthStore } from '@/features/auth'
import {
  RoomNotFoundError,
  getRoom,
  isAssignedInRound,
  joinRoom,
  setReady,
  startGame,
  subscribeToParticipants,
  subscribeToRoom,
  type Participant,
  type RoomInfo,
} from '../api/rooms'
import { isRoundLiveAt } from '../roundClock'
import { serverNow } from '../serverClock'

/**
 * joining: 입장 처리 중(입장 직후 로딩) / joined: 명단 구독 중 /
 * not-found: 초대 코드에 해당하는 방 없음 / error: 그 외 실패(권한·네트워크)
 */
export type WaitingRoomPhase = 'idle' | 'joining' | 'joined' | 'not-found' | 'error'

/**
 * P02 대기실 상태 — Firestore rooms/{code} 문서와 participants 하위 컬렉션을 실시간
 * 구독한다. 호스트는 플레이어가 아니라 진행자다(Kahoot 모델): 참가자로 등록되지 않고
 * 입장 명단에도 나타나지 않으며, 진행 컨트롤(팀 배정)만 갖는다.
 * 게스트 입장(enter)은 새로고침에도 안전하게 멱등이다.
 */
export const useWaitingRoomStore = defineStore('waitingRoom', () => {
  const authStore = useAuthStore()

  const roomCode = ref<string | null>(null)
  const phase = ref<WaitingRoomPhase>('idle')
  const room = ref<RoomInfo | null>(null)
  const allParticipants = ref<Participant[]>([])
  const isConfirmingReady = ref(false)
  const readyError = ref<string | null>(null)
  const isStartingGame = ref(false)
  const startGameError = ref<string | null>(null)

  let unsubscribeParticipants: (() => void) | null = null
  let unsubscribeRoom: (() => void) | null = null
  /**
   * 입장 시도 세대 번호. enter()는 getRoom·joinRoom을 await한 뒤에야 구독을 만들므로, 그 사이
   * 화면을 떠나면(leave) 해제할 주체가 사라진 구독이 뒤늦게 생겨 영구히 남고 다른 방의 상태까지
   * 덮어썼다. enter는 시작 시점의 세대를 들고 있다가 await 재개마다 최신 세대인지 확인하고,
   * leave는 세대를 올려 진행 중인 enter를 무효화한다.
   */
  let enterGeneration = 0

  const myId = computed(() => authStore.user?.uid ?? null)
  const isHost = computed(() => room.value !== null && room.value.hostUid === myId.value)
  const gameStatus = computed(() => room.value?.status ?? null)
  /**
   * 지금 뛰는 중인 라운드가 있는가 — 게임 시작(playing)과 다르다. 게임 시작은 "배정이 끝나고
   * 진행자가 운영 화면으로 갔다"는 뜻일 뿐이라, 이 값이 false인 동안 플레이어는 아직 뛰지 않는다.
   * 콕핏 전환 기준은 playing이 아니라 이 값이다.
   *
   * 'round 필드가 있다'로는 부족하다. 타이머가 0에 닿아도 round는 호스트가 게임을 종료할 때까지
   * 남아 있어서, 종료 뒤 콕핏에서 나온 게스트를 대기실이 즉시 콕핏으로 되밀어 낸다(A-4).
   * 시간을 함께 보므로 진행자가 시간을 더하면 이 값이 다시 참이 되어 자동 재진입도 살아난다.
   *
   * 판정 시각은 기기 시계가 아니라 **서버 보정 시각**이다 — 시계가 앞선 기기만 라운드를 일찍
   * 끝난 것으로 보고 혼자 이탈해 돌아오지 못하던 문제를 막는다(QA M-07, serverClock 참조).
   *
   * 방 스냅샷이 바뀔 때만 다시 계산한다(시각은 반응형이 아니다) — 이걸로 충분하다.
   * 남은 시간이 있는 동안 게스트는 이미 콕핏에 있고, 0이 된 뒤 이 값을 되살리는 것은
   * 시간 추가·다음 라운드 시작 같은 방 문서 쓰기뿐이다.
   */
  const isRoundLive = computed(() => isRoundLiveAt(room.value?.round ?? null, serverNow()))
  /** 확정된 팀편성 차수 — 0이면 아직 배정 전 */
  const assignmentRound = computed(() => room.value?.assignmentRound ?? 0)

  /**
   * 화면에 보이는 명단 = 플레이어만. 호스트는 진행자라 제외한다
   * (진행자 모델 도입 전에 호스트가 참가자로 등록된 기존 방 데이터도 함께 걸러진다)
   */
  const participants = computed(() =>
    allParticipants.value.filter((participant) => participant.id !== room.value?.hostUid),
  )
  const participantCount = computed(() => participants.value.length)
  const readyCount = computed(() => participants.value.filter((p) => p.isReady).length)
  /** 배정 완료 후 참가자가 한 명 이상 있고 전원이 이번 라운드 준비를 마쳐야 시작할 수 있다. */
  const canStartGame = computed(
    () =>
      assignmentRound.value > 0 &&
      participantCount.value > 0 &&
      readyCount.value === participantCount.value,
  )
  const isReadyConfirmed = computed(
    () => participants.value.find((p) => p.id === myId.value)?.isReady ?? false,
  )

  /**
   * 명단 표시용 — 이번 라운드 배정이 아닌 완장은 숨긴다(null). 직전 라운드에 배정됐다가 이번엔
   * 대기자로 내려간 참가자의 team이 문서에 남아 있어도 유령 완장으로 보이지 않게 하는 단일 기준이다.
   */
  const roster = computed(() =>
    participants.value.map((participant) => ({
      ...participant,
      team: isAssignedInRound(participant, assignmentRound.value) ? participant.team : null,
    })),
  )

  /**
   * 내 이번 라운드 배정 — 배정 카드(P03)가 쓰는 유일한 소스. 이번 라운드에 배정되지 않았으면
   * (미배정·대기자·늦은 합류) null이라 카드가 뜨지 않고 기존 대기실 뷰가 유지된다.
   * 팀원도 같은 기준으로 걸러 다른 라운드의 잔재가 팀원 목록에 섞이지 않게 한다.
   */
  const myAssignment = computed(() => {
    const me = participants.value.find((participant) => participant.id === myId.value)
    if (me === undefined || !isAssignedInRound(me, assignmentRound.value)) return null
    return {
      armband: me.team!,
      isXTeam: me.isXTeam,
      members: participants.value
        .filter(
          (participant) =>
            isAssignedInRound(participant, assignmentRound.value) && participant.team === me.team,
        )
        .map((participant) => ({ id: participant.id, name: participant.name })),
    }
  })

  /**
   * 대기실 입장 — 게스트만 참가 등록(멱등)하고, 방 문서·명단 실시간 구독을 시작한다.
   * 진행 중에 화면을 떠나면(leave) 세대가 올라가므로 이후 단계를 모두 건너뛴다 — 해제할
   * 주체 없는 구독을 만들지 않고, 이미 비워진 상태를 되살리지도 않는다.
   */
  async function enter(code: string) {
    leave()
    const generation = ++enterGeneration
    roomCode.value = code
    phase.value = 'joining'

    // 라우트 가드(requiresAuth)가 미인증 진입을 막지만, 세션이 사라진 경계 상황을 방어한다
    const user = authStore.user
    if (!user) {
      phase.value = 'error'
      return
    }

    try {
      const roomInfo = await getRoom(code)
      if (generation !== enterGeneration) return
      if (!roomInfo) {
        phase.value = 'not-found'
        return
      }
      // 구독 스냅샷이 오기 전에도 호스트/게스트 분기가 서도록 즉시 반영한다
      room.value = roomInfo

      if (roomInfo.hostUid !== user.uid) {
        // 성별은 명단 표기용 보조 정보 — 프로필 조회가 실패해도 입장을 막지 않는다
        const gender = await fetchMyGender(user.uid).catch(() => null)
        if (generation !== enterGeneration) return
        await joinRoom(code, { uid: user.uid, nickname: user.displayName ?? '', gender })
        if (generation !== enterGeneration) return
      }
    } catch (error) {
      if (generation !== enterGeneration) return
      // getRoom과 joinRoom 사이에 방이 사라진 레이스도 잘못된 코드와 같은 안내로 수렴시킨다
      phase.value = error instanceof RoomNotFoundError ? 'not-found' : 'error'
      return
    }

    unsubscribeRoom = subscribeToRoom(code, (nextRoom) => {
      room.value = nextRoom
      // 입장 후 방 문서가 사라진 경우(정리 등) — 잘못된 코드와 같은 안내로 수렴시킨다
      if (nextRoom === null) phase.value = 'not-found'
    })
    unsubscribeParticipants = subscribeToParticipants(code, (nextParticipants) => {
      allParticipants.value = nextParticipants
    })
    phase.value = 'joined'
  }

  /**
   * 화면 이탈 시 구독 해제 — 참가자 문서 삭제(퇴장 처리)는 이후 단계에서 다룬다.
   * 세대를 올려 진행 중인 enter()도 함께 무효화한다(뒤늦은 구독 생성 방지).
   */
  function leave() {
    enterGeneration++
    unsubscribeParticipants?.()
    unsubscribeRoom?.()
    unsubscribeParticipants = null
    unsubscribeRoom = null
    roomCode.value = null
    room.value = null
    allParticipants.value = []
    phase.value = 'idle'
    readyError.value = null
    startGameError.value = null
  }

  /** 안전 수칙 동의 + 내 준비 완료 확정(게스트 전용) — 스냅샷 구독이 상태를 갱신한다 */
  async function confirmReady() {
    if (
      !roomCode.value ||
      !myId.value ||
      isHost.value ||
      isReadyConfirmed.value ||
      isConfirmingReady.value
    ) {
      return
    }
    isConfirmingReady.value = true
    readyError.value = null
    try {
      await setReady(roomCode.value, myId.value)
    } catch {
      readyError.value = '준비 완료 처리에 실패했어요. 다시 시도해 주세요.'
    } finally {
      isConfirmingReady.value = false
    }
  }

  /**
   * 게임 시작(호스트 전용) — 방 status를 playing으로 전이한다. 화면 전환은 각 참가자의
   * 방 스냅샷 구독이 담당하므로(호스트 자신도 포함) 여기서 라우팅하지 않는다.
   * 배정이 한 번도 확정되지 않았으면(차수 0) 완장 없이 게임이 시작되므로 막는다.
   */
  async function startPlaying() {
    if (!roomCode.value || !isHost.value || isStartingGame.value) return
    if (assignmentRound.value === 0) {
      startGameError.value = '팀 배정을 먼저 확정해 주세요.'
      return
    }
    if (!canStartGame.value) {
      startGameError.value = '모든 참가자가 준비를 완료해야 시작할 수 있어요.'
      return
    }
    isStartingGame.value = true
    startGameError.value = null
    try {
      await startGame(roomCode.value)
    } catch {
      startGameError.value = '게임을 시작하지 못했어요. 다시 시도해 주세요.'
    } finally {
      isStartingGame.value = false
    }
  }

  return {
    roomCode,
    phase,
    room,
    participants,
    myId,
    isHost,
    gameStatus,
    isRoundLive,
    assignmentRound,
    roster,
    myAssignment,
    participantCount,
    readyCount,
    canStartGame,
    isReadyConfirmed,
    isConfirmingReady,
    readyError,
    isStartingGame,
    startGameError,
    enter,
    leave,
    confirmReady,
    startPlaying,
  }
})
