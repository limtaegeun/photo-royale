/**
 * 정산 계산기(P07) — 라운드 원장에서 원점수와 라운드 안 순위를 내고, 원장 목록에서 누적 순위를 낸다.
 * 전부 순수 함수다(쓰기는 api/rounds.ts, 화면은 각 feature).
 *
 * 최종 순위는 라운드 원점수를 그대로 더한다 — 노션 ② 기본 규칙 5 "세 판 점수를 더해 우승자를 정해요".
 * 예전의 등급 포인트(라운드마다 등급을 매겨 10·7·5·3·2·1P로 바꿔 더하기, p07-round-scoring §3.1 결정 1)는 쓰지 않는다.
 * 원점수 규칙은 모드가 소유한다(GameModeDefinition.scoring — 모드 1개 = 파일 1개). 여기는 모드와 무관한 순위
 * 단계와 누적 순위만 맡는다.
 */
import { GAME_MODES, isTeamEliminated } from '@/features/game-mode'
import type { RoundLedger, RoundResult } from './types'

/**
 * 탈락 모델(P07 M3) — 원장 문서 기준 팀별 아웃 여부. 콕핏·판정 카드·운영 화면이 같은 함수를 쓴다.
 * 왕잡기는 왕이 잡힌 그룹 전원도 아웃이다(game-mode isTeamEliminated).
 * 원장이 없는 라운드는 호출부가 null을 들고 있으므로 여기 오지 않는다.
 */
export function teamOutStatus(ledger: RoundLedger): Record<string, boolean> {
  const input = { teams: ledger.teams, hits: ledger.hits ?? {}, xTeams: ledger.xTeams }
  const status: Record<string, boolean> = {}
  for (const armband of Object.keys(ledger.teams)) {
    status[armband] = isTeamEliminated(ledger.mode, input, armband)
  }
  return status
}

/** 아웃 아닌 팀 수 — 콕핏의 "생존 N / M팀" */
export function aliveTeamCount(ledger: RoundLedger): number {
  return Object.values(teamOutStatus(ledger)).filter((out) => !out).length
}

/** 종료 시 원장에 쓰는 정산 — RoundResult에서 서버 시각만 뺀 것 */
export type RoundSettlement = Omit<RoundResult, 'finishedAtMs'>

/**
 * 개인 원점수 → 라운드 안 순위. 같은 점수는 같은 순위이고 다음 순위는 바로 이어진다(1-2-2-3) — 정산 미리보기가
 * 점수 높은 묶음부터 보이는 데 쓴다. 최종 순위에는 쓰지 않는다(최종 순위는 원점수 합).
 */
export function rankByScore(playerScores: Record<string, number>): Record<string, number> {
  const distinct = [...new Set(Object.values(playerScores))].sort((a, b) => b - a)
  const rankByValue = new Map(distinct.map((score, index) => [score, index + 1]))
  const ranks: Record<string, number> = {}
  for (const [uid, score] of Object.entries(playerScores)) ranks[uid] = rankByValue.get(score) ?? 0
  return ranks
}

/**
 * 라운드 정산 — 원장의 모드가 가진 원점수 규칙으로 팀·개인 원점수를 낸다. 개인 귀속(동일 지급·스냅샷 밖 uid 제외·
 * 편입자의 킬 크레딧)은 모드 규칙의 몫이라 여기서 다시 손대지 않는다.
 *
 * 원장 result의 키(playerTiers·playerPoints)는 firestore.rules가 그대로 요구해서 남긴다 — playerTiers는 라운드 안
 * 순위, playerPoints는 이 라운드가 최종 순위에 더하는 값(= 원점수)이다.
 */
export function settleRound(ledger: RoundLedger): RoundSettlement {
  const { teamScores, playerScores } = GAME_MODES[ledger.mode].scoring({
    teams: ledger.teams,
    xTeams: ledger.xTeams,
    tally: ledger.tally ?? {},
    hits: ledger.hits ?? {},
    // 꼬리잡기(편입)·왕잡기(왕을 찍은 사람)만 쓰는 키 — 없으면(null) 넘기지 않아 모드 규칙이 팀 킬 수로 정산한다
    credits: ledger.credits ?? undefined,
    tails: ledger.tails ?? undefined,
  })
  return {
    teamScores,
    playerScores,
    playerTiers: rankByScore(playerScores),
    playerPoints: { ...playerScores },
  }
}

/** 정산을 점수별로 묶은 한 줄 — 종료 미리보기가 "40점 — 누구누구"로 읽는다 */
export interface ScoreGroup {
  /** 이 묶음의 원점수 */
  score: number
  /** uid 오름차순 */
  uids: string[]
}

/** 정산 결과를 원점수 내림차순으로 묶는다 */
export function groupByScore(settlement: RoundSettlement): ScoreGroup[] {
  const byScore = new Map<number, string[]>()
  for (const [uid, score] of Object.entries(settlement.playerScores)) {
    const group = byScore.get(score) ?? []
    group.push(uid)
    byScore.set(score, group)
  }
  return [...byScore.entries()]
    .sort(([a], [b]) => b - a)
    .map(([score, uids]) => ({ score, uids: uids.sort((a, b) => a.localeCompare(b)) }))
}

/** 누적 순위 한 줄 — 화면은 uid를 참가자 명단과 조인해 이름을 붙인다 */
export interface Standing {
  uid: string
  /** 최종 순위. 점수 합이 같으면 같은 순위, 다음은 인원수만큼 건너뜀 */
  rank: number
  /** 라운드 원점수 합 — 최종 순위의 기준(노션 ② "세 판 점수를 더해 우승자를 정해요") */
  score: number
  /** 라운드별 내역(차수 오름차순). 그 라운드에 없었으면 항목이 없다 */
  rounds: Array<{ roundNo: number; score: number }>
}

/**
 * 누적 순위 — 정산이 끝난(result 있는) 라운드의 원점수를 uid별로 더한다. 별도 저장 없는 파생값이라 정정(재종료)이
 * 있어도 어긋날 사본이 없다. 점수 합이 같으면 공동 순위다. 등급 포인트 시절에 정산한 원장도 원점수(playerScores)는
 * 그대로 있어서 같은 방식으로 더해진다.
 */
export function computeStandings(ledgers: RoundLedger[]): Standing[] {
  const byUid = new Map<string, Standing>()
  for (const ledger of [...ledgers].sort((a, b) => a.roundNo - b.roundNo)) {
    const result = ledger.result
    if (result === null) continue
    for (const [uid, score] of Object.entries(result.playerScores)) {
      const standing = byUid.get(uid) ?? { uid, rank: 0, score: 0, rounds: [] }
      standing.score += score
      standing.rounds.push({ roundNo: ledger.roundNo, score })
      byUid.set(uid, standing)
    }
  }

  const standings = [...byUid.values()].sort((a, b) => b.score - a.score || a.uid.localeCompare(b.uid))
  standings.forEach((standing, index) => {
    const previous = standings[index - 1]
    standing.rank = previous !== undefined && previous.score === standing.score ? previous.rank : index + 1
  })
  return standings
}

/** 라운드별 내역 한 줄 — "1R 40점 · 2R 10점". 대기실 순위 시트와 콕핏 내 기록이 같은 문구를 쓴다 */
export function formatRoundScores(rounds: Standing['rounds']): string {
  return rounds.map((entry) => `${entry.roundNo}R ${entry.score}점`).join(' · ')
}
