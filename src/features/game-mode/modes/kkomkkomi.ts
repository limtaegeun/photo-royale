import type { GameModeDefinition } from '../types'

/** 꼼꼬미 — 술래를 피해 숨고 꼼꼬미 QR로 확정 생존하는 숨바꼭질 × 포토 게임 */
export const kkomkkomiMode: GameModeDefinition = {
  id: 'kkomkkomi',
  label: '꼼꼬미',
  description: '숨바꼭질 × 포토 게임',
  rules: [
    { kind: 'static', text: '술래를 피해 숨고, 술래 거점의 꼼꼬미 QR을 스캔하면 확정 생존입니다.' },
    {
      kind: 'static',
      text: '생존 판정은 게임 툴의 최초 타임스탬프 기준입니다.',
      caption: '술래의 촬영 시각이 내 스캔 시각보다 빠르면 아웃입니다.',
    },
  ],
  available: false,
}
