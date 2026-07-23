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
const unsubscribeParticipantsMock = vi.fn<() => void>()
const unsubscribeRoomMock = vi.fn<() => void>()
const subscribeParticipantsMock =
  vi.fn<(code: string, onChange: (participants: Participant[]) => void) => () => void>()
const subscribeRoomMock =
  vi.fn<(code: string, onChange: (room: RoomInfo | null) => void) => () => void>()

vi.mock('../api/rooms', () => ({
  RoomNotFoundError: class RoomNotFoundError extends Error {},
  getRoom: (code: string) => getRoomMock(code),
  joinRoom: (
    code: string,
    member: { uid: string; nickname: string; gender: 'male' | 'female' | null },
  ) => joinRoomMock(code, member),
  setReady: (code: string, uid: string) => setReadyMock(code, uid),
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
}
const MY_ROOM: RoomInfo = {
  hostUid: 'me',
  status: 'waiting',
  assignmentRound: 0,
  gameMode: 'normal',
}

const ME_WAITING: Participant = {
  id: 'me',
  name: '오리',
  team: null,
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
})
