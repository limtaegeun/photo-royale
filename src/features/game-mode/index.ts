// 게임 모드 기능 public API — 모드 레지스트리(정의·규칙 설명서 데이터)와 규칙 설명서 렌더러만 노출한다.
// 데이터 계층(waiting-room rooms)·배정 UI(team-assignment)가 함께 소비한다.
export { DEFAULT_GAME_MODE, GAME_MODE_IDS, GAME_MODES, isGameModeId } from './registry'
// 완장 → 그룹 색 규칙 — 배정 보드·판정 카드·모드 원점수 규칙이 함께 쓴다
export {
  GROUP_LABELS,
  SPECIAL_ARMBAND,
  TEAM_GROUP_ORDER,
  groupForArmband,
  isSameGroup,
} from './armbandGroups'
export type { TeamGroup } from './armbandGroups'
export type {
  GameModeId,
  GameModeDefinition,
  GameModeRuleCard,
  RuleCardIcon,
  JudgeContext,
  JudgeGuide,
  JudgeOutcome,
  ModeScoring,
  ModeScoringInput,
  ModeScoringOutput,
  TargetContext,
  TargetRule,
  XModulePolicy,
} from './types'
// 원점수 재료 — round-ledger의 정산 단계와 모드 스펙이 함께 쓴다
export {
  ALL_ALLIES_TARGETING,
  ALLY_GROUP_TARGETING,
  TAIL_CHASE_TARGETING,
  X_ONLY_TARGETING,
  chaserOf,
  nextPreyOf,
} from './targeting'
export {
  KILL_POINTS,
  KING_HUNT_POINTS,
  KING_HUNT_TEAM_POINTS,
  SOLO_TEAM_SCALE,
  STAFF_CHASE_FULL_SURVIVAL_POINTS,
  SURVIVAL_POINTS,
  TRIPLE_KILL_POINTS,
  absorbKillEffect,
  applyTeamScale,
  distributeToPlayers,
  groupKillScoreOf,
  groupScoring,
  isKingDownInGroup,
  isTeamOut,
  killCountOf,
  kingHuntScoring,
  kingHuntsOf,
  killScoreOf,
  killScoring,
  livesOf,
  normalScoring,
  staffChaseHeadcount,
  staffChaseScoring,
  survivalScoreOf,
  tailChaseScoring,
  teamScaleOf,
} from './scoring'
export type { AbsorbKillEffect } from './scoring'
// 모드별 탈락 판정 — 비밀 왕 모드(왕잡기)는 왕이 잡히면 같은 그룹 전원이 아웃이다
export { isTeamEliminated } from './elimination'
// 규칙 설명서 화면(노션 ②) — 배정 카드 아래에 붙는다. 기본 규칙·금지 문구는 rulesGuide.ts가 소유한다
export { default as GameRulesGuide } from './components/GameRulesGuide.vue'
// 모드 선택 UI도 이 기능이 소유한다 — 호출부(배정 보드)는 선택 결과만 받는다
export { default as GameModePicker } from './components/GameModePicker.vue'
