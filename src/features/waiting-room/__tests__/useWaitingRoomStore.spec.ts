import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Participant, RoomInfo } from '../api/rooms'

// 테스트마다 로그인 상태를 바꿀 수 있도록 getter로 참조한다
const authState = { user: null as { uid: string; displayName: string } | null }
const fetchMyGenderMock = vi.fn<(uid: string) => Promise<'male' | 'female' | null>>()
vi.mock('@/features/auth', () => ({
  useAuthStore: () => ({
    get user() {
      return authState.user
    },
  }),
  fetchMyGender: (uid: string) => fetchMyGenderMock(uid),
}))

const getRoomMock = vi.fn<(code: string) => Promise<RoomInfo | null>>()
const joinRoomMock =
  vi.fn<
    (
      code: string,
      member: { uid: string; nickname: string; gender: 'male' | 'female' | null },
    ) => Promise<void>
  >()
const setReadyMock = vi.fn<(code: string, uid: string) => Promise<void>>()
const startGameMock = vi.fn<(code: string) => Promise<void>>()
const kickParticipantMock = vi.fn<(code: string, uid: string) => Promise<void>>()
const unsubscribeParticipantsMock = vi.fn<() => void>()
const unsubscribeRoomMock = vi.fn<() => void>()
const subscribeParticipantsMock =
  vi.fn<(code: string, onChange: (participants: Participant[]) => void) => () => void>()
const subscribeRoomMock =
  vi.fn<(code: string, onChange: (room: RoomInfo | null) => void) => () => void>()

vi.mock('../api/rooms', () => ({
  RoomNotFoundError: class RoomNotFoundError extends Error {},
  // 순수 판정 함수 — firebase에 의존하지 않으므로 실제와 같은 로직을 그대로 쓴다
  isAssignedInRound: (participant: Participant, assignmentRound: number) =>
    assignmentRound > 0 &&
    participant.team !== null &&
    participant.assignedRound === assignmentRound,
  getRoom: (code: string) => getRoomMock(code),
  joinRoom: (
    code: string,
    member: { uid: string; nickname: string; gender: 'male' | 'female' | null },
  ) => joinRoomMock(code, member),
  setReady: (code: string, uid: string) => setReadyMock(code, uid),
  startGame: (code: string) => startGameMock(code),
  kickParticipant: (code: string, uid: string) => kickParticipantMock(code, uid),
  subscribeToParticipants: (code: string, onChange: (participants: Participant[]) => void) =>
    subscribeParticipantsMock(code, onChange),
  subscribeToRoom: (code: string, onChange: (room: RoomInfo | null) => void) =>
    subscribeRoomMock(code, onChange),
}))

import { RoomNotFoundError } from '../api/rooms'
import { useWaitingRoomStore } from '../stores/useWaitingRoomStore'

/** 구독 콜백들을 붙잡아 테스트가 스냅샷 도착을 흉내 낼 수 있게 한다 */
function captureSnapshotCallbacks() {
  let deliverParticipants: (participants: Participant[]) => void = () => {}
  let deliverRoom: (room: RoomInfo | null) => void = () => {}
  subscribeParticipantsMock.mockImplementation((_code, onChange) => {
    deliverParticipants = onChange
    return unsubscribeParticipantsMock
  })
  subscribeRoomMock.mockImplementation((_code, onChange) => {
    deliverRoom = onChange
    return unsubscribeRoomMock
  })
  return {
    participants: (participants: Participant[]) => deliverParticipants(participants),
    room: (room: RoomInfo | null) => deliverRoom(room),
  }
}

const GUEST_ROOM: RoomInfo = {
  hostUid: 'host9',
  status: 'waiting',
  assignmentRound: 0,
  gameMode: 'normal',
  roundModes: {},
  round: null,
}
const MY_ROOM: RoomInfo = {
  hostUid: 'me',
  status: 'waiting',
  assignmentRound: 0,
  gameMode: 'normal',
  roundModes: {},
  round: null,
}

const ME_WAITING: Participant = {
  id: 'me',
  name: '오리',
  team: null,
  assignedRound: 0,
  gender: 'male',
  isXTeam: false,
  sameGenderStreak: 0,
  previousPartnerIds: [],
  isReady: false,
}
const ME_READY: Participant = { ...ME_WAITING, isReady: true }
const OTHER_READY: Participant = {
  id: 'u2',
  name: '하린',
  team: null,
  assignedRound: 0,
  gender: 'female',
  isXTeam: false,
  sameGenderStreak: 0,
  previousPartnerIds: [],
  isReady: true,
}

describe('useWaitingRoomStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    authState.user = { uid: 'me', displayName: '오리' }
    fetchMyGenderMock.mockReset().mockResolvedValue('male')
    getRoomMock.mockReset().mockResolvedValue(GUEST_ROOM)
    joinRoomMock.mockReset().mockResolvedValue(undefined)
    setReadyMock.mockReset().mockResolvedValue(undefined)
    startGameMock.mockReset().mockResolvedValue(undefined)
    kickParticipantMock.mockReset().mockResolvedValue(undefined)
    subscribeParticipantsMock.mockReset().mockReturnValue(unsubscribeParticipantsMock)
    subscribeRoomMock.mockReset().mockReturnValue(unsubscribeRoomMock)
    unsubscribeParticipantsMock.mockReset()
    unsubscribeRoomMock.mockReset()
  })

  it('게스트 enter는 내 성별을 포함해 참가 등록 후 방 문서·명단 구독을 시작한다', async () => {
    const deliver = captureSnapshotCallbacks()
    const store = useWaitingRoomStore()

    await store.enter('AB2C')

    expect(fetchMyGenderMock).toHaveBeenCalledWith('me')
    expect(joinRoomMock).toHaveBeenCalledWith('AB2C', {
      uid: 'me',
      nickname: '오리',
      gender: 'male',
    })
    expect(store.roomCode).toBe('AB2C')
    expect(store.phase).toBe('joined')
    // 구독 스냅샷 전에도 getRoom 결과로 호스트/게스트 분기가 서 있다
    expect(store.isHost).toBe(false)
    expect(store.gameStatus).toBe('waiting')

    deliver.participants([ME_WAITING, OTHER_READY])
    expect(store.participantCount).toBe(2)
    expect(store.readyCount).toBe(1)
    expect(store.isReadyConfirmed).toBe(false)
  })

  it('성별 조회에 실패해도 gender 없이(null) 입장을 진행한다', async () => {
    captureSnapshotCallbacks()
    fetchMyGenderMock.mockRejectedValue(new Error('network'))
    const store = useWaitingRoomStore()

    await store.enter('AB2C')

    expect(joinRoomMock).toHaveBeenCalledWith('AB2C', {
      uid: 'me',
      nickname: '오리',
      gender: null,
    })
    expect(store.phase).toBe('joined')
  })

  it('호스트 enter는 참가자로 등록하지 않는다(진행자 모델)', async () => {
    captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue(MY_ROOM)
    const store = useWaitingRoomStore()

    await store.enter('AB2C')

    expect(joinRoomMock).not.toHaveBeenCalled()
    expect(store.phase).toBe('joined')
    expect(store.isHost).toBe(true)
  })

  it('명단에서 호스트를 제외한다 — 진행자 모델 이전에 등록된 호스트 문서도 걸러진다', async () => {
    const deliver = captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue(MY_ROOM)
    const store = useWaitingRoomStore()
    await store.enter('AB2C')

    deliver.participants([ME_READY, OTHER_READY]) // 'me'는 호스트인데 참가자 문서가 남아 있는 경우

    expect(store.participants).toEqual([OTHER_READY])
    expect(store.participantCount).toBe(1)
    expect(store.readyCount).toBe(1)
  })

  it('방이 없으면 phase가 not-found가 되고 참가·구독하지 않는다', async () => {
    getRoomMock.mockResolvedValue(null)
    const store = useWaitingRoomStore()

    await store.enter('ZZZZ')

    expect(store.phase).toBe('not-found')
    expect(joinRoomMock).not.toHaveBeenCalled()
    expect(subscribeParticipantsMock).not.toHaveBeenCalled()
    expect(subscribeRoomMock).not.toHaveBeenCalled()
  })

  it('getRoom과 joinRoom 사이에 방이 사라진 레이스도 not-found로 수렴한다', async () => {
    joinRoomMock.mockRejectedValue(new RoomNotFoundError('사라진 방'))
    const store = useWaitingRoomStore()

    await store.enter('AB2C')

    expect(store.phase).toBe('not-found')
  })

  it('그 외 입장 실패는 phase가 error가 된다', async () => {
    getRoomMock.mockRejectedValue(new Error('permission denied'))
    const store = useWaitingRoomStore()

    await store.enter('AB2C')

    expect(store.phase).toBe('error')
  })

  it('입장 후 방 문서가 사라지면 not-found로 수렴한다', async () => {
    const deliver = captureSnapshotCallbacks()
    const store = useWaitingRoomStore()
    await store.enter('AB2C')

    deliver.room(null)

    expect(store.phase).toBe('not-found')
  })

  it('confirmReady는 내 참가자 문서의 레디를 확정하고 스냅샷으로 상태가 갱신된다', async () => {
    const deliver = captureSnapshotCallbacks()
    const store = useWaitingRoomStore()
    await store.enter('AB2C')
    deliver.participants([ME_WAITING])

    await store.confirmReady()

    expect(setReadyMock).toHaveBeenCalledExactlyOnceWith('AB2C', 'me')

    deliver.participants([ME_READY])
    expect(store.isReadyConfirmed).toBe(true)
    expect(store.readyCount).toBe(1)
  })

  it('호스트는 confirmReady를 호출해도 아무 요청도 하지 않는다', async () => {
    captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue(MY_ROOM)
    const store = useWaitingRoomStore()
    await store.enter('AB2C')

    await store.confirmReady()

    expect(setReadyMock).not.toHaveBeenCalled()
  })

  it('이미 레디 확정 상태면 confirmReady를 다시 호출해도 요청하지 않는다', async () => {
    const deliver = captureSnapshotCallbacks()
    const store = useWaitingRoomStore()
    await store.enter('AB2C')
    deliver.participants([ME_READY])

    await store.confirmReady()

    expect(setReadyMock).not.toHaveBeenCalled()
  })

  it('confirmReady 실패 시 readyError를 채우고 재시도하면 비운다', async () => {
    const deliver = captureSnapshotCallbacks()
    const store = useWaitingRoomStore()
    await store.enter('AB2C')
    deliver.participants([ME_WAITING])

    setReadyMock.mockRejectedValueOnce(new Error('network'))
    await store.confirmReady()
    expect(store.readyError).not.toBeNull()

    await store.confirmReady()
    expect(store.readyError).toBeNull()
    expect(setReadyMock).toHaveBeenCalledTimes(2)
  })

  it('leave는 모든 구독을 해제하고 상태를 초기화한다', async () => {
    captureSnapshotCallbacks()
    const store = useWaitingRoomStore()
    await store.enter('AB2C')

    store.leave()

    expect(unsubscribeParticipantsMock).toHaveBeenCalledTimes(1)
    expect(unsubscribeRoomMock).toHaveBeenCalledTimes(1)
    expect(store.roomCode).toBeNull()
    expect(store.room).toBeNull()
    expect(store.participants).toEqual([])
    expect(store.phase).toBe('idle')
  })

  describe('강퇴', () => {
    const MY_ROOM_PLAYING: RoomInfo = { ...MY_ROOM, status: 'playing' }

    it('게스트: 명단 스냅샷에 내가 없으면 kicked로 전환하고 구독을 해제한다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useWaitingRoomStore()
      await store.enter('AB2C')
      deliver.participants([ME_WAITING, OTHER_READY])
      expect(store.phase).toBe('joined')

      deliver.participants([OTHER_READY]) // 진행자가 내 참가자 문서를 삭제한 스냅샷

      expect(store.phase).toBe('kicked')
      expect(unsubscribeParticipantsMock).toHaveBeenCalledTimes(1)
      expect(unsubscribeRoomMock).toHaveBeenCalledTimes(1)
    })

    it('게스트: 명단에 내가 있는 동안은 kicked가 되지 않는다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useWaitingRoomStore()
      await store.enter('AB2C')

      deliver.participants([ME_WAITING]) // 다른 참가자가 전부 빠져도 나만 있으면 정상

      expect(store.phase).toBe('joined')
    })

    it('호스트: 명단에 자신이 없어도 kicked가 되지 않는다(진행자는 참가자가 아니다)', async () => {
      const deliver = captureSnapshotCallbacks()
      getRoomMock.mockResolvedValue(MY_ROOM)
      const store = useWaitingRoomStore()
      await store.enter('AB2C')

      deliver.participants([OTHER_READY])

      expect(store.phase).toBe('joined')
    })

    it('강퇴 후 다시 enter하면 kicked가 풀리고 재입장한다(초대 코드 = 입장 자격)', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useWaitingRoomStore()
      await store.enter('AB2C')
      deliver.participants([])
      expect(store.phase).toBe('kicked')

      await store.enter('AB2C')

      expect(store.phase).toBe('joined')
      expect(joinRoomMock).toHaveBeenCalledTimes(2)

      // 재입장 직후 첫 스냅샷(내가 포함된 명단)이 kicked 오탐 없이 joined를 유지해야 한다
      deliver.participants([ME_WAITING])
      expect(store.phase).toBe('joined')
    })

    it('kick: 호스트가 대기 중에 호출하면 참가자 문서 삭제를 요청하고 true를 반환한다', async () => {
      captureSnapshotCallbacks()
      getRoomMock.mockResolvedValue(MY_ROOM)
      const store = useWaitingRoomStore()
      await store.enter('AB2C')

      await expect(store.kick('u2')).resolves.toBe(true)

      expect(kickParticipantMock).toHaveBeenCalledExactlyOnceWith('AB2C', 'u2')
      expect(store.kickingId).toBeNull()
    })

    it('kick: 게스트가 호출하면 아무 요청도 하지 않는다', async () => {
      captureSnapshotCallbacks()
      const store = useWaitingRoomStore()
      await store.enter('AB2C')

      await expect(store.kick('u2')).resolves.toBe(false)

      expect(kickParticipantMock).not.toHaveBeenCalled()
    })

    it('kick: 게임 중(playing)에는 요청하지 않는다 — rules와 같은 기준', async () => {
      captureSnapshotCallbacks()
      getRoomMock.mockResolvedValue(MY_ROOM_PLAYING)
      const store = useWaitingRoomStore()
      await store.enter('AB2C')

      await expect(store.kick('u2')).resolves.toBe(false)

      expect(kickParticipantMock).not.toHaveBeenCalled()
    })

    it('kick: 실패하면 false를 반환하고 다시 시도할 수 있다', async () => {
      captureSnapshotCallbacks()
      getRoomMock.mockResolvedValue(MY_ROOM)
      kickParticipantMock.mockRejectedValueOnce(new Error('permission denied'))
      const store = useWaitingRoomStore()
      await store.enter('AB2C')

      await expect(store.kick('u2')).resolves.toBe(false)
      expect(store.kickingId).toBeNull()

      kickParticipantMock.mockResolvedValue(undefined)
      await expect(store.kick('u2')).resolves.toBe(true)
    })
  })

  describe('이번 라운드 배정 판정(유령 완장 방지)', () => {
    /** 라운드 2가 확정된 방 — 배정 카드·명단 완장은 assignedRound가 2인 참가자만 대상이다 */
    const ROUND2_ROOM: RoomInfo = {
      hostUid: 'host9',
      status: 'waiting',
      assignmentRound: 2,
      gameMode: 'normal',
      roundModes: {},
      round: null,
    }

    function assigned(id: string, name: string, team: string, round: number): Participant {
      return {
        id,
        name,
        team,
        assignedRound: round,
        gender: 'male',
        isXTeam: false,
        sameGenderStreak: 0,
        previousPartnerIds: [],
        isReady: true,
      }
    }

    it('직전 라운드 완장이 남아 있어도 이번 라운드 미배정이면 배정 카드가 뜨지 않는다', async () => {
      // 'me'는 라운드 1에서 완장 A였고 라운드 2에는 미배정 대기자로 내려갔다 —
      // 확정 배치가 문서를 건드리지 않아 team만 'A'로 남는다(assignedRound는 1로 남는다).
      getRoomMock.mockResolvedValue(ROUND2_ROOM)
      const deliver = captureSnapshotCallbacks()
      const store = useWaitingRoomStore()
      await store.enter('AB2C')
      deliver.room(ROUND2_ROOM)
      deliver.participants([
        assigned('me', '오리', 'A', 1),
        assigned('u2', '하린', 'A', 2),
        assigned('u3', '도윤', 'A', 2),
      ])

      expect(store.myAssignment).toBeNull()
      // 명단에서도 유령 완장이 감춰진다(중립 표기)
      expect(store.roster.find((p) => p.id === 'me')!.team).toBeNull()
    })

    it('이번 라운드에 배정된 사람만 팀원 목록에 넣는다', async () => {
      getRoomMock.mockResolvedValue(ROUND2_ROOM)
      const deliver = captureSnapshotCallbacks()
      const store = useWaitingRoomStore()
      await store.enter('AB2C')
      deliver.room(ROUND2_ROOM)
      deliver.participants([
        assigned('me', '오리', 'A', 2),
        assigned('u2', '하린', 'A', 2),
        assigned('u3', '도윤', 'A', 1), // 직전 라운드 잔재 — 섞이면 3인 팀이 된다
      ])

      expect(store.myAssignment).toEqual({
        armband: 'A',
        isXTeam: false,
        members: [
          { id: 'me', name: '오리' },
          { id: 'u2', name: '하린' },
        ],
      })
    })
  })

  describe('입장 중 이탈(구독 leak 방지)', () => {
    it('enter가 진행되는 동안 leave가 끼면 구독을 만들지 않고 상태도 되살리지 않는다', async () => {
      let resolveGetRoom: (room: RoomInfo) => void = () => {}
      getRoomMock.mockReturnValueOnce(
        new Promise<RoomInfo>((resolve) => {
          resolveGetRoom = resolve
        }),
      )
      captureSnapshotCallbacks()
      const store = useWaitingRoomStore()

      const pending = store.enter('AB2C') // 입장 처리 시작(응답 대기)
      store.leave() // 곧바로 화면 이탈(뒤로가기 등)
      resolveGetRoom(GUEST_ROOM)
      await pending

      // 해제할 주체가 없는 구독이 뒤늦게 생기지 않는다
      expect(subscribeRoomMock).not.toHaveBeenCalled()
      expect(subscribeParticipantsMock).not.toHaveBeenCalled()
      expect(store.phase).toBe('idle')
      expect(store.roomCode).toBeNull()
    })

    it('다른 방으로 재입장하면 이전 입장 시도가 새 구독을 덮어쓰지 않는다', async () => {
      let resolveFirst: (room: RoomInfo) => void = () => {}
      getRoomMock
        .mockReturnValueOnce(
          new Promise<RoomInfo>((resolve) => {
            resolveFirst = resolve
          }),
        )
        .mockResolvedValue(GUEST_ROOM)
      captureSnapshotCallbacks()
      const store = useWaitingRoomStore()

      const first = store.enter('AAAA')
      await store.enter('BB2C') // 두 번째 방 입장이 먼저 완료된다
      resolveFirst(GUEST_ROOM) // 뒤늦게 응답한 첫 입장
      await first

      // 구독은 두 번째 방에만 걸려 있다
      expect(subscribeRoomMock).toHaveBeenCalledTimes(1)
      expect(subscribeRoomMock.mock.calls[0]![0]).toBe('BB2C')
      expect(store.roomCode).toBe('BB2C')
    })
  })

  describe('startPlaying', () => {
    const HOST_ROUND1: RoomInfo = {
      hostUid: 'me',
      status: 'waiting',
      assignmentRound: 1,
      gameMode: 'normal',
      roundModes: {},
      round: null,
    }

    it('호스트가 배정 확정 후 호출하면 status를 playing으로 전이한다', async () => {
      authState.user = { uid: 'me', displayName: '오리' }
      getRoomMock.mockResolvedValue(HOST_ROUND1)
      const deliver = captureSnapshotCallbacks()
      const store = useWaitingRoomStore()
      await store.enter('AB2C')
      deliver.participants([OTHER_READY])

      await store.startPlaying()

      expect(startGameMock).toHaveBeenCalledExactlyOnceWith('AB2C')
      expect(store.startGameError).toBeNull()
    })

    it('배정 이력이 있어도 참가자 전원이 준비하지 않았으면 시작하지 않는다', async () => {
      authState.user = { uid: 'me', displayName: '오리' }
      getRoomMock.mockResolvedValue(HOST_ROUND1)
      const deliver = captureSnapshotCallbacks()
      const store = useWaitingRoomStore()
      await store.enter('AB2C')
      deliver.participants([{ ...OTHER_READY, isReady: false }])

      await store.startPlaying()

      expect(store.canStartGame).toBe(false)
      expect(startGameMock).not.toHaveBeenCalled()
      expect(store.startGameError).toBe('모든 참가자가 준비를 완료해야 시작할 수 있어요.')
    })

    it('배정 확정 전(0차)에는 시작하지 않고 안내를 세팅한다', async () => {
      authState.user = { uid: 'me', displayName: '오리' }
      getRoomMock.mockResolvedValue(MY_ROOM) // assignmentRound 0
      captureSnapshotCallbacks()
      const store = useWaitingRoomStore()
      await store.enter('AB2C')

      await store.startPlaying()

      expect(startGameMock).not.toHaveBeenCalled()
      expect(store.startGameError).toBe('팀 배정을 먼저 확정해 주세요.')
    })

    it('게스트는 호출해도 아무 일도 일어나지 않는다', async () => {
      getRoomMock.mockResolvedValue({ ...GUEST_ROOM, assignmentRound: 1 })
      captureSnapshotCallbacks()
      const store = useWaitingRoomStore()
      await store.enter('AB2C')

      await store.startPlaying()

      expect(startGameMock).not.toHaveBeenCalled()
    })

    it('실패하면 안내를 세팅하고 재시도할 수 있다', async () => {
      authState.user = { uid: 'me', displayName: '오리' }
      getRoomMock.mockResolvedValue(HOST_ROUND1)
      const deliver = captureSnapshotCallbacks()
      const store = useWaitingRoomStore()
      await store.enter('AB2C')
      deliver.participants([OTHER_READY])

      startGameMock.mockRejectedValueOnce(new Error('permission denied'))
      await store.startPlaying()
      expect(store.startGameError).toBe('게임을 시작하지 못했어요. 다시 시도해 주세요.')

      await store.startPlaying()
      expect(store.startGameError).toBeNull()
      expect(startGameMock).toHaveBeenCalledTimes(2)
    })
  })
})
