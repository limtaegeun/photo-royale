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
const onSnapshotMock =
  vi.fn<
    (
      query: unknown,
      onNext: (snapshot: unknown) => void,
      onError?: (error: Error) => void,
    ) => () => void
  >()

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  doc: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  query: (source: FakeRef, ...constraints: unknown[]) => ({ source, constraints }),
  where: (field: string, op: string, value: unknown) => ({ where: field, op, value }),
  onSnapshot: (
    query: unknown,
    onNext: (snapshot: unknown) => void,
    onError?: (error: Error) => void,
  ) => onSnapshotMock(query, onNext, onError),
  serverTimestamp: () => 'server-timestamp',
  addDoc: (ref: FakeRef, data: Record<string, unknown>) => addDocMock(ref, data),
  updateDoc: (ref: FakeRef, data: Record<string, unknown>) => updateDocMock(ref, data),
}))

import {
  SUBMISSION_PHOTO_MAX_LENGTH,
  SUBMISSION_PHOTO_PREFIX,
  approveSubmission,
  rejectSubmission,
  submitKillshot,
  subscribeToPendingSubmissions,
} from '../api/submissions'

beforeEach(() => {
  addDocMock.mockReset().mockResolvedValue(undefined)
  updateDocMock.mockReset().mockResolvedValue(undefined)
  onSnapshotMock.mockReset()
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
    const onChange = vi.fn<(submissions: unknown) => void>()

    const result = subscribeToPendingSubmissions('AB2C', 2, onChange)

    const [pendingQuery, onNext] = onSnapshotMock.mock.calls[0]!
    expect(pendingQuery).toEqual({
      source: { path: 'rooms/AB2C/submissions' },
      constraints: [
        { where: 'status', op: '==', value: 'pending' },
        { where: 'round', op: '==', value: 2 },
      ],
    })

    onNext({ docs: [pendingDoc('s1', { toMillis: () => 1_700_000_000_000 })] })
    expect(onChange).toHaveBeenCalledWith([
      {
        id: 's1',
        uid: 'player1',
        team: 'B',
        round: 2,
        photo: 'data:image/jpeg;base64,killshot',
        status: 'pending',
        createdAtMs: 1_700_000_000_000,
      },
    ])
    expect(result).toBe(unsubscribe)
  })

  it('오래된 순으로 정렬하고 서버 시각 반영 전(null)은 맨 뒤에 둔다', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onChange = vi.fn<(submissions: Array<{ id: string }>) => void>()

    subscribeToPendingSubmissions('AB2C', 2, onChange)
    const onNext = onSnapshotMock.mock.calls[0]![1]

    onNext({
      docs: [
        pendingDoc('newest', { toMillis: () => 3_000 }),
        pendingDoc('just-sent', null),
        pendingDoc('oldest', { toMillis: () => 1_000 }),
      ],
    })

    expect(onChange.mock.calls[0]![0].map((submission) => submission.id)).toEqual([
      'oldest',
      'newest',
      'just-sent',
    ])
  })

  it('스키마가 깨진 문서는 타입 단언하지 않고 큐에서 제외한다', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onChange = vi.fn<(submissions: Array<{ id: string }>) => void>()

    subscribeToPendingSubmissions('AB2C', 2, onChange)
    const onNext = onSnapshotMock.mock.calls[0]![1]
    onNext({ docs: [pendingDoc('invalid', null, { photo: 123 })] })

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('영구 Listen 오류 콜백을 Firestore에 전달한다', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onError = vi.fn<(error: Error) => void>()

    subscribeToPendingSubmissions('AB2C', 2, vi.fn(), onError)

    expect(onSnapshotMock.mock.calls[0]![2]).toBe(onError)
  })
})

describe('판정 쓰기', () => {
  it('확정은 approved 상태·대상 완장·서버 시각을 한 번에 쓴다', async () => {
    await approveSubmission('AB2C', 's1', { team: 'A', participantUid: 'u1' })

    expect(updateDocMock).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C/submissions/s1' },
      {
        status: 'approved',
        targetTeam: 'A',
        targetParticipantUid: 'u1',
        judgedAt: 'server-timestamp',
      },
    )
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

  it('submissions 갈래가 존재하고 판정은 pending에서만, 삭제는 불가다', () => {
    expect(rules).toContain('match /submissions/{submissionId}')
    const submissionsBlock = rules.match(/match \/submissions\/\{submissionId\}[\s\S]*?\n {6}\}/)!
    expect(submissionsBlock).not.toBeNull()
    expect(submissionsBlock[0]).toContain("resource.data.status == 'pending'")
    expect(submissionsBlock[0]).toContain('exists(/databases/$(database)/documents/rooms/$(roomCode)/participants/$(request.auth.uid))')
    expect(submissionsBlock[0]).toContain('resource.data.round')
    expect(submissionsBlock[0]).toContain('request.resource.data.targetTeam != resource.data.team')
    expect(submissionsBlock[0]).toContain(
      "['status', 'targetTeam', 'targetParticipantUid', 'judgedAt']",
    )
    expect(submissionsBlock[0]).toContain('allow delete: if false;')
  })
})
