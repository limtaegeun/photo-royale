import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/api/firebase', () => ({ db: {} }))

/** 실제 참조 대신 쓰는 식별자 — collection()/doc() mock이 만들어 호출 검증에 쓴다 */
interface FakeRef {
  path: string
}

const addDocMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => Promise<void>>()
const updateDocMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => Promise<void>>()
const batchUpdateMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => void>()
const batchCommitMock = vi.fn<() => Promise<void>>()
const getDocFromServerMock = vi.fn<(ref: FakeRef) => Promise<unknown>>()
/**
 * 실제 onSnapshot 호출 형태 두 가지를 같은 mock으로 받는다 — subscribeToSubmissionLog는
 * 기존 (query, onNext, onError) 3인자를, subscribeToPendingSubmissions는 fromCache 판단을
 * 위해 (query, options, onNext, onError) 4인자를 쓴다(p06 §7 필수 수정 2). 항상
 * (query, onNext, onError, options) 순서로 정규화해 기존 인덱스 접근(calls[0]![1] 등)을
 * 깨지 않으면서 options만 4번째 자리에서 새로 검증할 수 있게 한다.
 */
const onSnapshotMock =
  vi.fn<
    (
      query: unknown,
      onNext: (snapshot: unknown) => void,
      onError?: (error: Error) => void,
      options?: { includeMetadataChanges?: boolean },
    ) => () => void
  >()

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  doc: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  query: (source: FakeRef, ...constraints: unknown[]) => ({ source, constraints }),
  where: (field: string, op: string, value: unknown) => ({ where: field, op, value }),
  orderBy: (field: string, direction: string) => ({ orderBy: field, direction }),
  limit: (n: number) => ({ limit: n }),
  onSnapshot: (
    query: unknown,
    optionsOrNext: { includeMetadataChanges?: boolean } | ((snapshot: unknown) => void),
    nextOrError?: ((snapshot: unknown) => void) | ((error: Error) => void),
    maybeError?: (error: Error) => void,
  ) => {
    if (typeof optionsOrNext === 'function') {
      return onSnapshotMock(
        query,
        optionsOrNext,
        nextOrError as ((error: Error) => void) | undefined,
        undefined,
      )
    }
    return onSnapshotMock(
      query,
      nextOrError as (snapshot: unknown) => void,
      maybeError,
      optionsOrNext,
    )
  },
  serverTimestamp: () => 'server-timestamp',
  addDoc: (ref: FakeRef, data: Record<string, unknown>) => addDocMock(ref, data),
  updateDoc: (ref: FakeRef, data: Record<string, unknown>) => updateDocMock(ref, data),
  getDocFromServer: (ref: FakeRef) => getDocFromServerMock(ref),
  writeBatch: () => ({ update: batchUpdateMock, commit: batchCommitMock }),
  increment: (n: number) => ({ increment: n }),
}))

import {
  RECORD_LOG_LIMIT,
  SUBMISSION_PHOTO_MAX_LENGTH,
  SUBMISSION_PHOTO_PREFIX,
  approveSubmission,
  getSubmissionStatusFromServer,
  rejectSubmission,
  submitKillshot,
  subscribeToPendingSubmissions,
  subscribeToSubmissionLog,
} from '../api/submissions'

beforeEach(() => {
  addDocMock.mockReset().mockResolvedValue(undefined)
  updateDocMock.mockReset().mockResolvedValue(undefined)
  batchUpdateMock.mockReset()
  batchCommitMock.mockReset().mockResolvedValue(undefined)
  onSnapshotMock.mockReset()
  getDocFromServerMock.mockReset()
})

function pendingDoc(
  id: string,
  createdAt: { toMillis: () => number } | null,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    data: () => ({
      uid: 'player1',
      team: 'B',
      round: 2,
      photo: 'data:image/jpeg;base64,killshot',
      status: 'pending',
      createdAt,
      ...overrides,
    }),
  }
}

describe('submitKillshot', () => {
  it('submissions 서브컬렉션에 pending 상태와 서버 시각으로 append한다', async () => {
    await submitKillshot('AB2C', {
      uid: 'player1',
      team: 'B',
      round: 2,
      photo: 'data:image/jpeg;base64,killshot',
    })

    expect(addDocMock).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C/submissions' },
      {
        uid: 'player1',
        team: 'B',
        round: 2,
        photo: 'data:image/jpeg;base64,killshot',
        status: 'pending',
        createdAt: 'server-timestamp',
      },
    )
  })
})

describe('subscribeToPendingSubmissions', () => {
  it('pending만 서버 필터로 구독하고 스냅샷을 Submission으로 매핑한다', () => {
    const unsubscribe = vi.fn<() => void>()
    onSnapshotMock.mockReturnValue(unsubscribe)
    const onChange = vi.fn<(submissions: unknown, meta: unknown) => void>()

    const result = subscribeToPendingSubmissions('AB2C', 2, onChange)

    const [pendingQuery, onNext, , options] = onSnapshotMock.mock.calls[0]!
    expect(pendingQuery).toEqual({
      source: { path: 'rooms/AB2C/submissions' },
      constraints: [
        { where: 'status', op: '==', value: 'pending' },
        { where: 'round', op: '==', value: 2 },
      ],
    })
    // includeMetadataChanges 없이는 캐시→서버 전환(데이터 동일)이 onSnapshot을 다시 부르지
    // 않아 fromCache 플래그가 영원히 안 지워질 수 있다(p06 §7 필수 수정 2)
    expect(options).toEqual({ includeMetadataChanges: true })

    onNext({
      docs: [pendingDoc('s1', { toMillis: () => 1_700_000_000_000 })],
      metadata: { fromCache: false },
    })
    expect(onChange).toHaveBeenCalledWith(
      [
        {
          id: 's1',
          uid: 'player1',
          team: 'B',
          round: 2,
          photo: 'data:image/jpeg;base64,killshot',
          status: 'pending',
          createdAtMs: 1_700_000_000_000,
        },
      ],
      { fromCache: false },
    )
    expect(result).toBe(unsubscribe)
  })

  /** 음영지역(오프라인)에서는 로컬 캐시로만 스냅샷이 서빙된다 — 이 값이 종료 확인의 stale 판단 근거다 */
  it('fromCache가 true면 캐시에서만 나온 스냅샷임을 그대로 전달한다', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onChange = vi.fn<(submissions: unknown, meta: { fromCache: boolean }) => void>()

    subscribeToPendingSubmissions('AB2C', 2, onChange)
    const onNext = onSnapshotMock.mock.calls[0]![1]

    onNext({ docs: [], metadata: { fromCache: true } })

    expect(onChange).toHaveBeenCalledWith([], { fromCache: true })
  })

  it('오래된 순으로 정렬하고 서버 시각 반영 전(null)은 맨 뒤에 둔다', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onChange = vi.fn<(submissions: Array<{ id: string }>, meta: { fromCache: boolean }) => void>()

    subscribeToPendingSubmissions('AB2C', 2, onChange)
    const onNext = onSnapshotMock.mock.calls[0]![1]

    onNext({
      docs: [
        pendingDoc('newest', { toMillis: () => 3_000 }),
        pendingDoc('just-sent', null),
        pendingDoc('oldest', { toMillis: () => 1_000 }),
      ],
      metadata: { fromCache: false },
    })

    expect(onChange.mock.calls[0]![0].map((submission) => submission.id)).toEqual([
      'oldest',
      'newest',
      'just-sent',
    ])
  })

  it('스키마가 깨진 문서는 타입 단언하지 않고 큐에서 제외한다', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onChange = vi.fn<(submissions: Array<{ id: string }>, meta: { fromCache: boolean }) => void>()

    subscribeToPendingSubmissions('AB2C', 2, onChange)
    const onNext = onSnapshotMock.mock.calls[0]![1]
    onNext({ docs: [pendingDoc('invalid', null, { photo: 123 })], metadata: { fromCache: false } })

    expect(onChange).toHaveBeenCalledWith([], { fromCache: false })
  })

  it('영구 Listen 오류 콜백을 Firestore에 전달한다', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onError = vi.fn<(error: Error) => void>()

    subscribeToPendingSubmissions('AB2C', 2, vi.fn(), onError)

    expect(onSnapshotMock.mock.calls[0]![2]).toBe(onError)
  })
})

describe('subscribeToSubmissionLog', () => {
  it('createdAt 내림차순 + 최근 RECORD_LOG_LIMIT건으로 구독하고 판정 결과까지 SubmissionRecord로 매핑한다', () => {
    const unsubscribe = vi.fn<() => void>()
    onSnapshotMock.mockReturnValue(unsubscribe)
    const onChange = vi.fn<(records: unknown) => void>()

    const result = subscribeToSubmissionLog('AB2C', onChange)

    // 무제한 구독 대신 서버 정렬(createdAt desc) + limit으로 최근 건만 받는다(모바일 메모리·과금 위험 완화)
    const [logQuery, onNext] = onSnapshotMock.mock.calls[0]!
    expect(logQuery).toEqual({
      source: { path: 'rooms/AB2C/submissions' },
      constraints: [
        { orderBy: 'createdAt', direction: 'desc' },
        { limit: RECORD_LOG_LIMIT },
      ],
    })

    onNext({
      docs: [
        pendingDoc('s1', { toMillis: () => 1_000 }, {
          status: 'approved',
          targetTeam: 'A',
          targetParticipantUid: 'u1',
          judgedAt: { toMillis: () => 2_000 },
        }),
      ],
    })
    expect(onChange).toHaveBeenCalledWith([
      {
        id: 's1',
        uid: 'player1',
        team: 'B',
        round: 2,
        photo: 'data:image/jpeg;base64,killshot',
        status: 'approved',
        createdAtMs: 1_000,
        targetTeam: 'A',
        // 배율 필드가 없는 확정(배율 도입 전 판정)은 일반 킬로 읽는다
        multiplier: 1,
        judgedAtMs: 2_000,
      },
    ])
    expect(result).toBe(unsubscribe)
  })

  it('확정이 아닌 문서의 targetTeam은 신뢰하지 않고 null로 남긴다', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onChange = vi.fn<(records: Array<{ targetTeam: string | null }>) => void>()

    subscribeToSubmissionLog('AB2C', onChange)
    const onNext = onSnapshotMock.mock.calls[0]![1]

    onNext({
      docs: [
        pendingDoc('rejected', null, { status: 'rejected', targetTeam: 'A' }),
        pendingDoc('pending', null),
      ],
    })

    expect(
      onChange.mock.calls[0]![0].map((record) => record.targetTeam),
    ).toEqual([null, null])
  })

  it('라운드 내림차순, 라운드 안에서는 최신 제출부터 — 서버 시각 반영 전(null)은 맨 앞', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onChange = vi.fn<(records: Array<{ id: string }>) => void>()

    subscribeToSubmissionLog('AB2C', onChange)
    const onNext = onSnapshotMock.mock.calls[0]![1]

    onNext({
      docs: [
        pendingDoc('r1-old', { toMillis: () => 1_000 }, { round: 1 }),
        pendingDoc('r2-new', { toMillis: () => 3_000 }, { round: 2 }),
        pendingDoc('r2-just-sent', null, { round: 2 }),
        pendingDoc('r2-old', { toMillis: () => 2_000 }, { round: 2 }),
      ],
    })

    expect(onChange.mock.calls[0]![0].map((record) => record.id)).toEqual([
      'r2-just-sent',
      'r2-new',
      'r2-old',
      'r1-old',
    ])
  })

  it('스키마가 깨진 문서는 타입 단언하지 않고 기록에서 제외한다', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onChange = vi.fn<(records: Array<{ id: string }>) => void>()

    subscribeToSubmissionLog('AB2C', onChange)
    const onNext = onSnapshotMock.mock.calls[0]![1]
    onNext({ docs: [pendingDoc('invalid', null, { status: 'broken' })] })

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('영구 Listen 오류 콜백을 Firestore에 전달한다', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onError = vi.fn<(error: Error) => void>()

    subscribeToSubmissionLog('AB2C', vi.fn(), onError)

    expect(onSnapshotMock.mock.calls[0]![2]).toBe(onError)
  })
})

describe('판정 쓰기', () => {
  it('판정 실패 확인은 캐시가 아닌 서버 문서 상태를 읽는다', async () => {
    getDocFromServerMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'approved' }),
    })

    await expect(getSubmissionStatusFromServer('AB2C', 's1')).resolves.toBe('approved')
    expect(getDocFromServerMock).toHaveBeenCalledExactlyOnceWith({
      path: 'rooms/AB2C/submissions/s1',
    })
  })

  it('서버 문서가 없거나 상태가 깨졌으면 선판정 상태로 단정하지 않는다', async () => {
    getDocFromServerMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ status: 'broken' }) })

    await expect(getSubmissionStatusFromServer('AB2C', 'missing')).resolves.toBeNull()
    await expect(getSubmissionStatusFromServer('AB2C', 'broken')).resolves.toBeNull()
  })

  it('확정은 approved 상태·대상 완장·배율(기본 1)·서버 시각을 한 번에 쓴다', async () => {
    await approveSubmission('AB2C', 's1', { team: 'A', participantUid: 'u1' })

    expect(batchUpdateMock).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C/submissions/s1' },
      {
        status: 'approved',
        targetTeam: 'A',
        targetParticipantUid: 'u1',
        multiplier: 1,
        judgedAt: 'server-timestamp',
      },
    )
    expect(batchCommitMock).toHaveBeenCalledTimes(1)
  })

  /**
   * 낙오 포착 킬(P07 M2) — 배율 3은 문서에 남고, 원장 집계는 kills가 아니라 tripleKills로 간다.
   * 정산 계산기가 tripleKills × 30을 이미 알고 있어 이 한 줄이 곧 점수다.
   */
  it('배율 3이면 문서에 multiplier 3을 쓰고 원장 집계를 tripleKills로 올린다', async () => {
    await approveSubmission(
      'AB2C',
      's1',
      { team: 'B', participantUid: 'u3' },
      { roundNo: 2, attackerTeam: 'A' },
      3,
    )

    expect(batchUpdateMock).toHaveBeenCalledWith(
      { path: 'rooms/AB2C/submissions/s1' },
      expect.objectContaining({ status: 'approved', multiplier: 3 }),
    )
    expect(batchUpdateMock).toHaveBeenCalledWith(
      { path: 'rooms/AB2C/rounds/2' },
      { 'tally.A.tripleKills': { increment: 1 }, 'hits.B': { increment: 1 } },
    )
  })

  /** 왕잡기(P07 M4-3) — 피격 팀이 X 겸직 팀이면 kills와 함께 kingKills도 올린다(부분집합) */
  it('kingTarget이면 원장 집계에 kingKills increment를 함께 얹는다', async () => {
    await approveSubmission(
      'AB2C',
      's1',
      { team: 'B', participantUid: 'u3' },
      { roundNo: 2, attackerTeam: 'A', kingTarget: true },
    )

    expect(batchUpdateMock).toHaveBeenCalledWith(
      { path: 'rooms/AB2C/rounds/2' },
      {
        'tally.A.kills': { increment: 1 },
        'tally.A.kingKills': { increment: 1 },
        'hits.B': { increment: 1 },
      },
    )
  })

  it('배율 3으로 확정된 기록은 multiplier 3으로 읽는다', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onChange = vi.fn<(records: Array<{ multiplier: number }>) => void>()
    subscribeToSubmissionLog('AB2C', onChange)
    const onNext = onSnapshotMock.mock.calls[0]![1]
    onNext({
      docs: [
        pendingDoc('s1', { toMillis: () => 1_000 }, {
          status: 'approved', targetTeam: 'A', targetParticipantUid: 'u1', multiplier: 3, judgedAt: { toMillis: () => 2_000 },
        }),
      ],
    })
    expect(onChange.mock.calls[0]![0][0]!.multiplier).toBe(3)
  })

  /**
   * 점수 정산(P07) — 판정과 원장 집계가 한 배치에 실려 둘 중 하나만 남는 일이 없다.
   * 원장 문서가 없는 라운드는 tally를 안 넘기고(위 테스트), 없는 문서 update로 배치가 죽지 않는다.
   */
  it('tally가 있으면 공격 완장 kills와 피격 완장 hits의 increment를 같은 배치에 얹는다', async () => {
    await approveSubmission(
      'AB2C',
      's1',
      { team: 'B', participantUid: 'u3' },
      { roundNo: 2, attackerTeam: 'A' },
    )

    expect(batchUpdateMock).toHaveBeenCalledTimes(2)
    expect(batchUpdateMock).toHaveBeenCalledWith(
      { path: 'rooms/AB2C/rounds/2' },
      { 'tally.A.kills': { increment: 1 }, 'hits.B': { increment: 1 } },
    )
    expect(batchCommitMock).toHaveBeenCalledTimes(1)
  })

  it('반려는 targetTeam 없이 rejected 상태만 쓴다 — rules가 부재를 요구한다', async () => {
    await rejectSubmission('AB2C', 's1')

    expect(updateDocMock).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C/submissions/s1' },
      { status: 'rejected', judgedAt: 'server-timestamp' },
    )
  })
})

/**
 * 사진 길이 상한·데이터 URL 접두는 rules와의 이중 정의다 — 한쪽만 바꾸면 앱이 보낸 킬샷이
 * 403으로 사라진다. rules 파일을 직접 읽어 숫자·문자열과 갈래 존재를 대조한다(notices.spec의
 * 패턴 동기화 테스트 답습).
 */
describe('firestore.rules 킬샷 규칙 동기화 가드', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')

  it('rules의 photo 길이 상한이 SUBMISSION_PHOTO_MAX_LENGTH와 숫자까지 동일하다', () => {
    const match = rules.match(/request\.resource\.data\.photo\.size\(\) <= (\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBe(SUBMISSION_PHOTO_MAX_LENGTH)
  })

  it('rules의 데이터 URL 접두 검사가 SUBMISSION_PHOTO_PREFIX와 동일하다', () => {
    expect(rules).toContain(`photo.matches('^${SUBMISSION_PHOTO_PREFIX}.*')`)
  })

  /**
   * 마감 컷은 rules에만 있는 규칙이라 클라 상수와 대조할 대상이 없다. 대신 검사의 존재 자체를
   * 못 박는다 — 이 줄이 빠지면 라운드가 끝난 뒤 올라온 사진이 조용히 접수된다(2026-08-31 실측:
   * 화면이 00:00 종료인 상태에서 제출 2건이 그대로 통과해 판정 대기가 2건 → 4건이 됐다).
   *
   * 기준 시각은 `round.startedAt + round.durationMs`다. writeRound가 모든 전이를 "지금부터
   * 남은 시간만큼"으로 재앵커하므로 이 식 하나가 시간 조정까지 따라온다.
   */
  it('마감(startedAt + durationMs) 이후 도착한 제출을 거부한다', () => {
    const submissionsBlock = rules.match(/match \/submissions\/\{submissionId\}[\s\S]*?\n {6}\}/)!
    expect(submissionsBlock).not.toBeNull()
    expect(submissionsBlock[0]).toContain('request.time <')
    expect(submissionsBlock[0]).toContain('.round.startedAt')
    expect(submissionsBlock[0]).toContain(".round.durationMs, 'ms')")
  })

  it('submissions 갈래가 존재하고 판정은 pending에서만, 삭제는 불가다', () => {
    expect(rules).toContain('match /submissions/{submissionId}')
    const submissionsBlock = rules.match(/match \/submissions\/\{submissionId\}[\s\S]*?\n {6}\}/)!
    expect(submissionsBlock).not.toBeNull()
    expect(submissionsBlock[0]).toContain("resource.data.status == 'pending'")
    expect(submissionsBlock[0]).toContain('exists(/databases/$(database)/documents/rooms/$(roomCode)/participants/$(request.auth.uid))')
    expect(submissionsBlock[0]).toContain('resource.data.round')
    expect(submissionsBlock[0]).toContain('request.resource.data.targetTeam != resource.data.team')
    expect(submissionsBlock[0]).toContain(
      "['status', 'targetTeam', 'targetParticipantUid', 'judgedAt', 'multiplier']",
    )
    // 배율은 1·3만, 반려에는 배율이 없어야 한다(P07 M2)
    expect(submissionsBlock[0]).toContain('request.resource.data.multiplier in [1, 3]')
    expect(submissionsBlock[0]).toContain("!('multiplier' in request.resource.data))")
    expect(submissionsBlock[0]).toContain('allow delete: if false;')
  })
})
