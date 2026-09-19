import { GROUP_LABELS, TEAM_GROUP_ORDER, type TeamGroup } from '@/features/game-mode'
import { displayGroup, groupTextClass } from '@/features/team-assignment'
import { isAssignedInRound, type Participant } from '@/features/waiting-room'

/**
 * 판정 시트(JudgeSheet)·스태프 아웃 시트(StaffOutSheet)가 공유하는 "이번 라운드 팀을 그룹 색
 * 순서로 섹션화한 목록" 계산 — 두 시트가 같은 그룹 섹션 구조를 문자 그대로 중복 구현하고
 * 있었다. 선택 가능 여부·배지 같은 시트별 규칙은 각 호출부가 이 결과를 감싸서 얹는다
 * (TeamPickList의 TeamPickOption/TeamPickSection 참고).
 */

export interface TeamSectionTeam {
  armband: string
  /** 팀원 이름 나열 — 완장만으로는 현장에서 누구인지 떠올리기 어렵다 */
  memberNames: string
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

/** 이번 라운드 배정 팀을 그룹 색 순서(파랑→주황→초록→빨강)로 섹션화한다 — 판정 시트·스태프 아웃 시트가 같은 목록을 쓴다 */
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

/** TeamPickList 옵션 배지 톤 — BaseBadge tone 중 이 목록이 실제로 쓰는 값만 좁힌다 */
export interface TeamPickOption extends TeamSectionTeam {
  /** 선택 불가(제출 팀·탈락·모드 제한 등) — 호출부가 이유를 정한다 */
  disabled: boolean
  /** 오른쪽 배지 — 없으면 생략 */
  badge?: { text: string; tone: 'neutral' | 'danger'; appearance?: 'fill' | 'outline' }
  /** 배지 앞 보조 캡션(예: '1인 팀 · 목숨 2') */
  caption?: string
}

export interface TeamPickSection extends Omit<TeamSection, 'teams'> {
  teams: TeamPickOption[]
}
