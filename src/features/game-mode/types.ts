/**
 * 게임 모드 타입 — 기획서 규칙서 v1.0 3장 기반.
 *
 * 어몽어스식 "[1] 모드 선택 → [2] 세부 모듈(X 등)" 구조에서 [1]에 해당한다. 모드가 8종이고
 * 모드마다 참가자에게 보여줄 규칙서가 다르므로, 모드 1개 = modes/ 파일 1개로 각자 규칙서를
 * 소유한다. 배정 알고리즘 자체는 모드 공통이며(모드별 편성 차이는 후속 작업 — 필요해지면
 * GameModeDefinition에 필드를 추가해 확장한다), X는 모드가 아니라 독립 모듈 축이다
 * (기존 isXTeam 토글 유지) — 그래서 모드 목록에 X는 없다.
 */

/** 8종 모드 식별자 — Firestore rooms.gameMode에 그대로 저장된다 */
export type GameModeId =
  | 'normal'
  | 'tail-chase'
  | 'group'
  | 'king-hunt'
  | 'staff-chase'
  | 'bomb-plant'
  | 'kkomkkomi'
  | 'fast-survival'

/** 규칙서 한 항목 — 정적 텍스트 또는 라운드 컨텍스트가 필요한 동적 항목 */
export type GameModeRuleEntry =
  | { kind: 'composition' } // 팀 구성 규칙 — 2인 1조/1인 팀 variant는 렌더러가 배정 컨텍스트로 채운다
  | { kind: 'group' } // 그룹 규칙 — "그룹은 완장 색깔" + 이번 라운드 그룹 색 문구
  | { kind: 'static'; text: string; caption?: string }

export interface GameModeDefinition {
  id: GameModeId
  /** 규칙서 배지·모드 선택 리스트에 쓰는 한글 라벨 */
  label: string
  /** 모드 선택 리스트의 한 줄 설명 */
  description: string
  /** 규칙서 — 배열 순서대로 번호를 매겨 렌더한다 */
  rules: GameModeRuleEntry[]
  /** 게임플레이가 구현되어 선택 가능한 모드인지 — 미구현 모드는 선택 시트에서 비활성화된다 */
  available: boolean
}
