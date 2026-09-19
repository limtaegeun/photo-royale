import { describe, expect, it } from 'vitest'
import { groupTextClass } from '@/features/team-assignment'
import type { Participant } from '@/features/waiting-room'
import { groupTeamSections } from '../teamSections'

/** 그룹 섹션화 테스트용 최소 참가자 픽스처 — assignedRound 기본값은 테스트 기준 라운드(2)와 맞춘다 */
function participant(id: string, team: string | null, assignedRound = 2): Participant {
  return {
    id,
    name: `이름-${id}`,
    team,
    assignedRound,
    gender: null,
    isXTeam: false,
    sameGenderStreak: 0,
    previousPartnerIds: [],
    isReady: true,
  }
}

describe('groupTeamSections', () => {
  it('그룹을 파랑→주황→초록→빨강 순서로 나열한다', () => {
    const sections = groupTeamSections(
      [participant('u1', 'D'), participant('u2', 'A'), participant('u3', 'B'), participant('u4', 'C')],
      2,
    )

    expect(sections.map((section) => section.group)).toEqual(['blue', 'orange', 'green', 'red'])
    expect(sections.map((section) => section.label)).toEqual(['파랑', '주황', '초록', '빨강'])
  })

  it('그룹 안에서는 완장을 알파벳 순으로 정렬한다', () => {
    const sections = groupTeamSections(
      [participant('u1', 'E'), participant('u2', 'A'), participant('u3', 'I')],
      2,
    )

    const blueSection = sections.find((section) => section.group === 'blue')!
    expect(blueSection.teams.map((team) => team.armband)).toEqual(['A', 'E', 'I'])
  })

  it('같은 팀 참가자 이름을 " · "로 잇고, participantUid는 첫 멤버로 정한다', () => {
    const sections = groupTeamSections([participant('u1', 'A'), participant('u2', 'A')], 2)

    const teamA = sections[0]!.teams[0]!
    expect(teamA.memberNames).toBe('이름-u1 · 이름-u2')
    expect(teamA.participantUid).toBe('u1')
  })

  it('섹션 제목 색은 그 그룹 첫 팀의 완장에서 가져온다', () => {
    const sections = groupTeamSections([participant('u1', 'B')], 2)

    expect(sections[0]!.textClass).toBe(groupTextClass('B'))
  })

  it('이번 라운드에 배정되지 않은 참가자는 뺀다', () => {
    const sections = groupTeamSections(
      [participant('u1', 'A', 1), participant('u2', 'B', 2)],
      2,
    )

    const armbands = sections.flatMap((section) => section.teams.map((team) => team.armband))
    expect(armbands).toEqual(['B'])
  })

  it('완장이 없는(team=null) 참가자는 뺀다', () => {
    const sections = groupTeamSections([participant('u1', null), participant('u2', 'B')], 2)

    const armbands = sections.flatMap((section) => section.teams.map((team) => team.armband))
    expect(armbands).toEqual(['B'])
  })

  it('팀이 없는 그룹은 섹션 자체를 만들지 않는다', () => {
    const sections = groupTeamSections([participant('u1', 'A')], 2)

    expect(sections).toHaveLength(1)
    expect(sections[0]!.group).toBe('blue')
  })
})
