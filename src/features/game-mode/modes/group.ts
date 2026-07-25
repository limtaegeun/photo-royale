import type { GameModeDefinition } from '../types'

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
  available: false,
}
