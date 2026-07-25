// 외부에 공개하는 것만 re-export한다. 팀 배정은 순수 함수 + 타입 + 호스트 드래프트 스토어를 노출한다.
export { assignTeams, deriveCarryover, MIN_TEAM_CANDIDATES } from './teamAssignment'
export type { TeamCandidate, AssignedTeam, TeamAssignmentResult } from './teamAssignment'
export {
  TEAM_GROUP_ORDER,
  ARMBAND_LABELS,
  SPECIAL_ARMBAND,
  GROUP_LABELS,
  MAX_ASSIGNABLE_MEMBERS,
  armbandForTeamIndex,
  groupForArmband,
} from './armbands'
export type { TeamGroup } from './armbands'
// 완장 → 그룹 색 유틸리티 클래스 매핑의 단일 소스 — 그룹 색을 쓰는 모든 화면이 여기서 가져간다
export {
  displayGroup,
  groupBorderClass,
  groupLabelEn,
  groupLabelKo,
  groupSolidBgClass,
  groupSolidBorderClass,
  groupTextClass,
} from './armbandStyles'
export { pickXTeams } from './xRole'
export { confirmAssignment } from './api/assignment'
export type { ConfirmedMemberWrite, ConfirmedTeamWrite } from './api/assignment'
// WaitingRoomPage가 다음 단계에서 호스트 보드 드래프트를 바로 쓸 수 있게 스토어·타입을 노출한다
export { useTeamAssignmentStore } from './stores/useTeamAssignmentStore'
export type { DraftMember, DraftTeam } from './stores/useTeamAssignmentStore'
// 대기실이 렌더하는 팀 배정 화면 — 다른 기능은 반드시 이 public API로만 가져간다
export { default as AssignmentBoard } from './components/AssignmentBoard.vue'
export { default as RoundAssignmentCard } from './components/RoundAssignmentCard.vue'
