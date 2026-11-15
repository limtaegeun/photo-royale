import type { GameModeDefinition } from '../types'
import { TAIL_CHASE_JUDGE_GUIDE } from '../judgeGuides'
import { tailChaseScoring } from '../scoring'
import { TAIL_CHASE_TARGETING } from '../targeting'

/** 꼬리잡기 — 알파벳 상성으로 바로 다음 완장만 사냥하는 꼬리물기 */
export const tailChaseMode: GameModeDefinition = {
  id: 'tail-chase',
  label: '꼬리잡기',
  description: '알파벳 상성 꼬리물기',
  // 콕핏은 이 문구 대신 목표 카드(P17)로 내 타깃을 보인다 — 원장을 아직 못 받았을 때만 이 문구가 보인다
  objective: '바로 다음 알파벳만 잡을 수 있어요.',
  ruleCard: {
    icon: 'tail',
    lines: [
      '바로 다음 알파벳만 잡을 수 있어요.',
      'A는 B만, B는 C만 잡아요.',
      '내 타깃은 완장 옆에 떠 있어요.',
      '잡히면 나를 잡은 팀의 꼬리가 되어 같이 움직여요.',
    ],
  },
  // 꼬리잡기 원점수(P07 §4.2) — 킬 10 · 종료 시 미편입 생존 5. 편입자는 새 팀에서 받은 킬 크레딧으로 귀속
  scoring: tailChaseScoring,
  targeting: TAIL_CHASE_TARGETING,
  judgeGuide: TAIL_CHASE_JUDGE_GUIDE,
  // 편입 체인의 데이터 근거 — 판정 배치가 잡힌 팀원을 잡은 팀 꼬리(tails)로, 킬 시점 소속을 크레딧(credits)으로 남긴다
  absorbsCaughtTeam: true,
  // 규칙서에 X 규칙이 없고, "X끼리만 사냥"은 "바로 다음 알파벳만"과 함께 지킬 수 없다
  xModule: 'off',
  xModuleLockReason: '꼬리잡기는 X를 쓰지 않습니다',
  available: true,
}
