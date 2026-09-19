import { isSameGroup } from './armbandGroups'
import type { TargetContext, TargetRule } from './types'

/**
 * 같은 색 그룹은 동맹이라 잡을 수 없다 — 그룹전·왕잡기가 공유하는 대상 제한.
 * 판정 시트가 제출 팀과 같은 그룹을 비활성화하고 배지로 이유를 보인다(클라이언트만, rules는 막지 않는다).
 */
export const ALLY_GROUP_TARGETING: TargetRule = {
  canTarget: (attacker, target) => !isSameGroup(attacker, target),
  blockedBadge: '같은 그룹',
}

/**
 * 꼬리잡기의 사냥 대상(P07 §4.2) — 알파벳 순으로 바로 다음 살아 있는 완장 하나. 마지막 완장은 첫 완장으로
 * 감긴다("Z는 A를"). 잡힌 팀은 잡은 팀의 꼬리로 편입되므로 그 팀의 먹이가 다음 대상이 된다 — 탈락 팀을
 * 건너뛰면 그 체인이 그대로 된다. 잡을 팀이 없으면 null.
 */
export function nextPreyOf(attacker: string, context: TargetContext): string | null {
  const alive = context.teams
    .filter((armband) => armband !== attacker && !context.outTeams.includes(armband))
    .sort()
  if (alive.length === 0) return null
  return alive.find((armband) => armband > attacker) ?? alive[0]!
}

/** 바로 다음 알파벳(살아 있는 팀 기준)만 잡을 수 있다 — 꼬리잡기의 대상 제한 */
export const TAIL_CHASE_TARGETING: TargetRule = {
  canTarget: (attacker, target, context) => nextPreyOf(attacker, context) === target,
  blockedBadge: '다음 알파벳 아님',
}

/** 스태프 추격전 — 참가자 전원이 동맹이라 잡을 팀이 없다. 킬샷이 올라와도 시트는 전 팀을 막고 반려만 남긴다 */
export const ALL_ALLIES_TARGETING: TargetRule = {
  canTarget: () => false,
  blockedBadge: '동맹',
}
