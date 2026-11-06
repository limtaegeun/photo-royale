import { GROUP_LABELS, TEAM_GROUP_ORDER, type TeamGroup } from '@/features/game-mode'
import { displayGroup, groupTextClass } from '@/features/team-assignment'
import { isAssignedInRound, type Participant } from '@/features/waiting-room'

/**
 * 판정 카드(JudgeCard)·스태프 아웃 시트(StaffOutSheet)가 공유하는 "이번 라운드 팀 목록" 계산.
 * 고를 수 있는지와 줄에 붙는 표시는 각 호출부가 이 결과를 걸러서 얹는다.
 */

export interface TeamSectionTeam {
  armband: string
  /** 팀원 이름 나열 — 완장만으로는 현장에서 누구인지 떠올리기 어렵다 */
  memberNames: string
  /** 같은 이름의 배열 — 판정 카드의 타일은 이름을 줄마다 쌓는다 */
  members: string[]
  /** Rules가 이 참가자 문서로 현재 라운드의 실제 팀인지 검증한다 */
  participantUid: string
}

export interface TeamSection {
  group: TeamGroup
  label: string
  /** 그룹 제목 색 — 첫 팀 완장에서 파생(섹션은 팀이 있을 때만 존재한다) */
  textClass: string
  teams: TeamSectionTeam[]
}

/** 이번 라운드 배정 팀을 그룹 색 순서(파랑→주황→초록→빨강)로 섹션화한다 */
export function groupTeamSections(
  participants: Participant[],
  assignmentRound: number,
): TeamSection[] {
  const membersByTeam = new Map<string, { names: string[]; participantUid: string }>()
  for (const participant of participants) {
    if (!isAssignedInRound(participant, assignmentRound) || participant.team === null) {
      continue
    }
    const members = membersByTeam.get(participant.team) ?? {
      names: [],
      participantUid: participant.id,
    }
    members.names.push(participant.name)
    membersByTeam.set(participant.team, members)
  }

  return TEAM_GROUP_ORDER.map((group) => {
    const teams = [...membersByTeam.entries()]
      .filter(([armband]) => displayGroup(armband) === group)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([armband, members]) => ({
        armband,
        memberNames: members.names.join(' · '),
        members: members.names,
        participantUid: members.participantUid,
      }))
    const firstTeam = teams[0]
    return {
      group,
      label: GROUP_LABELS[group].ko,
      textClass: firstTeam === undefined ? '' : groupTextClass(firstTeam.armband),
      teams,
    }
  }).filter((section) => section.teams.length > 0)
}

/** 드럼 다이얼 한 줄 — 팀에 붙는 표시(왕, X, 1인 팀 목숨)까지 호출부가 얹어 넘긴다 */
export interface DialTeam extends TeamSectionTeam {
  mark: string | null
}

/**
 * 이번 라운드 팀을 알파벳 순서로 편다 — 다이얼은 색이 아니라 완장 글자로 찾으므로 그룹 섹션 순서(파랑 A·E,
 * 주황 B·F…)대로 깔면 글자가 뒤섞인다.
 */
export function alphabeticalTeams(
  participants: Participant[],
  assignmentRound: number,
): TeamSectionTeam[] {
  return groupTeamSections(participants, assignmentRound)
    .flatMap((section) => section.teams)
    .sort((a, b) => a.armband.localeCompare(b.armband))
}
