import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetServerClock, serverClockOffsetMs } from '../serverClock'

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
  vi.fn<
    (ref: FakeRef) => Promise<{ exists: () => boolean; data?: () => Record<string, unknown> }>
  >()
const getDocsMock = vi.fn<(query: unknown) => Promise<{ docs: FakeQueryDoc[] }>>()
const transactionGetMock = vi.fn<(ref: FakeRef) => Promise<{ exists: () => boolean }>>()
const transactionSetMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => void>()
const updateDocMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => Promise<void>>()
const onSnapshotMock =
  vi.fn<
    (
      query: unknown,
      onNext: (snapshot: unknown) => void,
      onError?: (error: Error) => void,
    ) => () => void
  >()

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  collection: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  getDoc: (ref: FakeRef) => getDocMock(ref),
  getDocs: (query: unknown) => getDocsMock(query),
  query: (source: FakeRef, ...constraints: unknown[]) => ({ source, constraints }),
  orderBy: (field: string, direction: string) => ({ orderBy: field, direction }),
  where: (field: string, op: string, value: unknown) => ({ where: field, op, value }),
  onSnapshot: (
    query: unknown,
    onNext: (snapshot: unknown) => void,
    onError?: (error: Error) => void,
  ) => onSnapshotMock(query, onNext, onError),
  // 실제 runTransaction의 재시도는 커밋 경합에서만 일어나므로, 콜백 1회 실행으로 충분하다
  runTransaction: <T>(
    _db: unknown,
    fn: (transaction: {
      get: typeof transactionGetMock
      set: typeof transactionSetMock
    }) => Promise<T>,
  ) => fn({ get: transactionGetMock, set: transactionSetMock }),
  serverTimestamp: () => 'server-timestamp',
  deleteField: () => 'delete-field',
  updateDoc: (ref: FakeRef, data: Record<string, unknown>) => updateDocMock(ref, data),
}))

import {
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
  RoomNotFoundError,
  createRoom,
  endGame,
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

/** Firestore Timestamp 흉내 — 방 목록은 toDate(), 라운드 앵커는 toMillis()를 쓴다 */
function fakeTimestamp(iso: string) {
  return { toDate: () => new Date(iso), toMillis: () => new Date(iso).getTime() }
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
    // 생성 코드가 rules와 공유하는 패턴을 실제로 통과하는지 검증(느슨한 근사 정규식 금지)
    expect(code).toMatch(new RegExp(ROOM_CODE_PATTERN))
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
      roundModes: {},
      round: null,
    })
    expect(getDocMock).toHaveBeenCalledWith({ path: 'rooms/AB2C' })

    getDocMock.mockResolvedValueOnce({ exists: () => false })
    await expect(getRoom('ZZZZ')).resolves.toBeNull()
  })

  it('round 맵을 RoundState로 매핑한다 — 앵커는 ms로, 정지 중이면 남은 시간까지', async () => {
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        hostUid: 'host-1',
        status: 'playing',
        assignmentRound: 1,
        gameMode: 'normal',
        round: {
          status: 'running',
          startedAt: fakeTimestamp('2026-07-25T10:00:00Z'),
          durationMs: 1_200_000,
        },
      }),
    })

    await expect(getRoom('AB2C')).resolves.toMatchObject({
      round: {
        status: 'running',
        startedAtMs: new Date('2026-07-25T10:00:00Z').getTime(),
        durationMs: 1_200_000,
        // running에는 이 필드가 없어야 한다(rules도 부재를 강제한다)
        pausedRemainingMs: null,
      },
    })

    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        hostUid: 'host-1',
        status: 'playing',
        assignmentRound: 1,
        gameMode: 'normal',
        round: {
          status: 'paused',
          startedAt: fakeTimestamp('2026-07-25T10:00:00Z'),
          durationMs: 300_000,
          pausedRemainingMs: 300_000,
        },
      }),
    })

    await expect(getRoom('AB2C')).resolves.toMatchObject({
      round: { status: 'paused', pausedRemainingMs: 300_000 },
    })
  })

  it('round가 없거나 status가 알 수 없는 값이면 라운드 시작 전(null)으로 수렴시킨다', async () => {
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ hostUid: 'host-1', status: 'playing', assignmentRound: 1 }),
    })
    await expect(getRoom('AB2C')).resolves.toMatchObject({ round: null })

    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        hostUid: 'host-1',
        status: 'playing',
        assignmentRound: 1,
        round: { status: 'bogus', durationMs: 1 },
      }),
    })
    await expect(getRoom('AB2C')).resolves.toMatchObject({ round: null })
  })

  it('serverTimestamp가 반영되기 전(startedAt 없음) 스냅샷은 앵커를 null로 둔다', async () => {
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        hostUid: 'host-1',
        status: 'playing',
        assignmentRound: 1,
        round: { status: 'running', startedAt: null, durationMs: 1_200_000 },
      }),
    })

    await expect(getRoom('AB2C')).resolves.toMatchObject({
      round: { status: 'running', startedAtMs: null, durationMs: 1_200_000 },
    })
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

  /**
   * roundModes는 gameMode가 덮어써 버리는 과거 라운드 모드의 유일한 근거다. 그래서 gameMode처럼
   * 기본값으로 수렴시키지 않고, 오염된 엔트리만 버려 나머지 차수 이력을 살린다.
   */
  it('roundModes를 차수 문자열 → 모드 맵으로 정규화하고, 오염된 엔트리만 제외한다', async () => {
    /** 이력 필드만 갈아 끼운 방 문서를 한 번 돌려준다 */
    function mockRoomWithRoundModes(roundModes: unknown): void {
      getDocMock.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          hostUid: 'host-1',
          status: 'waiting',
          assignmentRound: 2,
          gameMode: 'king-hunt',
          ...(roundModes === undefined ? {} : { roundModes }),
        }),
      })
    }

    // 이력을 남기기 전에 확정된 기존 방 — 필드 자체가 없다
    mockRoomWithRoundModes(undefined)
    expect((await getRoom('AB2C'))!.roundModes).toEqual({})

    // 유효한 이력은 키(차수 문자열)와 값 그대로
    mockRoomWithRoundModes({ 1: 'normal', 2: 'king-hunt' })
    expect((await getRoom('AB2C'))!.roundModes).toEqual({ 1: 'normal', 2: 'king-hunt' })

    // 모르는 모드 id·비문자열은 그 차수만 빠지고 나머지 라운드는 계속 읽힌다
    mockRoomWithRoundModes({ 1: 'normal', 2: 'mafia', 3: 7, 4: null })
    expect((await getRoom('AB2C'))!.roundModes).toEqual({ 1: 'normal' })

    // 맵이 아닌 값이 들어온 경우는 이력 전체를 빈 객체로 수렴시킨다
    mockRoomWithRoundModes('king-hunt')
    expect((await getRoom('AB2C'))!.roundModes).toEqual({})
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
            assignedRound: 2,
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
        assignedRound: 0,
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
        assignedRound: 2,
        gender: 'female',
        isXTeam: true,
        sameGenderStreak: 2,
        previousPartnerIds: ['x'],
        isReady: false,
      },
    ])
    expect(result).toBe(unsubscribe)
  })

  it('영구 Listen 오류 콜백을 Firestore에 전달한다', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onError = vi.fn<(error: Error) => void>()

    subscribeToParticipants('AB2C', vi.fn(), onError)

    expect(onSnapshotMock.mock.calls[0]![2]).toBe(onError)
  })
})

describe('subscribeToRoom', () => {
  it('라운드 앵커를 서버 시계 보정에 넘긴다 — 방을 구독하는 모든 화면이 이 경로를 지난다', () => {
    resetServerClock()
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    subscribeToRoom('AB2C', vi.fn())
    const onNext = onSnapshotMock.mock.calls[0]![1]

    const deviceNow = Date.now()
    const room = (startedAt: { toMillis: () => number }) => ({
      exists: () => true,
      metadata: { fromCache: false, hasPendingWrites: false },
      data: () => ({
        hostUid: 'host-1',
        status: 'playing',
        assignmentRound: 1,
        gameMode: 'normal',
        round: { status: 'running', startedAt, durationMs: 1_200_000 },
      }),
    })

    // 합류 시점의 첫 앵커는 과거라 샘플이 아니다
    onNext(room({ toMillis: () => deviceNow - 21 * 60_000 }))
    expect(serverClockOffsetMs()).toBeNull()

    // 진행자가 라운드를 다시 걸면 그 값이 곧 서버의 '지금'이다 — 기기가 앞선 만큼 음수로 잡힌다
    onNext(room({ toMillis: () => Date.now() - 15 * 60_000 }))
    expect(serverClockOffsetMs()).toBeLessThan(-14 * 60_000)
    resetServerClock()
  })


  it('방 문서 스냅샷을 RoomInfo로 매핑하고, 문서가 없으면 null을 전달한다', () => {
    const unsubscribe = vi.fn<() => void>()
    onSnapshotMock.mockReturnValue(unsubscribe)
    const onChange = vi.fn<(room: unknown) => void>()

    const result = subscribeToRoom('AB2C', onChange)

    const [roomRef, onNext] = onSnapshotMock.mock.calls[0]!
    expect(roomRef).toEqual({ path: 'rooms/AB2C' })

    onNext({
      exists: () => true,
      metadata: { fromCache: false, hasPendingWrites: false },
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
      roundModes: {},
      round: null,
    })

    onNext({ exists: () => false, metadata: { fromCache: false, hasPendingWrites: false } })
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(result).toBe(unsubscribe)
  })

  it('영구 Listen 오류 콜백을 Firestore에 전달한다', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onError = vi.fn<(error: Error) => void>()

    subscribeToRoom('AB2C', vi.fn(), onError)

    expect(onSnapshotMock.mock.calls[0]![2]).toBe(onError)
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

describe('endGame', () => {
  it('status를 waiting으로 되돌리며 round를 같은 쓰기에서 지운다', async () => {
    updateDocMock.mockResolvedValue(undefined)

    await endGame('AB2C')

    // 두 필드를 나눠 쓰면 "대기 중인데 라운드가 살아 있는" 중간 상태가 참가자에게 보인다
    expect(updateDocMock).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C' },
      { status: 'waiting', round: 'delete-field' },
    )
  })

  it('배정 이력(assignmentRound·완장)은 건드리지 않는다', async () => {
    updateDocMock.mockResolvedValue(undefined)

    await endGame('AB2C')

    const [, payload] = updateDocMock.mock.calls[0]!
    expect(Object.keys(payload).sort()).toEqual(['round', 'status'])
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

/**
 * firestore.rules의 roomCode 정규식은 클라 ROOM_CODE_PATTERN의 이중 정의다(rules는 클라
 * 코드를 import 불가). 한쪽만 바꾸면 방 생성이 전면 거부되므로, rules 파일을 직접 읽어
 * 패턴 문자열이 동일한지 여기서 잡는다. 파생값(길이)의 정합도 함께 고정한다.
 */
describe('firestore.rules 방 코드 규칙 동기화 가드', () => {
  it('rules의 roomCode 정규식이 ROOM_CODE_PATTERN과 문자열까지 동일하다', () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')

    const match = rules.match(/roomCode\.matches\('([^']+)'\)/)
    expect(match).not.toBeNull()
    expect(match![1]).toBe(ROOM_CODE_PATTERN)
  })

  it('패턴에서 파생한 ROOM_CODE_LENGTH가 4다(파생 파싱 회귀 가드)', () => {
    expect(ROOM_CODE_LENGTH).toBe(4)
  })
})
