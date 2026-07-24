import type { GameModeDefinition } from '../types'

/** 스태프 추격전 — 참가자 전원이 동맹이 되어 사냥꾼(스태프)을 피하는 협동 도망 모드 */
export const staffChaseMode: GameModeDefinition = {
  id: 'staff-chase',
  label: '스태프 추격전',
  description: '전원 협동 도망 모드',
  rules: [
    { kind: 'static', text: '모든 참가자는 동맹입니다. 사냥꾼(스태프)을 피해 생존하세요.' },
    { kind: 'static', text: '제한 시간까지 생존한 인원에 비례해 전체 점수를 얻습니다.' },
  ],
  available: false,
}
