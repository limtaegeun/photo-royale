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

/**
 * 정산 입력(P07) — 라운드 원장(round-ledger)이 자기 문서를 이 형태로 넘긴다. 모드 파일이 원장
 * 타입을 몰라도 되게 여기서 정의한다(round-ledger → game-mode 한 방향 의존).
 */
export interface ModeScoringInput {
  /** 완장 → 그 라운드 팀원 uid (편성 스냅샷) */
  teams: Record<string, string[]>
  /** X 겸직 완장 — 왕잡기의 왕 팀 */
  xTeams: string[]
  /**
   * 공격 완장별 판정 집계. 판정이 없던 완장은 키 자체가 없다.
   * kingKills = kills·tripleKills 중 X 겸직 팀(왕)을 잡은 건수 — 왕잡기의 왕 사냥 근거(M4-3 이전 문서엔 없다)
   */
  tally: Record<string, { kills: number; tripleKills: number; kingKills?: number }>
  /** 피격 완장별 집계 */
  hits: Record<string, number>
}

/** 정산 출력 — 라운드 안 원점수. 등급·포인트 변환은 round-ledger의 공통 단계가 맡는다 */
export interface ModeScoringOutput {
  /** 완장 → 팀 원점수 */
  teamScores: Record<string, number>
  /** uid → 개인 원점수. 스냅샷에 없는 uid는 넣지 않는다(= 그 라운드 미참가) */
  playerScores: Record<string, number>
}

export type ModeScoring = (input: ModeScoringInput) => ModeScoringOutput

/**
 * 판정 시트의 대상 제한(P07 §11 "누구를 잡을 수 있나") — 모드가 잡을 수 없는 팀을 정하면
 * 시트가 그 팀을 비활성화하고 이유 배지를 붙인다. 점수 계산은 이 제한과 무관하게 판정 결과를 신뢰한다.
 */
export interface TargetRule {
  /** 제출 팀(attacker)이 이 팀(target)을 잡을 수 있는가 — 둘 다 이번 라운드 팀 완장 */
  canTarget: (attacker: string, target: string) => boolean
  /** 막힌 팀 옆에 붙는 짧은 이유(예: '같은 그룹') */
  blockedBadge: string
}

export interface GameModeDefinition {
  id: GameModeId
  /** 규칙서 배지·모드 선택 리스트에 쓰는 한글 라벨 */
  label: string
  /** 모드 선택 리스트의 한 줄 설명 */
  description: string
  /** 규칙서 — 배열 순서대로 번호를 매겨 렌더한다 */
  rules: GameModeRuleEntry[]
  /**
   * 라운드 원점수 규칙(P07 §4) — 모드 1개 = 파일 1개 원칙대로 각 모드가 소유한다.
   * 아직 자기 규칙이 없는 모드는 기본 킬 규칙(scoring.ts killScoring)을 둔다.
   */
  scoring: ModeScoring
  /** 판정 시트의 대상 제한 — 없으면 제출 팀·탈락 팀 외 모든 팀을 잡을 수 있다 */
  targeting?: TargetRule
  /** 배정 보드에서 특수 완장 X 모듈을 강제로 켜는 모드(왕잡기 — 그룹마다 왕이 있어야 한다) */
  requiresXModule?: boolean
  /** 게임플레이가 구현되어 선택 가능한 모드인지 — 미구현 모드는 선택 시트에서 비활성화된다 */
  available: boolean
}
