// 게임 모드 기능 public API — 모드 레지스트리(정의·규칙서 데이터)와 규칙서 렌더러만 노출한다.
// 데이터 계층(waiting-room rooms)·배정 UI(team-assignment)가 함께 소비한다.
export { DEFAULT_GAME_MODE, GAME_MODE_IDS, GAME_MODES, isGameModeId } from './registry'
export type { GameModeId, GameModeDefinition, GameModeRuleEntry } from './types'
export { default as GameModeRulebook } from './components/GameModeRulebook.vue'
