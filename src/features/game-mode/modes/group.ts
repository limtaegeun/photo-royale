import type { GameModeDefinition } from '../types'
import { isSameGroup } from '../armbandGroups'
import { groupScoring } from '../scoring'

/** 그룹전 — 완장 색 4개 그룹이 동맹으로 묶이는 연합전 */
export const groupMode: GameModeDefinition = {
  id: 'group',
  label: '그룹전',
  description: '완장 색 4개 그룹 연합전',
  rules: [
    { kind: 'composition' },
    { kind: 'group' },
    { kind: 'static', text: '같은 색 그룹끼리는 동맹이라 서로 공격할 수 없습니다.' },
    { kind: 'static', text: '그룹 점수와 우리 팀 점수를 합산해 정산합니다.' },
  ],
  // 그룹전 원점수(P07 §4.3) — 내 팀 킬 10 · 같은 그룹 다른 팀의 킬 5, 팀원 각자에게
  scoring: groupScoring,
  // 동맹은 잡을 수 없다 — 판정 시트에서 제출 팀과 같은 그룹을 비활성화한다
  targeting: {
    canTarget: (attacker, target) => !isSameGroup(attacker, target),
    blockedBadge: '같은 그룹',
  },
  available: true,
}
