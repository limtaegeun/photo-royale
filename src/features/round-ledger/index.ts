// 라운드 원장 기능 public API — rounds 문서 형태·rules 대조용 키 목록, 문서 쓰기·구독,
// 정산 계산기를 노출한다. 배정 확정(team-assignment)이 스냅샷을 쓰고, 라운드 운영(round-ops)이
// 집계·정산을 얹으며, 대기실(waiting-room)이 순위를 읽는다.
export {
  addRoundResultToBatch,
  addRoundSnapshotToBatch,
  addTallyToBatch,
  recordStaffOut,
  roundLedgerDoc,
  subscribeToRoundLedger,
  subscribeToRoundLedgers,
  toRoundLedger,
} from './api/rounds'
export type { RoundSnapshotTeam } from './api/rounds'
export {
  TIER_POINTS,
  TIER_FLOOR_POINTS,
  ZERO_SCORE_POINTS,
  aliveTeamCount,
  computeStandings,
  groupByTier,
  pointsForTier,
  rankTiers,
  settleRound,
  teamOutStatus,
  tierLabel,
} from './scoring'
export type { RoundSettlement, Standing, TierGroup } from './scoring'
export { ROUND_RESULT_KEYS, ROUND_SNAPSHOT_KEYS, ROUND_TALLY_KEYS } from './types'
export type { ArmbandMap, RoundLedger, RoundResult, RoundSnapshot, TeamTally } from './types'
