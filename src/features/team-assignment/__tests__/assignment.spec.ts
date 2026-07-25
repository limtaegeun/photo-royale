import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/api/firebase', () => ({ db: {} }))

/** 실제 DocumentReference 대신 쓰는 식별자 — doc() mock이 만들어 호출 검증에 쓴다 */
interface FakeRef {
  path: string
}

const batchUpdateMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => void>()
const batchCommitMock = vi.fn<() => Promise<void>>()

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  writeBatch: () => ({ update: batchUpdateMock, commit: batchCommitMock }),
}))

import { confirmAssignment, type ConfirmedTeamWrite } from '../api/assignment'

beforeEach(() => {
  batchUpdateMock.mockReset()
  batchCommitMock.mockReset().mockResolvedValue(undefined)
})

describe('confirmAssignment', () => {
  const TEAMS: ConfirmedTeamWrite[] = [
    {
      armband: 'A',
      isXTeam: true,
      members: [
        { id: 'u1', nextStreak: 0, nextPartnerIds: ['u2'] },
        { id: 'u2', nextStreak: 0, nextPartnerIds: ['u1'] },
      ],
    },
    {
      armband: 'B',
      isXTeam: false,
      members: [{ id: 'u3', nextStreak: 1, nextPartnerIds: [] }],
    },
  ]

  it('참가자마다 완장·X·이월값·isReady 리셋을 batch update하고 방 assignmentRound·gameMode를 올린 뒤 commit 1회', async () => {
    await confirmAssignment('AB2C', 2, 'king-hunt', TEAMS)

    // 멤버 3명 + 방 문서 1 = update 4회
    expect(batchUpdateMock).toHaveBeenCalledTimes(4)

    expect(batchUpdateMock).toHaveBeenCalledWith(
      { path: 'rooms/AB2C/participants/u1' },
      { team: 'A', assignedRound: 2, isXTeam: true, sameGenderStreak: 0, previousPartnerIds: ['u2'], isReady: false },
    )
    expect(batchUpdateMock).toHaveBeenCalledWith(
      { path: 'rooms/AB2C/participants/u2' },
      { team: 'A', assignedRound: 2, isXTeam: true, sameGenderStreak: 0, previousPartnerIds: ['u1'], isReady: false },
    )
    expect(batchUpdateMock).toHaveBeenCalledWith(
      { path: 'rooms/AB2C/participants/u3' },
      { team: 'B', assignedRound: 2, isXTeam: false, sameGenderStreak: 1, previousPartnerIds: [], isReady: false },
    )
    expect(batchUpdateMock).toHaveBeenCalledWith(
      { path: 'rooms/AB2C' },
      { assignmentRound: 2, gameMode: 'king-hunt' },
    )

    expect(batchCommitMock).toHaveBeenCalledTimes(1)
  })

  it('commit 실패는 호출부로 전파된다', async () => {
    batchCommitMock.mockRejectedValueOnce(new Error('permission denied'))

    await expect(confirmAssignment('AB2C', 1, 'normal', TEAMS)).rejects.toThrow('permission denied')
  })
})

/**
 * 배정 확정이 쓰는 필드 집합은 firestore.rules의 affectedKeys 화이트리스트와 이중 정의다
 * (rules는 클라 코드를 import 불가). 한쪽만 늘리면 확정이 전면 거부되므로, rules 파일을 직접
 * 읽어 두 목록이 일치하는지 여기서 잡는다. rooms.spec의 방 코드 가드와 같은 방식이다.
 */
describe('firestore.rules 배정 쓰기 필드 동기화 가드', () => {
  /** confirmAssignment가 참가자 문서에 쓰는 필드 — 아래 rules 화이트리스트와 같아야 한다 */
  const WRITTEN_FIELDS = [
    'team',
    'assignedRound',
    'isXTeam',
    'sameGenderStreak',
    'previousPartnerIds',
    'isReady',
  ]

  it('rules의 참가자 배정 화이트리스트가 실제 쓰기 필드와 일치한다', () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')

    const listMatch = rules.match(
      /affectedKeys\(\)\s*\n?\s*\.hasOnly\(\[([^\]]*'previousPartnerIds'[^\]]*)\]\)/,
    )
    expect(listMatch).not.toBeNull()
    const rulesFields = [...listMatch![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect([...rulesFields].sort()).toEqual([...WRITTEN_FIELDS].sort())
  })

  it('실제 batch update payload의 키가 화이트리스트와 정확히 같다', async () => {
    await confirmAssignment('AB2C', 2, 'normal', [
      {
        armband: 'A',
        isXTeam: false,
        members: [{ id: 'u1', nextStreak: 0, nextPartnerIds: [] }],
      },
    ])

    const participantCall = batchUpdateMock.mock.calls.find(([ref]) =>
      ref.path.includes('/participants/'),
    )!
    expect(Object.keys(participantCall[1]).sort()).toEqual([...WRITTEN_FIELDS].sort())
  })
})
