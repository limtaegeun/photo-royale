import type { SubmissionRecord } from '@/features/round-ops'

/**
 * 탈락 알림(P22, docs/plans/p22-elimination-notice.md) — 우리 팀을 잡은 확정 킬샷으로 콕핏 안내 창의 내용을 정한다.
 * 진행자는 판정할 때 팀만 고르므로 팀원 중 누가 찍혔는지는 모른다. 그래서 안내는 팀 단위이고 사진으로 보여 준다.
 */
export interface EliminationNotice {
  /** 안내의 근거가 된 킬샷 — 확인 기록의 키 */
  submissionId: string
  /**
   * out: 이 피격으로 목숨이 다 닳았다. hit: 아직 목숨이 남았다(1인 팀의 첫 피격).
   * group-out: 우리 그룹 왕이 잡혀 그룹 전체가 아웃됐다(왕잡기, 노션 ② "그룹 전체가 즉시 아웃됩니다")
   */
  kind: 'out' | 'hit' | 'group-out'
  /** 잡은 팀 완장 — group-out이면 왕을 잡은 팀 */
  attackerTeam: string
  /** group-out일 때 잡힌 우리 그룹 왕의 완장. 그 밖에는 null */
  kingTeam: string | null
  /** 판정 사진(JPEG 데이터 URL) */
  photo: string
  /** 판정 시각 — 서버 시각 반영 전이면 null */
  judgedAtMs: number | null
  /** 낙오 포착 3배로 확정됐는가 */
  isTripleKill: boolean
  /** 이 피격 뒤 남은 목숨 */
  livesLeft: number
}

/**
 * 띄울 안내 — 가장 최근 피격이 아직 확인되지 않았을 때만. 끊겼다 돌아와 확인하지 않은 피격이 여럿이면
 * 지금 상태를 말하는 마지막 것 하나만 띄운다(확인하면 그 앞 피격도 함께 확인한 것으로 본다).
 *
 * @param hits 우리 팀을 잡은 확정 킬샷, 판정 순(subscribeToHitsOnTeam 순서)
 * @param lives 우리 팀 목숨(livesOf) — 2인 팀 1, 1인 팀 2
 * @param acknowledged 이미 확인한 킬샷 id
 */
export function deriveEliminationNotice(
  hits: SubmissionRecord[],
  lives: number,
  acknowledged: ReadonlySet<string>,
): EliminationNotice | null {
  const latest = hits[hits.length - 1]
  if (latest === undefined || acknowledged.has(latest.id)) return null
  const livesLeft = Math.max(0, lives - hits.length)
  return {
    submissionId: latest.id,
    kind: livesLeft === 0 ? 'out' : 'hit',
    attackerTeam: latest.team,
    kingTeam: null,
    photo: latest.photo,
    judgedAtMs: latest.judgedAtMs,
    isTripleKill: latest.multiplier === 3,
    livesLeft,
  }
}

/**
 * 그룹 탈락 안내(왕잡기) — 우리 그룹 왕이 목숨을 다 쓴 킬샷이 아직 확인되지 않았을 때만. 왕이 잡힌 킬샷(목숨 수만큼째
 * 피격)의 사진·잡은 팀을 보인다. 아직 왕이 살아 있으면 null.
 *
 * @param kingHits 우리 그룹 왕 팀을 잡은 확정 킬샷, 판정 순
 * @param kingLives 왕 팀 목숨(livesOf)
 * @param kingTeam 왕 팀 완장
 */
export function deriveGroupOutNotice(
  kingHits: SubmissionRecord[],
  kingLives: number,
  kingTeam: string,
  acknowledged: ReadonlySet<string>,
): EliminationNotice | null {
  const fatal = kingHits[kingLives - 1]
  if (fatal === undefined || acknowledged.has(fatal.id)) return null
  return {
    submissionId: fatal.id,
    kind: 'group-out',
    attackerTeam: fatal.team,
    kingTeam,
    photo: fatal.photo,
    judgedAtMs: fatal.judgedAtMs,
    isTripleKill: false,
    livesLeft: 0,
  }
}

/** 우리 팀을 탈락시킨 팀 — 목숨 수만큼째 피격의 제출 팀. 아직 탈락 전이면 null */
export function eliminatedByTeam(hits: SubmissionRecord[], lives: number): string | null {
  return hits[lives - 1]?.team ?? null
}
