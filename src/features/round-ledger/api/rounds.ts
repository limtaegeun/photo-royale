import {
  collection,
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  type DocumentData,
  type Timestamp,
  type Unsubscribe,
  type WriteBatch,
} from 'firebase/firestore'
import { db } from '@/shared/api/firebase'
import { isGameModeId, type GameModeId } from '@/features/game-mode'
import type { RoundSettlement } from '../scoring'
import type { ArmbandMap, RoundLedger, RoundResult, TeamTally } from '../types'

/** 라운드 원장 문서 참조 — 문서 ID는 차수 문자열(rules가 방 문서의 assignmentRound와 대조한다) */
export function roundLedgerDoc(code: string, roundNo: number) {
  return doc(db, 'rooms', code, 'rounds', String(roundNo))
}

/** 배정 확정이 넘기는 팀 1개 — 완장·X 겸직·팀원 uid만 있으면 된다(이월값은 원장에 안 남는다) */
export interface RoundSnapshotTeam {
  armband: string
  isXTeam: boolean
  memberIds: string[]
}

/**
 * 배정 확정 배치에 편성 스냅샷 create를 얹는다. 참가자 문서의 team은 배정마다 덮어써져
 * "라운드 N의 팀 A = [uid…]"가 어디에도 남지 않으므로, 점수를 팀원에게 귀속할 근거를 여기서
 * 굳힌다. 같은 배치여야 하는 이유: rules가 문서 ID·mode를 커밋 후 방 문서(getAfter)와
 * 대조하므로 스냅샷만 따로 쓰면 거부된다.
 */
export function addRoundSnapshotToBatch(
  batch: WriteBatch,
  code: string,
  roundNo: number,
  mode: GameModeId,
  teams: RoundSnapshotTeam[],
): void {
  const teamMembers: ArmbandMap<string[]> = {}
  const xTeams: string[] = []
  for (const team of teams) {
    teamMembers[team.armband] = [...team.memberIds]
    if (team.isXTeam) xTeams.push(team.armband)
  }
  batch.set(roundLedgerDoc(code, roundNo), {
    mode,
    teams: teamMembers,
    xTeams,
    confirmedAt: serverTimestamp(),
  })
}

/**
 * 판정 확정 배치에 집계 update를 얹는다 — 공격 완장의 kills(3배면 tripleKills)와 피격 완장의
 * hits를 1씩 올린다. dot-path increment라 문서에 tally/hits 맵이 아직 없어도 만들어지고,
 * 재판정·취소가 없으니 단조 증가로 충분하다. rules는 게임 중 현재 차수 문서의 이 두 키만
 * 허용한다. 문서가 없으면(원장 도입 전에 배정된 라운드) update가 배치 전체를 실패시키므로
 * 호출부가 존재 여부를 보고 얹는다.
 */
export function addTallyToBatch(
  batch: WriteBatch,
  code: string,
  roundNo: number,
  attackerTeam: string,
  targetTeam: string,
  multiplier: 1 | 3 = 1,
  kingTarget = false,
): void {
  const killField = multiplier === 3 ? 'tripleKills' : 'kills'
  batch.update(roundLedgerDoc(code, roundNo), {
    [`tally.${attackerTeam}.${killField}`]: increment(1),
    // 피격 팀이 X 겸직(왕)이면 왕 사냥 건수도 같이 올린다 — kills·tripleKills의 부분집합
    ...(kingTarget ? { [`tally.${attackerTeam}.kingKills`]: increment(1) } : {}),
    [`hits.${targetTeam}`]: increment(1),
  })
}

/**
 * 게임 종료 배치에 정산 결과 update를 얹는다. rules가 커밋 후 방 상태 waiting을 요구하므로
 * 종료(playing → waiting)와 같은 배치여야 하고, 같은 차수를 재시작해 다시 종료하면 덮어쓴다.
 */
export function addRoundResultToBatch(
  batch: WriteBatch,
  code: string,
  roundNo: number,
  settlement: RoundSettlement,
): void {
  batch.update(roundLedgerDoc(code, roundNo), {
    result: { ...settlement, finishedAt: serverTimestamp() },
  })
}

function toMillis(raw: unknown): number | null {
  const stamp = raw as Timestamp | null | undefined
  return typeof stamp?.toMillis === 'function' ? stamp.toMillis() : null
}

/** 완장 → 숫자 맵. 숫자가 아닌 값은 그 엔트리만 버린다 */
function toNumberMap(raw: unknown): Record<string, number> {
  if (raw === null || typeof raw !== 'object') return {}
  const map: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number') map[key] = value
  }
  return map
}

function toTally(raw: unknown): ArmbandMap<TeamTally> | null {
  if (raw === null || typeof raw !== 'object') return null
  const tally: ArmbandMap<TeamTally> = {}
  for (const [armband, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null || typeof value !== 'object') continue
    const entry = value as Record<string, unknown>
    tally[armband] = {
      kills: typeof entry.kills === 'number' ? entry.kills : 0,
      tripleKills: typeof entry.tripleKills === 'number' ? entry.tripleKills : 0,
      kingKills: typeof entry.kingKills === 'number' ? entry.kingKills : 0,
    }
  }
  return tally
}

function toResult(raw: unknown): RoundResult | null {
  if (raw === null || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  return {
    teamScores: toNumberMap(data.teamScores),
    playerScores: toNumberMap(data.playerScores),
    playerTiers: toNumberMap(data.playerTiers),
    playerPoints: toNumberMap(data.playerPoints),
    finishedAtMs: toMillis(data.finishedAt),
  }
}

/**
 * rounds 문서 데이터 → RoundLedger. 단건 구독과 컬렉션 구독이 같은 매핑을 쓴다.
 * 문서 ID가 차수가 아니거나 mode가 알 수 없는 값이면 null — 손상된 문서 하나가 순위 계산
 * 전체를 세우지 않도록 호출부가 건너뛴다.
 */
export function toRoundLedger(id: string, data: DocumentData): RoundLedger | null {
  const roundNo = Number(id)
  if (!Number.isInteger(roundNo) || roundNo < 1) return null
  if (typeof data.mode !== 'string' || !isGameModeId(data.mode)) return null
  const teams: ArmbandMap<string[]> = {}
  if (data.teams !== null && typeof data.teams === 'object') {
    for (const [armband, members] of Object.entries(data.teams as Record<string, unknown>)) {
      if (Array.isArray(members)) teams[armband] = members.filter((m) => typeof m === 'string')
    }
  }
  return {
    roundNo,
    mode: data.mode,
    teams,
    xTeams: Array.isArray(data.xTeams) ? data.xTeams.filter((x) => typeof x === 'string') : [],
    confirmedAtMs: toMillis(data.confirmedAt),
    tally: toTally(data.tally ?? null),
    hits: data.hits === undefined ? null : toNumberMap(data.hits),
    result: toResult(data.result ?? null),
  }
}

/**
 * 현재 차수 원장 단건 구독 — 판정·종료 배치가 이 문서에 쓰기를 얹을지(문서 존재 여부)와
 * 실시간 집계(tally)를 호스트 화면이 여기서 안다. 문서가 없으면 null.
 */
export function subscribeToRoundLedger(
  code: string,
  roundNo: number,
  onChange: (ledger: RoundLedger | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    roundLedgerDoc(code, roundNo),
    (snapshot) => {
      onChange(snapshot.exists() ? toRoundLedger(snapshot.id, snapshot.data()) : null)
    },
    onError,
  )
}

/**
 * 방의 원장 전체 구독 — 누적 순위는 이 목록의 result를 합산한 파생값이다(라운드 ≤ 8, 별도
 * 저장 없음). 문서 ID가 문자열이라 서버 정렬은 "10" < "2"가 되므로 차수 숫자로 여기서 정렬한다.
 */
export function subscribeToRoundLedgers(
  code: string,
  onChange: (ledgers: RoundLedger[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'rooms', code, 'rounds'),
    (snapshot) => {
      const ledgers = snapshot.docs
        .map((document) => toRoundLedger(document.id, document.data()))
        .filter((ledger): ledger is RoundLedger => ledger !== null)
        .sort((a, b) => a.roundNo - b.roundNo)
      onChange(ledgers)
    },
    onError,
  )
}
