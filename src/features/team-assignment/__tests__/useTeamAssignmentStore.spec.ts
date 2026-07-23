import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Gender } from '@/features/auth'

// api/assignment은 firebase를 끌어오므로 통째로 모킹한다 — 스토어 로직만 검증한다
const confirmAssignmentMock =
  vi.fn<(code: string, nextRound: number, gameMode: string, teams: unknown) => Promise<void>>()
vi.mock('../api/assignment', () => ({
  confirmAssignment: (code: string, nextRound: number, gameMode: string, teams: unknown) =>
    confirmAssignmentMock(code, nextRound, gameMode, teams),
}))

import {
  useTeamAssignmentStore,
  REROLL_FEEDBACK_MS,
  type DraftMember,
} from '../stores/useTeamAssignmentStore'
import { DEFAULT_GAME_MODE } from '../gameModes'

/**
 * 셔플을 항등(no-op)으로 만드는 rng — assignTeams의 배정 순서가 입력 순서와 같아진다.
 * pickXTeams에서는 floor(0.999999 * n)이라 그룹 후보 중 마지막을 고른다.
 */
const identityRandom = () => 0.999999

function member(
  id: string,
  name: string,
  gender: Gender | null,
  sameGenderStreak = 0,
  previousPartnerIds: string[] = [],
): DraftMember {
  return { id, name, gender, sameGenderStreak, previousPartnerIds }
}

/** 남2 여2 — 항등 셔플이면 A[m1,f1](혼성) · B[m2,f2](혼성)로 편성된다 */
function mixedFour(): DraftMember[] {
  return [
    member('m1', '지후', 'male'),
    member('m2', '도윤', 'male'),
    member('f1', '하린', 'female'),
    member('f2', '오리', 'female'),
  ]
}

describe('useTeamAssignmentStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    confirmAssignmentMock.mockReset().mockResolvedValue(undefined)
  })

  describe('startDraft', () => {
    it('팀 순서대로 완장을 부여하고 멤버(name 포함)를 보존한다', () => {
      const store = useTeamAssignmentStore()

      store.startDraft(mixedFour(), 1, 'normal', identityRandom)

      expect(store.draftTeams).toHaveLength(2)
      expect(store.draftTeams.map((team) => team.armband)).toEqual(['A', 'B'])
      expect(store.draftTeams[0]!.members.map((m) => m.id)).toEqual(['m1', 'f1'])
      expect(store.draftTeams[0]!.members[0]!.name).toBe('지후')
      // X 모듈 기본 꺼짐 → 전 팀 isXTeam false
      expect(store.draftTeams.every((team) => !team.isXTeam)).toBe(true)
      expect(store.assignedCount).toBe(4)
    })

    it('X 모듈이 켜져 있으면 편성과 동시에 X 팀을 마킹한다', () => {
      const store = useTeamAssignmentStore()
      store.setXModule(true, identityRandom) // 빈 보드라 아직 선정 없음

      store.startDraft(mixedFour(), 1, 'normal', identityRandom)

      // A(blue)·B(orange)는 서로 다른 그룹이라 각각 유일 후보 → 둘 다 X로 선정된다
      expect(store.draftTeams.every((team) => team.isXTeam)).toBe(true)
    })
  })

  describe('reroll', () => {
    it('대기자를 제외한 채 배정된 전원만 재편성하고 대기열은 유지한다', () => {
      const store = useTeamAssignmentStore()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom)
      store.addToWaitingPool(member('w1', '대기자', 'male'))

      store.reroll(identityRandom)

      // 대기자는 팀에 편입되지 않고 대기열에 남는다
      expect(store.waitingPool.map((m) => m.id)).toEqual(['w1'])
      const assignedIds = store.draftTeams.flatMap((team) => team.members.map((m) => m.id)).sort()
      expect(assignedIds).toEqual(['f1', 'f2', 'm1', 'm2'])
    })

    describe('isRerolling (로딩 표기용 최소 피드백 시간)', () => {
      beforeEach(() => {
        vi.useFakeTimers()
      })

      afterEach(() => {
        vi.useRealTimers()
      })

      it('재배정 중 isRerolling을 true로 유지하다가 REROLL_FEEDBACK_MS 후 해제한다', async () => {
        const store = useTeamAssignmentStore()
        store.startDraft(mixedFour(), 1, 'normal', identityRandom)

        const done = store.reroll(identityRandom)
        // 재편성(draftTeams 갱신)은 동기로 즉시 끝나 있다
        expect(store.isRerolling).toBe(true)
        const assignedIds = store.draftTeams.flatMap((team) => team.members.map((m) => m.id)).sort()
        expect(assignedIds).toEqual(['f1', 'f2', 'm1', 'm2'])

        await vi.advanceTimersByTimeAsync(REROLL_FEEDBACK_MS)
        await done

        expect(store.isRerolling).toBe(false)
      })

      it('진행 중 재호출은 무시한다(중복 가드)', async () => {
        const store = useTeamAssignmentStore()
        store.startDraft(mixedFour(), 1, 'normal', identityRandom)

        const first = store.reroll(identityRandom)
        const second = store.reroll(identityRandom) // 진행 중 재호출 — 무시되어야 한다

        await vi.advanceTimersByTimeAsync(REROLL_FEEDBACK_MS)
        await Promise.all([first, second])

        expect(store.isRerolling).toBe(false)
      })
    })
  })

  describe('addToWaitingPool', () => {
    it('이미 배정/대기 중인 사람은(id 기준) 중복 추가하지 않는다', () => {
      const store = useTeamAssignmentStore()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom)

      store.addToWaitingPool(member('m1', '지후', 'male')) // 이미 배정됨
      expect(store.waitingPool).toHaveLength(0)

      store.addToWaitingPool(member('w1', '대기자', 'male'))
      store.addToWaitingPool(member('w1', '대기자', 'male')) // 중복
      expect(store.waitingPool.map((m) => m.id)).toEqual(['w1'])
    })
  })

  describe('moveSelectedTo', () => {
    it('선택 멤버를 대상 팀으로 옮기고, 2인이 아니게 된 팀의 X를 해제한다', () => {
      const store = useTeamAssignmentStore()
      store.setXModule(true, identityRandom)
      store.startDraft(mixedFour(), 1, 'normal', identityRandom) // A·B 모두 X

      store.selectMember('m1')
      store.moveSelectedTo('B')

      const teamA = store.draftTeams.find((team) => team.armband === 'A')!
      const teamB = store.draftTeams.find((team) => team.armband === 'B')!
      expect(teamA.members.map((m) => m.id)).toEqual(['f1'])
      expect(teamB.members.map((m) => m.id)).toEqual(['m2', 'f2', 'm1'])
      // 1인 팀·3인 팀 모두 2인이 아니므로 X 해제
      expect(teamA.isXTeam).toBe(false)
      expect(teamB.isXTeam).toBe(false)
      // 이동 후 선택 해제
      expect(store.selectedMemberId).toBeNull()
    })

    it('대상이 null이면 대기열로 보내고, 비게 된 팀도 유지한다', () => {
      const store = useTeamAssignmentStore()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom)

      store.selectMember('m1')
      store.moveSelectedTo(null)
      store.selectMember('f1')
      store.moveSelectedTo(null)

      const teamA = store.draftTeams.find((team) => team.armband === 'A')!
      expect(teamA.members).toHaveLength(0) // 빈 팀 유지
      expect(store.waitingPool.map((m) => m.id)).toEqual(['m1', 'f1'])
    })
  })

  describe('addTeam', () => {
    it('사용 중이지 않은 첫 완장으로 빈 팀을 추가한다', () => {
      const store = useTeamAssignmentStore()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom) // A·B 사용 중

      store.addTeam()

      const added = store.draftTeams[store.draftTeams.length - 1]!
      expect(added.armband).toBe('C')
      expect(added.members).toHaveLength(0)
      expect(store.confirmError).toBeNull()
    })

    it('완장을 모두 쓰면 안내를 세팅하고 팀을 추가하지 않는다', () => {
      const store = useTeamAssignmentStore()
      for (let i = 0; i < 25; i++) store.addTeam() // 완장 25개 모두 소진

      expect(store.draftTeams).toHaveLength(25)
      store.addTeam()
      expect(store.draftTeams).toHaveLength(25)
      expect(store.confirmError).not.toBeNull()
    })
  })

  describe('setXModule', () => {
    it('켜면 현재 편성 기준으로 X를 선정하고, 끄면 전 팀의 X를 해제한다', () => {
      const store = useTeamAssignmentStore()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom)
      expect(store.draftTeams.every((team) => !team.isXTeam)).toBe(true)

      store.setXModule(true, identityRandom)
      expect(store.draftTeams.some((team) => team.isXTeam)).toBe(true)

      store.setXModule(false)
      expect(store.draftTeams.every((team) => !team.isXTeam)).toBe(true)
    })
  })

  describe('gameMode (드래프트 속성)', () => {
    it('startDraft가 넘겨받은 모드로 draftGameMode를 세팅한다', () => {
      const store = useTeamAssignmentStore()

      store.startDraft(mixedFour(), 1, 'king-hunt', identityRandom)

      expect(store.draftGameMode).toBe('king-hunt')
    })

    it('setGameMode는 드래프트 모드만 바꾼다', () => {
      const store = useTeamAssignmentStore()
      // startDraft는 가드를 거치지 않으므로 미구현 모드로도 시작할 수 있다 — 이후 setGameMode로
      // available한 모드(normal)로 되돌려 setGameMode 자체의 동작만 검증한다
      store.startDraft(mixedFour(), 1, 'king-hunt', identityRandom)

      store.setGameMode('normal')

      expect(store.draftGameMode).toBe('normal')
    })

    it('setGameMode는 available이 false인 미구현 모드는 무시한다(방어 가드)', () => {
      const store = useTeamAssignmentStore()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom)

      store.setGameMode('king-hunt') // 미구현 모드 — UI가 막지만 방어적으로도 무시된다

      expect(store.draftGameMode).toBe('normal')
    })

    it('reroll은 draftGameMode를 유지한다', () => {
      const store = useTeamAssignmentStore()
      store.startDraft(mixedFour(), 1, 'tail-chase', identityRandom)

      store.reroll(identityRandom)

      expect(store.draftGameMode).toBe('tail-chase')
    })

    it('confirm은 draftGameMode를 confirmAssignment에 전달한다', async () => {
      const store = useTeamAssignmentStore()
      store.startDraft(mixedFour(), 1, 'group', identityRandom)

      await store.confirm('AB2C')

      // 인자 순서: code, nextRound, gameMode, teams
      expect(confirmAssignmentMock.mock.calls[0]![2]).toBe('group')
    })

    it('reset 시 draftGameMode를 기본값으로 되돌린다', () => {
      const store = useTeamAssignmentStore()
      store.startDraft(mixedFour(), 1, 'kkomkkomi', identityRandom)
      expect(store.draftGameMode).toBe('kkomkkomi')

      store.reset()

      expect(store.draftGameMode).toBe(DEFAULT_GAME_MODE)
    })
  })

  describe('confirm', () => {
    it('성공 시 이월값을 재산출해 confirmAssignment를 호출하고 드래프트를 초기화한다', async () => {
      const store = useTeamAssignmentStore()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom)

      const ok = await store.confirm('AB2C')

      expect(ok).toBe(true)
      expect(confirmAssignmentMock).toHaveBeenCalledExactlyOnceWith('AB2C', 1, 'normal', [
        {
          armband: 'A',
          isXTeam: false,
          members: [
            { id: 'm1', nextStreak: 0, nextPartnerIds: ['f1'] },
            { id: 'f1', nextStreak: 0, nextPartnerIds: ['m1'] },
          ],
        },
        {
          armband: 'B',
          isXTeam: false,
          members: [
            { id: 'm2', nextStreak: 0, nextPartnerIds: ['f2'] },
            { id: 'f2', nextStreak: 0, nextPartnerIds: ['m2'] },
          ],
        },
      ])
      // 성공 시 드래프트 초기화
      expect(store.draftTeams).toHaveLength(0)
      expect(store.confirmError).toBeNull()
    })

    it('멤버가 없는 빈 팀은 확정 대상에서 제외한다', async () => {
      const store = useTeamAssignmentStore()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom)
      store.addTeam() // 빈 팀 C 추가

      await store.confirm('AB2C')

      const [, , , teams] = confirmAssignmentMock.mock.calls[0]!
      expect((teams as { armband: string }[]).map((team) => team.armband)).toEqual(['A', 'B'])
    })

    it('실패 시 confirmError를 세팅하고 드래프트를 보존하며 false를 반환한다', async () => {
      confirmAssignmentMock.mockRejectedValueOnce(new Error('permission denied'))
      const store = useTeamAssignmentStore()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom)

      const ok = await store.confirm('AB2C')

      expect(ok).toBe(false)
      expect(store.confirmError).not.toBeNull()
      expect(store.draftTeams).toHaveLength(2) // 드래프트 보존
      expect(store.isConfirming).toBe(false)
    })
  })

  describe('draftRound (QA N-02 회귀)', () => {
    it('startDraft 시점에 고정된 차수로 커밋한다 — 실시간 값을 따라가지 않는다', async () => {
      const store = useTeamAssignmentStore()
      // 보드를 여는 시점에 이번 차수를 4로 고정한다
      store.startDraft(mixedFour(), 4, 'normal', identityRandom)
      expect(store.draftRound).toBe(4)

      await store.confirm('AB2C')

      // confirm 경로엔 라운드 주입구가 없으므로 고정된 4로만 커밋된다
      expect(confirmAssignmentMock.mock.calls[0]![1]).toBe(4)
    })

    it('재배정(reroll)을 돌려도 draftRound는 고정값을 유지한다', async () => {
      const store = useTeamAssignmentStore()
      store.startDraft(mixedFour(), 4, 'normal', identityRandom)

      store.reroll(identityRandom)
      expect(store.draftRound).toBe(4) // 재배정은 같은 라운드의 재편성

      await store.confirm('AB2C')
      expect(confirmAssignmentMock.mock.calls[0]![1]).toBe(4)
    })
  })

  describe('canConfirm', () => {
    it('멤버가 있는 팀이 하나라도 있고 확정 중이 아니면 true다', () => {
      const store = useTeamAssignmentStore()
      expect(store.canConfirm).toBe(false)

      store.startDraft(mixedFour(), 1, 'normal', identityRandom)
      expect(store.canConfirm).toBe(true)
    })
  })
})
