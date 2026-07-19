import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchMyGender, useAuthStore } from '@/features/auth'
import {
  RoomNotFoundError,
  getRoom,
  joinRoom,
  setReady,
  subscribeToParticipants,
  subscribeToRoom,
  type Participant,
  type RoomInfo,
} from '../api/rooms'

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

  let unsubscribeParticipants: (() => void) | null = null
  let unsubscribeRoom: (() => void) | null = null

  const myId = computed(() => authStore.user?.uid ?? null)
  const isHost = computed(() => room.value !== null && room.value.hostUid === myId.value)
  const gameStatus = computed(() => room.value?.status ?? null)

  /**
   * 화면에 보이는 명단 = 플레이어만. 호스트는 진행자라 제외한다
   * (진행자 모델 도입 전에 호스트가 참가자로 등록된 기존 방 데이터도 함께 걸러진다)
   */
  const participants = computed(() =>
    allParticipants.value.filter((participant) => participant.id !== room.value?.hostUid),
  )
  const participantCount = computed(() => participants.value.length)
  const readyCount = computed(() => participants.value.filter((p) => p.isReady).length)
  const isReadyConfirmed = computed(
    () => participants.value.find((p) => p.id === myId.value)?.isReady ?? false,
  )

  /** 대기실 입장 — 게스트만 참가 등록(멱등)하고, 방 문서·명단 실시간 구독을 시작한다 */
  async function enter(code: string) {
    leave()
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
      if (!roomInfo) {
        phase.value = 'not-found'
        return
      }
      // 구독 스냅샷이 오기 전에도 호스트/게스트 분기가 서도록 즉시 반영한다
      room.value = roomInfo

      if (roomInfo.hostUid !== user.uid) {
        // 성별은 명단 표기용 보조 정보 — 프로필 조회가 실패해도 입장을 막지 않는다
        const gender = await fetchMyGender(user.uid).catch(() => null)
        await joinRoom(code, { uid: user.uid, nickname: user.displayName ?? '', gender })
      }
    } catch (error) {
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

  /** 화면 이탈 시 구독 해제 — 참가자 문서 삭제(퇴장 처리)는 이후 단계에서 다룬다 */
  function leave() {
    unsubscribeParticipants?.()
    unsubscribeRoom?.()
    unsubscribeParticipants = null
    unsubscribeRoom = null
    roomCode.value = null
    room.value = null
    allParticipants.value = []
    phase.value = 'idle'
    readyError.value = null
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

  return {
    roomCode,
    phase,
    room,
    participants,
    myId,
    isHost,
    gameStatus,
    participantCount,
    readyCount,
    isReadyConfirmed,
    isConfirmingReady,
    readyError,
    enter,
    leave,
    confirmReady,
  }
})
