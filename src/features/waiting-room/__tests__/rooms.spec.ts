import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/api/firebase', () => ({ db: {} }))

/** 실제 DocumentReference 대신 쓰는 식별자 — doc() mock이 만들어 호출 검증에 쓴다 */
interface FakeRef {
  path: string
}

interface FakeQueryDoc {
  id: string
  data: () => Record<string, unknown>
}

const getDocMock =
  vi.fn<(ref: FakeRef) => Promise<{ exists: () => boolean; data?: () => Record<string, unknown> }>>()
const getDocsMock = vi.fn<(query: unknown) => Promise<{ docs: FakeQueryDoc[] }>>()
const transactionGetMock = vi.fn<(ref: FakeRef) => Promise<{ exists: () => boolean }>>()
const transactionSetMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => void>()
const updateDocMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => Promise<void>>()
const onSnapshotMock =
  vi.fn<(query: unknown, onNext: (snapshot: unknown) => void) => () => void>()

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  collection: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  getDoc: (ref: FakeRef) => getDocMock(ref),
  getDocs: (query: unknown) => getDocsMock(query),
  query: (source: FakeRef, ...constraints: unknown[]) => ({ source, constraints }),
  orderBy: (field: string, direction: string) => ({ orderBy: field, direction }),
  where: (field: string, op: string, value: unknown) => ({ where: field, op, value }),
  onSnapshot: (query: unknown, onNext: (snapshot: unknown) => void) =>
    onSnapshotMock(query, onNext),
  // 실제 runTransaction의 재시도는 커밋 경합에서만 일어나므로, 콜백 1회 실행으로 충분하다
  runTransaction: <T>(
    _db: unknown,
    fn: (transaction: { get: typeof transactionGetMock; set: typeof transactionSetMock }) => Promise<T>,
  ) => fn({ get: transactionGetMock, set: transactionSetMock }),
  serverTimestamp: () => 'server-timestamp',
  updateDoc: (ref: FakeRef, data: Record<string, unknown>) => updateDocMock(ref, data),
}))

import {
  ROOM_CODE_LENGTH,
  RoomNotFoundError,
  createRoom,
  fetchMyRooms,
  getRoom,
  joinRoom,
  normalizeRoomCode,
  roomExists,
  setReady,
  startGame,
  subscribeToParticipants,
  subscribeToRoom,
} from '../api/rooms'

beforeEach(() => {
  getDocMock.mockReset()
  getDocsMock.mockReset()
  transactionGetMock.mockReset()
  transactionSetMock.mockReset()
  updateDocMock.mockReset()
  onSnapshotMock.mockReset()
})

/** Firestore Timestamp 흉내 — toDate()만 쓰인다 */
function fakeTimestamp(iso: string) {
  return { toDate: () => new Date(iso) }
}

describe('normalizeRoomCode', () => {
  it('공백을 제거하고 대문자로 만들어 소문자 입력도 같은 방을 가리키게 한다', () => {
    expect(normalizeRoomCode('  ab2c ')).toBe('AB2C')
  })
})

describe('createRoom', () => {
  it('빈 코드를 찾으면 방 문서를 만들고 코드를 반환한다', async () => {
    transactionGetMock.mockResolvedValue({ exists: () => false })

    const code = await createRoom('host-1')

    expect(code).toHaveLength(ROOM_CODE_LENGTH)
    expect(code).toMatch(/^[A-Z2-9]+$/)
    expect(transactionSetMock).toHaveBeenCalledExactlyOnceWith(
      { path: `rooms/${code}` },
      { hostUid: 'host-1', status: 'waiting', createdAt: 'server-timestamp' },
    )
  })

  it('코드가 충돌하면 새 코드로 재시도한다', async () => {
    transactionGetMock
      .mockResolvedValueOnce({ exists: () => true })
      .mockResolvedValue({ exists: () => false })

    const code = await createRoom('host-1')

    expect(code).toHaveLength(ROOM_CODE_LENGTH)
    expect(transactionGetMock).toHaveBeenCalledTimes(2)
    expect(transactionSetMock).toHaveBeenCalledTimes(1)
  })

  it('재시도 상한까지 전부 충돌하면 에러를 던진다', async () => {
    transactionGetMock.mockResolvedValue({ exists: () => true })

    await expect(createRoom('host-1')).rejects.toThrow('room code collision')
    expect(transactionSetMock).not.toHaveBeenCalled()
  })
})

describe('roomExists', () => {
  it('rooms/{code} 문서 존재 여부를 반환한다', async () => {
    getDocMock.mockResolvedValue({ exists: () => false })

    await expect(roomExists('AB2C')).resolves.toBe(false)
    expect(getDocMock).toHaveBeenCalledWith({ path: 'rooms/AB2C' })
  })
})

describe('getRoom', () => {
  it('방 문서를 RoomInfo로 매핑하고(게임 모드 포함), 없으면 null을 반환한다', async () => {
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        hostUid: 'host-1',
        status: 'waiting',
        assignmentRound: 2,
        gameMode: 'king-hunt',
      }),
    })

    await expect(getRoom('AB2C')).resolves.toEqual({
      hostUid: 'host-1',
      status: 'waiting',
      assignmentRound: 2,
      gameMode: 'king-hunt',
    })
    expect(getDocMock).toHaveBeenCalledWith({ path: 'rooms/AB2C' })

    getDocMock.mockResolvedValueOnce({ exists: () => false })
    await expect(getRoom('ZZZZ')).resolves.toBeNull()
  })

  it('gameMode 필드가 없거나 알 수 없는 값이면 일반전(normal)으로 채운다', async () => {
    // 필드 자체가 없는 기존 방
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ hostUid: 'host-1', status: 'waiting', assignmentRound: 0 }),
    })
    await expect(getRoom('AB2C')).resolves.toMatchObject({ gameMode: 'normal' })

    // 저장된 값이 유효 모드가 아닌 경우
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ hostUid: 'host-1', status: 'waiting', assignmentRound: 1, gameMode: 'bogus' }),
    })
    await expect(getRoom('AB2C')).resolves.toMatchObject({ gameMode: 'normal' })
  })
})

describe('fetchMyRooms', () => {
  it('내 uid로 hostUid 조건 쿼리를 보내고 최신순으로 정렬해 반환한다', async () => {
    getDocsMock.mockResolvedValue({
      docs: [
        {
          id: 'OLD1',
          data: () => ({
            hostUid: 'me',
            status: 'waiting',
            createdAt: fakeTimestamp('2026-07-14T10:00:00Z'),
          }),
        },
        {
          id: 'NEW2',
          data: () => ({
            hostUid: 'me',
            status: 'waiting',
            createdAt: fakeTimestamp('2026-07-15T10:00:00Z'),
          }),
        },
      ],
    })

    const rooms = await fetchMyRooms('me')

    expect(getDocsMock).toHaveBeenCalledWith({
      source: { path: 'rooms' },
      constraints: [{ where: 'hostUid', op: '==', value: 'me' }],
    })
    expect(rooms.map((room) => room.code)).toEqual(['NEW2', 'OLD1'])
    expect(rooms[0]).toEqual({
      code: 'NEW2',
      createdAt: new Date('2026-07-15T10:00:00Z'),
      status: 'waiting',
    })
  })

  it('serverTimestamp 반영 전(createdAt null)인 방을 맨 앞(최신)으로 정렬한다', async () => {
    getDocsMock.mockResolvedValue({
      docs: [
        {
          id: 'OLD1',
          data: () => ({
            hostUid: 'me',
            status: 'waiting',
            createdAt: fakeTimestamp('2026-07-14T10:00:00Z'),
          }),
        },
        { id: 'JUST', data: () => ({ hostUid: 'me', status: 'waiting', createdAt: null }) },
      ],
    })

    const rooms = await fetchMyRooms('me')

    expect(rooms.map((room) => room.code)).toEqual(['JUST', 'OLD1'])
    expect(rooms[0]!.createdAt).toBeNull()
  })
})

describe('joinRoom', () => {
  it('방이 없으면 RoomNotFoundError를 던진다', async () => {
    transactionGetMock.mockResolvedValue({ exists: () => false })

    await expect(
      joinRoom('AB2C', { uid: 'u1', nickname: '오리', gender: 'female' }),
    ).rejects.toBeInstanceOf(RoomNotFoundError)
    expect(transactionSetMock).not.toHaveBeenCalled()
  })

  it('처음 입장이면 성별을 포함한 대기 상태의 참가자 문서를 만든다', async () => {
    transactionGetMock
      .mockResolvedValueOnce({ exists: () => true }) // 방 문서
      .mockResolvedValueOnce({ exists: () => false }) // 내 참가자 문서

    await joinRoom('AB2C', { uid: 'u1', nickname: '오리', gender: 'female' })

    expect(transactionSetMock).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C/participants/u1' },
      { nickname: '오리', gender: 'female', isReady: false, joinedAt: 'server-timestamp' },
    )
  })

  it('성별을 모르면(null) gender 필드를 생략하고 만든다', async () => {
    transactionGetMock
      .mockResolvedValueOnce({ exists: () => true })
      .mockResolvedValueOnce({ exists: () => false })

    await joinRoom('AB2C', { uid: 'u1', nickname: '오리', gender: null })

    expect(transactionSetMock).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C/participants/u1' },
      { nickname: '오리', isReady: false, joinedAt: 'server-timestamp' },
    )
  })

  it('이미 참가한 상태면 기존 문서(레디 상태)를 보존한다 — 멱등', async () => {
    transactionGetMock.mockResolvedValue({ exists: () => true })

    await joinRoom('AB2C', { uid: 'u1', nickname: '오리', gender: 'female' })

    expect(transactionSetMock).not.toHaveBeenCalled()
  })
})

describe('subscribeToParticipants', () => {
  it('스냅샷 문서를 Participant로 매핑하고 없는 필드는 기본값(미배정·0·빈 배열)으로 채운다', () => {
    const unsubscribe = vi.fn<() => void>()
    onSnapshotMock.mockReturnValue(unsubscribe)
    const onChange = vi.fn<(participants: unknown) => void>()

    const result = subscribeToParticipants('AB2C', onChange)

    const [participantsQuery, onNext] = onSnapshotMock.mock.calls[0]!
    expect(participantsQuery).toEqual({
      source: { path: 'rooms/AB2C/participants' },
      constraints: [{ orderBy: 'joinedAt', direction: 'asc' }],
    })

    onNext({
      docs: [
        { id: 'u1', data: () => ({ nickname: '오리', isReady: true }) },
        {
          id: 'u2',
          data: () => ({
            nickname: '하린',
            isReady: false,
            team: 'A',
            gender: 'female',
            isXTeam: true,
            sameGenderStreak: 2,
            previousPartnerIds: ['x'],
          }),
        },
      ],
    })

    expect(onChange).toHaveBeenCalledWith([
      {
        id: 'u1',
        name: '오리',
        team: null,
        gender: null,
        isXTeam: false,
        sameGenderStreak: 0,
        previousPartnerIds: [],
        isReady: true,
      },
      {
        id: 'u2',
        name: '하린',
        team: 'A',
        gender: 'female',
        isXTeam: true,
        sameGenderStreak: 2,
        previousPartnerIds: ['x'],
        isReady: false,
      },
    ])
    expect(result).toBe(unsubscribe)
  })
})

describe('subscribeToRoom', () => {
  it('방 문서 스냅샷을 RoomInfo로 매핑하고, 문서가 없으면 null을 전달한다', () => {
    const unsubscribe = vi.fn<() => void>()
    onSnapshotMock.mockReturnValue(unsubscribe)
    const onChange = vi.fn<(room: unknown) => void>()

    const result = subscribeToRoom('AB2C', onChange)

    const [roomRef, onNext] = onSnapshotMock.mock.calls[0]!
    expect(roomRef).toEqual({ path: 'rooms/AB2C' })

    onNext({
      exists: () => true,
      data: () => ({
        hostUid: 'host-1',
        status: 'waiting',
        assignmentRound: 1,
        gameMode: 'staff-chase',
      }),
    })
    expect(onChange).toHaveBeenCalledWith({
      hostUid: 'host-1',
      status: 'waiting',
      assignmentRound: 1,
      gameMode: 'staff-chase',
    })

    onNext({ exists: () => false })
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(result).toBe(unsubscribe)
  })
})

describe('startGame', () => {
  it('방 status만 playing으로 갱신한다', async () => {
    updateDocMock.mockResolvedValue(undefined)

    await startGame('AB2C')

    expect(updateDocMock).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C' },
      { status: 'playing' },
    )
  })
})

describe('setReady', () => {
  it('내 참가자 문서의 isReady만 갱신한다', async () => {
    updateDocMock.mockResolvedValue(undefined)

    await setReady('AB2C', 'u1')

    expect(updateDocMock).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C/participants/u1' },
      { isReady: true },
    )
  })
})
