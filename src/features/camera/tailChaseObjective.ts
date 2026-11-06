/**
 * 꼬리잡기 목표 카드(P17)의 사슬 파생 — 원장 한 장에서 "누가 나를 쫓고, 내가 누구를 잡는가"를 낸다.
 * 진행자 판정 카드의 대상 제한(TAIL_CHASE_TARGETING)과 같은 nextPreyOf를 써서, 콕핏이 보여 주는 잡을 팀과
 * 진행자가 인정하는 대상이 어긋나지 않는다.
 */
import { chaserOf, livesOf, nextPreyOf } from '@/features/game-mode'
import { teamOutStatus, type RoundLedger } from '@/features/round-ledger'

export interface TailChaseObjective {
  /** hunter = 완장을 지키고 있다, tail = 잡혀서 다른 팀 꼬리로 편입됐다(촬영 불가) */
  role: 'hunter' | 'tail'
  /** 사슬 가운데 팀 — hunter면 우리 팀, tail이면 합류한 팀 */
  team: string
  /** team을 쫓는 팀. 살아 있는 팀이 team뿐이면 null */
  chaser: string | null
  /** team이 잡을 팀. 살아 있는 팀이 team뿐이면 null */
  prey: string | null
  /** 잡을 팀의 남은 목숨 — 1인 팀이 한 번 잡혀 줄어든 때만 값이 있다. 그 외에는 null */
  preyLivesLeft: number | null
  /** 우리 팀이 끌고 있는 꼬리 인원 — tail이면 0(합류한 팀의 꼬리는 우리 것이 아니다) */
  tailCount: number
}

/**
 * 내 원장 상태 → 목표 카드 내용. 잡혔는데 합류한 팀을 찾을 수 없거나(편입 기록 이전 문서) 내 완장이 원장에
 * 없으면 null이다 — 사슬을 지어내지 않고 호출부가 일반 목표 문구로 돌아간다.
 * 내보내진 팀(참가자가 없는 빈 완장)은 사슬에서 뺀다 — 진행자 판정 카드에도 없어서 잡을 수 없는 팀이다.
 */
export function deriveTailChaseObjective(
  ledger: RoundLedger,
  myTeam: string,
  myUid: string,
): TailChaseObjective | null {
  if (!(myTeam in ledger.teams)) return null
  const outStatus = teamOutStatus(ledger)
  const teams = Object.keys(ledger.teams).filter(
    (armband) => (ledger.teams[armband]?.length ?? 0) > 0,
  )
  const context = {
    teams,
    outTeams: teams.filter((armband) => outStatus[armband] === true),
    xTeams: ledger.xTeams,
  }

  const isAbsorbed = outStatus[myTeam] === true
  const team = isAbsorbed ? absorbingTeamOf(ledger, myUid, context.teams, context.outTeams) : myTeam
  if (team === null) return null

  const prey = nextPreyOf(team, context)
  return {
    role: isAbsorbed ? 'tail' : 'hunter',
    team,
    chaser: chaserOf(team, context),
    prey,
    preyLivesLeft: prey === null ? null : livesLeftAfterHit(ledger, prey),
    tailCount: isAbsorbed ? 0 : (ledger.tails?.[team]?.length ?? 0),
  }
}

/**
 * 내가 편입돼 있는 살아 있는 팀 — 연쇄 편입이면 내 uid가 여러 꼬리에 남지만(앞서 잡은 팀도 이미 잡혔다)
 * 살아 있는 팀은 지금 나를 끌고 있는 팀뿐이다. 없으면 null.
 */
function absorbingTeamOf(
  ledger: RoundLedger,
  myUid: string,
  teams: string[],
  outTeams: string[],
): string | null {
  const host = teams
    .filter((armband) => !outTeams.includes(armband))
    .filter((armband) => ledger.tails?.[armband]?.includes(myUid) === true)
    .sort()[0]
  return host ?? null
}

/** 한 번 이상 잡혀서 줄어든 목숨 — 아직 안 잡혔으면 null(사슬에 색 이름을 그대로 둔다) */
function livesLeftAfterHit(ledger: RoundLedger, armband: string): number | null {
  const hits = ledger.hits?.[armband] ?? 0
  return hits === 0 ? null : livesOf(ledger.teams, armband) - hits
}
