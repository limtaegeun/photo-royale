import type { GameModeDefinition } from '../types'

/** 폭탄설치전 — 거점 A·B의 QR을 두고 공격/수비가 겨루는 점령전 */
export const bombPlantMode: GameModeDefinition = {
  id: 'bomb-plant',
  label: '폭탄설치전',
  description: '거점 QR 점령전',
  rules: [
    { kind: 'composition' },
    {
      kind: 'static',
      text: '공격은 거점 A·B의 QR을 스캔해 2분 폭탄을 가동합니다.',
      caption: '수비는 2분 안에 재스캔으로 해제해야 합니다.',
    },
    {
      kind: 'static',
      text: '하나라도 폭파되면 공격 승리, 전원 아웃되거나 무폭파면 수비 승리입니다.',
    },
  ],
  available: false,
}
