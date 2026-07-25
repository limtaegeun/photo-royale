import type { GameModeDefinition } from '../types'

/** 왕잡기 — 그룹의 왕을 지키고 상대 왕을 사냥하는 그룹전 변형 */
export const kingHuntMode: GameModeDefinition = {
  id: 'king-hunt',
  label: '왕잡기',
  description: '그룹의 왕을 지키고 상대 왕을 사냥',
  rules: [
    { kind: 'composition' },
    { kind: 'group' },
    { kind: 'static', text: '각 그룹은 왕 1명을 비밀리에 지정합니다.' },
    {
      kind: 'static',
      text: '왕의 킬은 2배 점수입니다.',
      caption: '왕이 잡히면 그룹 전체가 막대한 감점을 받습니다.',
    },
  ],
  available: false,
}
