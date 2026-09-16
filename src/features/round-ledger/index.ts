// 라운드 원장 기능 public API — rounds 문서 형태·rules 대조용 키 목록과 문서 쓰기·구독을
// 노출한다. 배정 확정(team-assignment)이 스냅샷을 쓰고, 라운드 운영(round-ops)이 집계·정산을
// 얹으며, 대기실(waiting-room)이 순위를 읽는다. 정산 계산기(scoring)는 후속 항목에서 더한다.
export {
  addRoundSnapshotToBatch,
  roundLedgerDoc,
  subscribeToRoundLedger,
  subscribeToRoundLedgers,
  toRoundLedger,
} from './api/rounds'
export type { RoundSnapshotTeam } from './api/rounds'
export { ROUND_RESULT_KEYS, ROUND_SNAPSHOT_KEYS, ROUND_TALLY_KEYS } from './types'
export type { ArmbandMap, RoundLedger, RoundResult, RoundSnapshot, TeamTally } from './types'
