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

  it('참가자마다 완장·X·이월값·isReady 리셋을 batch update하고 방 assignmentRound·gameMode·차수 모드 이력을 올린 뒤 commit 1회', async () => {
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
      { assignmentRound: 2, gameMode: 'king-hunt', 'roundModes.2': 'king-hunt' },
    )

    expect(batchCommitMock).toHaveBeenCalledTimes(1)
  })

  /**
   * gameMode는 확정마다 덮어써지므로 과거 라운드 모드는 roundModes 이력에만 남는다. dot-path로
   * 이번 차수 키만 병합해야(맵 통째 쓰기 금지) 기존 차수가 지워지지 않고, rules도 같은 계약이다.
   */
  it('차수 → 모드 이력을 이번 차수 dot-path 키로만 쓴다 — 맵을 통째로 덮어쓰지 않는다', async () => {
    await confirmAssignment('AB2C', 3, 'group', TEAMS)

    const roomCall = batchUpdateMock.mock.calls.find(([ref]) => ref.path === 'rooms/AB2C')!
    expect(roomCall[1]).toEqual({
      assignmentRound: 3,
      gameMode: 'group',
      'roundModes.3': 'group',
    })
    expect(Object.keys(roomCall[1])).not.toContain('roundModes')
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

  /**
   * 방 문서 쪽도 같은 이중 정의다 — rules의 배정 확정 갈래가 roundModes를 허용하지 않으면
   * 이력 키가 실린 확정이 전부 permission-denied가 된다(이력만 빠지는 게 아니라 확정 자체가 죽는다).
   */
  it('rules 배정 확정 갈래가 roundModes 이력 키를 허용하고 이번 차수·gameMode에 묶어 둔다', () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')

    expect(rules).toContain("hasOnly(['assignmentRound', 'gameMode', 'roundModes'])")
    // 추가·변경 가능한 키는 이번 확정 차수 하나뿐(기존 이력 변조 차단)
    expect(rules).toContain('hasOnly([string(request.resource.data.assignmentRound)])')
    // 값은 함께 커밋되는 gameMode와 같아야 한다 — 모드 화이트리스트 검증이 등식으로 전이된다
    expect(rules).toMatch(
      /roundModes\[string\(request\.resource\.data\.assignmentRound\)\]\s*==\s*request\.resource\.data\.gameMode/,
    )
    // 필드가 없는 요청(구버전 클라이언트)은 검증을 건너뛴다 — 배포 순서에 의존하지 않는다
    expect(rules).toContain("!('roundModes' in request.resource.data)")
  })
})
