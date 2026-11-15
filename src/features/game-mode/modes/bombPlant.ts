import type { GameModeDefinition } from '../types'
import { killScoring } from '../scoring'

/** 폭탄설치전 — 거점 A·B의 QR을 두고 공격/수비가 겨루는 점령전 */
export const bombPlantMode: GameModeDefinition = {
  id: 'bomb-plant',
  label: '폭탄설치전',
  description: '거점 QR 점령전',
  // 아직 열지 않은 모드(노션 ②에 카드 없음) — 규칙서 v1.0 문구를 그대로 둔다
  objective: '공격은 거점 A·B의 QR을 스캔해 2분 폭탄을 가동합니다.',
  ruleCard: {
    icon: 'flag',
    lines: [
      '공격은 거점 A·B의 QR을 스캔해 2분 폭탄을 가동합니다.',
      '수비는 2분 안에 재스캔으로 해제해야 합니다.',
      '하나라도 폭파되면 공격 승리, 전원 아웃되거나 무폭파면 수비 승리입니다.',
    ],
  },
  // 자기 원점수 규칙이 아직 없다 — 기본 킬 규칙(M4에서 교체)
  scoring: killScoring,
  available: false,
}
