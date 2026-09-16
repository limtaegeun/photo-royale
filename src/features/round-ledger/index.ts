// 라운드 원장 기능 public API — rounds 문서 형태와 rules 대조용 키 목록만 노출한다(M1-A).
// 문서 쓰기·구독(api)과 정산 계산기(scoring)는 후속 항목에서 여기에 더한다.
export { ROUND_RESULT_KEYS, ROUND_SNAPSHOT_KEYS, ROUND_TALLY_KEYS } from './types'
export type { ArmbandMap, RoundLedger, RoundResult, RoundSnapshot, TeamTally } from './types'
