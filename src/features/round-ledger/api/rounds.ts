import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  type DocumentData,
  type Timestamp,
  type Unsubscribe,
  type WriteBatch,
} from 'firebase/firestore'
import { db } from '@/shared/api/firebase'
import { isGameModeId, type GameModeId } from '@/features/game-mode'
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
