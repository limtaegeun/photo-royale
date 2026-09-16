// 게임 모드 기능 public API — 모드 레지스트리(정의·규칙서 데이터)와 규칙서 렌더러만 노출한다.
// 데이터 계층(waiting-room rooms)·배정 UI(team-assignment)가 함께 소비한다.
export { DEFAULT_GAME_MODE, GAME_MODE_IDS, GAME_MODES, isGameModeId } from './registry'
export type {
  GameModeId,
  GameModeDefinition,
  GameModeRuleEntry,
  ModeScoring,
  ModeScoringInput,
  ModeScoringOutput,
} from './types'
// 원점수 재료 — round-ledger의 정산 단계와 모드 스펙이 함께 쓴다
export {
  KILL_POINTS,
  SURVIVAL_POINTS,
  TRIPLE_KILL_POINTS,
  distributeToPlayers,
  isTeamOut,
  killScoreOf,
  killScoring,
  livesOf,
  normalScoring,
  survivalScoreOf,
} from './scoring'
export { default as GameModeRulebook } from './components/GameModeRulebook.vue'
// 모드 선택 UI도 이 기능이 소유한다 — 호출부(배정 보드)는 선택 결과만 받는다
export { default as GameModePicker } from './components/GameModePicker.vue'
