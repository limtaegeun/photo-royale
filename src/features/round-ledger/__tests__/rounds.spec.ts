import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/api/firebase', () => ({ db: {} }))

/** 실제 DocumentReference 대신 쓰는 식별자 — doc() mock이 만들어 호출 검증에 쓴다 */
interface FakeRef {
  path: string
}

interface FakeDocSnapshot {
  id: string
  exists: () => boolean
  data: () => Record<string, unknown>
}

const onSnapshotMock =
  vi.fn<
    (
      target: FakeRef,
      onNext: (snapshot: unknown) => void,
      onError?: (error: Error) => void,
    ) => () => void
  >()
const transactionGetMock =
  vi.fn<(ref: FakeRef) => Promise<{ exists: () => boolean; data: () => Record<string, unknown> }>>()
const transactionUpdateMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => void>()
const SERVER_TIMESTAMP = { __serverTimestamp: true }

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  collection: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  // 팩토리는 호이스팅되므로 mock 변수는 호출 시점에 늦게 참조한다
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
  serverTimestamp: () => SERVER_TIMESTAMP,
  increment: (n: number) => ({ increment: n }),
  arrayUnion: (...items: string[]) => ({ arrayUnion: items }),
  // 실제 runTransaction의 재시도는 커밋 경합에서만 일어나므로, 콜백 1회 실행으로 충분하다
  runTransaction: <T>(
    _db: unknown,
    fn: (transaction: {
      get: typeof transactionGetMock
      update: typeof transactionUpdateMock
    }) => Promise<T>,
  ) => fn({ get: transactionGetMock, update: transactionUpdateMock }),
}))

import {
  addRoundSnapshotToBatch,
  addTallyToBatch,
  recordStaffOut,
  roundLedgerDoc,
  subscribeToRoundLedger,
  subscribeToRoundLedgers,
  toRoundLedger,
} from '../api/rounds'

/** Timestamp 흉내 — 매핑이 toMillis만 쓰는지 본다 */
const stamp = (ms: number) => ({ toMillis: () => ms })

const SNAPSHOT_DATA = {
  mode: 'normal',
  teams: { A: ['u1', 'u2'], B: ['u3'] },
  xTeams: ['A'],
  confirmedAt: stamp(1_000),
}

beforeEach(() => {
  onSnapshotMock.mockReset().mockReturnValue(() => {})
  transactionGetMock.mockReset()
  transactionUpdateMock.mockReset()
})

describe('roundLedgerDoc', () => {
  it('문서 ID는 차수 문자열이다 — rules가 방 문서의 assignmentRound와 string()으로 대조한다', () => {
    expect(roundLedgerDoc('AB2C', 3)).toEqual({ path: 'rooms/AB2C/rounds/3' })
  })
})

describe('addRoundSnapshotToBatch', () => {
  it('완장 → 팀원 uid 맵과 X 완장 목록, 서버 시각을 rounds/{차수}에 set으로 얹는다', () => {
    const batch = { set: vi.fn<(ref: FakeRef, data: Record<string, unknown>) => void>() }

    addRoundSnapshotToBatch(batch as never, 'AB2C', 2, 'group', [
      { armband: 'A', isXTeam: true, memberIds: ['u1', 'u2'] },
      { armband: 'B', isXTeam: false, memberIds: ['u3'] },
      { armband: 'C', isXTeam: true, memberIds: ['u4'] },
    ])

    expect(batch.set).toHaveBeenCalledTimes(1)
    expect(batch.set).toHaveBeenCalledWith(
      { path: 'rooms/AB2C/rounds/2' },
      {
        mode: 'group',
        teams: { A: ['u1', 'u2'], B: ['u3'], C: ['u4'] },
        xTeams: ['A', 'C'],
        confirmedAt: SERVER_TIMESTAMP,
      },
    )
  })

  it('X 팀이 없으면 xTeams는 빈 배열이다(rules는 list 타입만 본다)', () => {
    const batch = { set: vi.fn<(ref: FakeRef, data: Record<string, unknown>) => void>() }

    addRoundSnapshotToBatch(batch as never, 'AB2C', 1, 'normal', [
      { armband: 'A', isXTeam: false, memberIds: ['u1'] },
    ])

    expect(batch.set.mock.calls[0]![1]).toMatchObject({ xTeams: [] })
  })
})

describe('addTallyToBatch (판정 집계)', () => {
  function tallyBatch() {
    return { update: vi.fn<(ref: FakeRef, data: Record<string, unknown>) => void>() }
  }

  it('공격 완장 kills와 피격 완장 hits를 1씩 올린다 — absorb가 없으면 tails·credits는 건드리지 않는다', () => {
    const batch = tallyBatch()

    addTallyToBatch(batch as never, 'AB2C', 2, 'A', 'B')

    expect(batch.update).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C/rounds/2' },
      { 'tally.A.kills': { increment: 1 }, 'hits.B': { increment: 1 } },
    )
  })

  /**
   * 꼬리잡기 편입(P07 §4.2, M4-6) — 킬 시점의 사냥 팀 소속 전원에게 credits 1, 이 킬로 아웃된 팀의
   * 인원은 공격 완장의 tails에 합류. 같은 update에 실려 tally·hits와 원자적으로 남는다(rules ② 한 갈래).
   */
  it('absorb가 있으면 크레딧 대상 uid마다 credits를 1 올리고 합류 인원을 공격 완장 tails에 arrayUnion한다', () => {
    const batch = tallyBatch()

    addTallyToBatch(batch as never, 'AB2C', 2, 'A', 'B', 1, false, {
      creditUids: ['u1', 'u2', 'u5'],
      absorbedUids: ['u3', 'u4'],
    })

    expect(batch.update).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C/rounds/2' },
      {
        'tally.A.kills': { increment: 1 },
        'hits.B': { increment: 1 },
        'credits.u1': { increment: 1 },
        'credits.u2': { increment: 1 },
        'credits.u5': { increment: 1 },
        'tails.A': { arrayUnion: ['u3', 'u4'] },
      },
    )
  })

  it('이 킬로 피격 팀이 아웃되지 않으면(합류 없음) credits만 올리고 tails는 쓰지 않는다 — 3배·왕 사냥과도 함께', () => {
    const batch = tallyBatch()

    addTallyToBatch(batch as never, 'AB2C', 2, 'A', 'B', 3, true, { creditUids: ['u1'], absorbedUids: [] })

    expect(batch.update.mock.calls[0]![1]).toEqual({
      'tally.A.tripleKills': { increment: 1 },
      'tally.A.kingKills': { increment: 1 },
      'hits.B': { increment: 1 },
      'credits.u1': { increment: 1 },
    })
  })
})

describe('recordStaffOut (스태프 추격전 수동 아웃, P07 §4.5)', () => {
  it('tally가 없는 원장이면 hits 증가와 함께 빈 tally 맵을 만든다', async () => {
    transactionGetMock.mockResolvedValue({ exists: () => true, data: () => ({ ...SNAPSHOT_DATA }) })

    await recordStaffOut('AB2C', 2, 'A')

    expect(transactionGetMock).toHaveBeenCalledWith({ path: 'rooms/AB2C/rounds/2' })
    expect(transactionUpdateMock).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C/rounds/2' },
      { 'hits.A': { increment: 1 }, tally: {} },
    )
  })

  it('tally가 이미 있으면 hits만 올린다', async () => {
    transactionGetMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ ...SNAPSHOT_DATA, tally: { A: { kills: 1, tripleKills: 0 } } }),
    })

    await recordStaffOut('AB2C', 2, 'A')

    expect(transactionUpdateMock).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C/rounds/2' },
      { 'hits.A': { increment: 1 } },
    )
  })

  it('원장이 없으면 실패한다 — 도입 전에 배정된 라운드', async () => {
    transactionGetMock.mockResolvedValue({ exists: () => false, data: () => ({}) })

    await expect(recordStaffOut('AB2C', 2, 'A')).rejects.toThrow('라운드 원장이 없습니다')
    expect(transactionUpdateMock).not.toHaveBeenCalled()
  })
})

describe('toRoundLedger', () => {
  it('스냅샷만 있는 문서는 tally·hits·tails·credits·result가 null이다', () => {
    expect(toRoundLedger('2', SNAPSHOT_DATA)).toEqual({
      roundNo: 2,
      mode: 'normal',
      teams: { A: ['u1', 'u2'], B: ['u3'] },
      xTeams: ['A'],
      confirmedAtMs: 1_000,
      tally: null,
      hits: null,
      tails: null,
      credits: null,
      result: null,
    })
  })

  it('집계·정산이 실린 문서를 그대로 읽고 서버 시각 반영 전 finishedAt은 null이다', () => {
    const ledger = toRoundLedger('2', {
      ...SNAPSHOT_DATA,
      tally: { A: { kills: 2, tripleKills: 1, kingKills: 1 }, B: { kills: 1 } },
      hits: { A: 1, B: 2 },
      result: {
        teamScores: { A: 50, B: 10 },
        playerScores: { u1: 50, u2: 50, u3: 10 },
        playerTiers: { u1: 1, u2: 1, u3: 2 },
        playerPoints: { u1: 10, u2: 10, u3: 7 },
        finishedAt: null,
      },
    })

    expect(ledger?.tally).toEqual({
      A: { kills: 2, tripleKills: 1, kingKills: 1 },
      B: { kills: 1, tripleKills: 0, kingKills: 0 },
    })
    expect(ledger?.hits).toEqual({ A: 1, B: 2 })
    expect(ledger?.result).toEqual({
      teamScores: { A: 50, B: 10 },
      playerScores: { u1: 50, u2: 50, u3: 10 },
      playerTiers: { u1: 1, u2: 1, u3: 2 },
      playerPoints: { u1: 10, u2: 10, u3: 7 },
      finishedAtMs: null,
    })
  })

  it('편입 모드의 tails·credits를 읽는다 — 문자열이 아닌 꼬리 원소·숫자가 아닌 크레딧은 그 엔트리만 버린다', () => {
    const ledger = toRoundLedger('2', {
      ...SNAPSHOT_DATA,
      mode: 'tail-chase',
      tails: { A: ['u3', 9], B: 'u1' },
      credits: { u1: 2, u2: 'two' },
    })

    expect(ledger?.tails).toEqual({ A: ['u3'] })
    expect(ledger?.credits).toEqual({ u1: 2 })
  })

  it('차수가 아닌 문서 ID나 알 수 없는 모드는 null — 손상된 문서 하나가 순위 계산을 세우지 않게', () => {
    expect(toRoundLedger('latest', SNAPSHOT_DATA)).toBeNull()
    expect(toRoundLedger('0', SNAPSHOT_DATA)).toBeNull()
    expect(toRoundLedger('2', { ...SNAPSHOT_DATA, mode: 'duel' })).toBeNull()
  })

  it('맵 안의 비정상 값은 그 엔트리만 버린다', () => {
    const ledger = toRoundLedger('1', {
      ...SNAPSHOT_DATA,
      teams: { A: ['u1', 7], B: 'u3' },
      xTeams: 'A',
      hits: { A: 1, B: 'two' },
    })

    expect(ledger?.teams).toEqual({ A: ['u1'] })
    expect(ledger?.xTeams).toEqual([])
    expect(ledger?.hits).toEqual({ A: 1 })
  })
})

describe('subscribeToRoundLedger', () => {
  it('현재 차수 문서를 구독하고 존재하면 매핑, 없으면 null을 전달한다', () => {
    const onChange = vi.fn<(ledger: unknown) => void>()
    subscribeToRoundLedger('AB2C', 2, onChange)

    expect(onSnapshotMock).toHaveBeenCalledTimes(1)
    expect(onSnapshotMock.mock.calls[0]![0]).toEqual({ path: 'rooms/AB2C/rounds/2' })
    const onNext = onSnapshotMock.mock.calls[0]![1]

    onNext({ id: '2', exists: () => true, data: () => SNAPSHOT_DATA } satisfies FakeDocSnapshot)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ roundNo: 2, mode: 'normal' }))

    onNext({ id: '2', exists: () => false, data: () => ({}) } satisfies FakeDocSnapshot)
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('영구 Listen 오류 콜백을 Firestore에 전달한다', () => {
    const onError = vi.fn<(error: Error) => void>()
    subscribeToRoundLedger('AB2C', 2, vi.fn<(ledger: unknown) => void>(), onError)

    expect(onSnapshotMock.mock.calls[0]![2]).toBe(onError)
  })
})

describe('subscribeToRoundLedgers', () => {
  it('방의 rounds 컬렉션을 구독해 차수 숫자순으로 정렬하고 손상 문서는 뺀다', () => {
    const onChange = vi.fn<(ledgers: Array<{ roundNo: number }>) => void>()
    subscribeToRoundLedgers('AB2C', onChange)

    expect(onSnapshotMock.mock.calls[0]![0]).toEqual({ path: 'rooms/AB2C/rounds' })
    const onNext = onSnapshotMock.mock.calls[0]![1]
    onNext({
      docs: [
        { id: '10', data: () => SNAPSHOT_DATA },
        { id: '2', data: () => SNAPSHOT_DATA },
        { id: 'broken', data: () => SNAPSHOT_DATA },
        { id: '1', data: () => SNAPSHOT_DATA },
      ],
    })

    const ledgers = onChange.mock.calls[0]![0]
    expect(ledgers.map((ledger) => ledger.roundNo)).toEqual([1, 2, 10])
  })
})
