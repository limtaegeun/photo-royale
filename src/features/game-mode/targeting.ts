import { isSameGroup } from './armbandGroups'
import type { TargetRule } from './types'

/**
 * 같은 색 그룹은 동맹이라 잡을 수 없다 — 그룹전·왕잡기가 공유하는 대상 제한.
 * 판정 시트가 제출 팀과 같은 그룹을 비활성화하고 배지로 이유를 보인다(클라이언트만, rules는 막지 않는다).
 */
export const ALLY_GROUP_TARGETING: TargetRule = {
  canTarget: (attacker, target) => !isSameGroup(attacker, target),
  blockedBadge: '같은 그룹',
}
