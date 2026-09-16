import type { GameModeDefinition } from '../types'
import { kingHuntScoring } from '../scoring'
import { ALLY_GROUP_TARGETING } from '../targeting'

/** 왕잡기 — 그룹의 왕을 지키고 상대 왕을 사냥하는 그룹전 변형. 왕 = X 겸직 팀(xRole) */
export const kingHuntMode: GameModeDefinition = {
  id: 'king-hunt',
  label: '왕잡기',
  description: '그룹의 왕을 지키고 상대 왕을 사냥',
  rules: [
    { kind: 'composition' },
    { kind: 'group' },
    { kind: 'static', text: '같은 색 그룹끼리는 동맹이라 서로 공격할 수 없습니다.' },
    { kind: 'static', text: '각 그룹의 왕은 특수 완장 X를 겸합니다.' },
    {
      kind: 'static',
      text: '왕의 킬은 2배, 상대 왕을 잡으면 3배 점수입니다.',
      caption: '왕이 잡히면 그 그룹 전체가 감점을 받고, 라운드는 계속됩니다.',
    },
  ],
  // 왕잡기 원점수(P07 §4.4) — 일반 킬 10 · 왕의 킬 20 · 왕 사냥 30 · 그룹 동료 킬 5 · 왕 아웃 그룹원 −20
  scoring: kingHuntScoring,
  targeting: ALLY_GROUP_TARGETING,
  // 왕이 없으면 성립하지 않는 모드 — 배정 보드가 X 모듈을 켜고 잠근다
  requiresXModule: true,
  available: true,
}
