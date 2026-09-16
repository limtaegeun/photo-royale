/**
 * 라운드 원장(P07) 타입 — `rooms/{code}/rounds/{차수}` 문서의 읽기 모델.
 *
 * 사진이 실린 submissions를 다시 열지 않고 점수·순위를 내기 위한 경량 문서다. 문서 ID는
 * 팀편성 차수(rooms.assignmentRound)의 문자열이고, 세 시점에 세 갈래로 쓴다 —
 * 배정 확정(편성 스냅샷) · 판정 확정(집계 increment) · 라운드 종료(정산 결과).
 * 기획: docs/plans/p07-round-scoring.md §5.
 *
 * 키 목록 상수는 firestore.rules의 rounds 갈래와 **같아야 한다** — rules는 클라 코드를
 * import할 수 없어 이중화되어 있고, round-ledger의 rules 동기화 가드 스펙이 대조한다.
 */
import type { GameModeId } from '@/features/game-mode'

/** 완장 문자(A~Z) → 값. 팀 단위 맵의 공통 형태 */
export type ArmbandMap<T> = Record<string, T>

/**
 * 공격 완장 1개의 판정 집계 — 3배(낙오 포착) 킬은 tripleKills에만 센다(M2).
 * kingKills는 그중 X 겸직 팀(왕)을 잡은 건수 — 왕잡기의 왕 사냥 근거(M4-3). 모드와 무관하게
 * 사실만 남기고, 읽는 쪽(왕잡기 규칙)만 쓴다. 도입 전 문서는 0으로 읽는다.
 */
export interface TeamTally {
  kills: number
  tripleKills: number
  kingKills: number
}

/** ① 배정 확정 시 — 편성 스냅샷. 이후 라운드가 끝나도 바뀌지 않는다 */
export interface RoundSnapshot {
  /** 팀편성 차수 = 문서 ID를 숫자로 */
  roundNo: number
  mode: GameModeId
  /** 완장 → 그 라운드의 팀원 uid 목록 */
  teams: ArmbandMap<string[]>
  /** X 겸직 완장 — 왕잡기에서 왕 팀(배율 근거) */
  xTeams: string[]
  /** serverTimestamp가 반영되기 전 스냅샷은 null */
  confirmedAtMs: number | null
}

/** ③ 라운드 종료 시 — 정산 결과. 등급·포인트 계산은 이 시점에 한 번만 한다 */
export interface RoundResult {
  /** 완장 → 라운드 원점수 */
  teamScores: ArmbandMap<number>
  /** uid → 개인 원점수(팀 원점수 동일 지급) */
  playerScores: Record<string, number>
  /** uid → 등급(1부터). 원점수 0 이하는 0 = 등급 없음 */
  playerTiers: Record<string, number>
  /** uid → 등급 포인트 — 최종 순위는 이 값의 합 */
  playerPoints: Record<string, number>
  /** serverTimestamp가 반영되기 전 스냅샷은 null */
  finishedAtMs: number | null
}

/** rounds 문서 전체 — tally·hits·result는 그 시점이 오기 전까지 null */
export interface RoundLedger extends RoundSnapshot {
  /** ② 공격 완장별 판정 집계. 판정이 한 건도 없으면 null */
  tally: ArmbandMap<TeamTally> | null
  /** ② 피격 완장별 집계 — 탈락 모델·왕 아웃 근거(M3) */
  hits: ArmbandMap<number> | null
  result: RoundResult | null
}

/** rules `rounds` create 갈래의 키 화이트리스트(hasAll·hasOnly 모두 이 목록) */
export const ROUND_SNAPSHOT_KEYS = ['mode', 'teams', 'xTeams', 'confirmedAt'] as const

/** rules `rounds` update 갈래 ②(판정 집계)가 허용하는 키 */
export const ROUND_TALLY_KEYS = ['tally', 'hits'] as const

/** rules `rounds` update 갈래 ③(정산 확정)의 result 키 화이트리스트 */
export const ROUND_RESULT_KEYS = [
  'teamScores',
  'playerScores',
  'playerTiers',
  'playerPoints',
  'finishedAt',
] as const
