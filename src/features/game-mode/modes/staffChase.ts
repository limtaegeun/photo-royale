import type { GameModeDefinition } from '../types'
import { staffChaseScoring } from '../scoring'
import { ALL_ALLIES_TARGETING } from '../targeting'

/** 스태프 추격전 — 참가자 전원이 동맹이 되어 사냥꾼(스태프)을 피하는 협동 도망 모드 */
export const staffChaseMode: GameModeDefinition = {
  id: 'staff-chase',
  label: '스태프 추격전',
  description: '전원 협동 도망 모드',
  rules: [
    { kind: 'static', text: '모든 참가자는 동맹입니다. 사냥꾼(스태프)을 피해 생존하세요.' },
    {
      kind: 'static',
      text: '제한 시간까지 생존하면 잡힌 사람보다 위 등급입니다.',
      caption: '스태프에게 잡히면 진행자가 아웃으로 기록합니다.',
    },
  ],
  // 스태프 추격전 원점수(P07 §4.5) — 생존 15 · 아웃 5, 팀원 각자에게(1인 팀 2배)
  scoring: staffChaseScoring,
  targeting: ALL_ALLIES_TARGETING,
  // 참가자 전원이 동맹 — 콕핏 셔터를 잠근다(P07 §4.5 후속)
  killshotLock: '이 모드에서는 킬샷을 찍지 않아요. 스태프에게 잡히면 진행자가 아웃으로 기록해요.',
  available: true,
}
