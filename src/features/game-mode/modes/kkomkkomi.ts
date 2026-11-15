import type { GameModeDefinition } from '../types'
import { killScoring } from '../scoring'

/** 꼼꼬미 — 술래를 피해 숨고 꼼꼬미 QR로 확정 생존하는 숨바꼭질 × 포토 게임 */
export const kkomkkomiMode: GameModeDefinition = {
  id: 'kkomkkomi',
  label: '꼼꼬미',
  description: '숨바꼭질 × 포토 게임',
  // 아직 열지 않은 모드(노션 ②에 카드 없음) — 규칙서 v1.0 문구를 그대로 둔다
  objective: '술래를 피해 숨고, 술래 거점의 꼼꼬미 QR을 스캔하면 확정 생존입니다.',
  ruleCard: {
    icon: 'flag',
    lines: [
      '술래를 피해 숨고, 술래 거점의 꼼꼬미 QR을 스캔하면 확정 생존입니다.',
      '생존 판정은 게임 툴의 최초 타임스탬프 기준입니다.',
      '술래의 촬영 시각이 내 스캔 시각보다 빠르면 아웃입니다.',
    ],
  },
  // 자기 원점수 규칙이 아직 없다 — 기본 킬 규칙(M4에서 교체)
  scoring: killScoring,
  available: false,
}
