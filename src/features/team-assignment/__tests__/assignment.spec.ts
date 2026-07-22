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

  it('참가자마다 완장·X·이월값·isReady 리셋을 batch update하고 방 assignmentRound를 올린 뒤 commit 1회', async () => {
    await confirmAssignment('AB2C', 2, TEAMS)

    // 멤버 3명 + 방 문서 1 = update 4회
    expect(batchUpdateMock).toHaveBeenCalledTimes(4)

    expect(batchUpdateMock).toHaveBeenCalledWith(
      { path: 'rooms/AB2C/participants/u1' },
      { team: 'A', isXTeam: true, sameGenderStreak: 0, previousPartnerIds: ['u2'], isReady: false },
    )
    expect(batchUpdateMock).toHaveBeenCalledWith(
      { path: 'rooms/AB2C/participants/u2' },
      { team: 'A', isXTeam: true, sameGenderStreak: 0, previousPartnerIds: ['u1'], isReady: false },
    )
    expect(batchUpdateMock).toHaveBeenCalledWith(
      { path: 'rooms/AB2C/participants/u3' },
      { team: 'B', isXTeam: false, sameGenderStreak: 1, previousPartnerIds: [], isReady: false },
    )
    expect(batchUpdateMock).toHaveBeenCalledWith(
      { path: 'rooms/AB2C' },
      { assignmentRound: 2 },
    )

    expect(batchCommitMock).toHaveBeenCalledTimes(1)
  })

  it('commit 실패는 호출부로 전파된다', async () => {
    batchCommitMock.mockRejectedValueOnce(new Error('permission denied'))

    await expect(confirmAssignment('AB2C', 1, TEAMS)).rejects.toThrow('permission denied')
  })
})
