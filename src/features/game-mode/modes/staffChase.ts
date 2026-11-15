import type { GameModeDefinition } from '../types'
import { STAFF_CHASE_JUDGE_GUIDE } from '../judgeGuides'
import { staffChaseScoring } from '../scoring'
import { ALL_ALLIES_TARGETING } from '../targeting'

/** 스태프 추격전 — 참가자 전원이 동맹이 되어 사냥꾼(스태프)을 피하는 협동 도망 모드 */
export const staffChaseMode: GameModeDefinition = {
  id: 'staff-chase',
  label: '스태프 추격전',
  description: '전원 협동 도망 모드',
  // 노션 ② 목표 문구(2026-07-05 결정) — 3분과 한 판 20분의 관계는 노션에서도 열린 질문이라 라운드 시간은 바꾸지 않는다
  objective: '추격전: 3분동안 헌터로부터 살아남으세요',
  ruleCard: {
    icon: 'timer',
    headline: '추격전: 3분동안 헌터로부터 살아남으세요',
    lines: [
      '이번엔 모두가 한편이에요. 스태프가 헌터가 되어 쫓아와요.',
      '끝까지 살아남은 사람이 많을수록 모두의 점수가 올라가요.',
    ],
  },
  // 스태프 추격전 원점수(노션 ②) — 생존 비율 × 10을 참가자 모두에게 같게(1인 팀 2배)
  scoring: staffChaseScoring,
  targeting: ALL_ALLIES_TARGETING,
  judgeGuide: STAFF_CHASE_JUDGE_GUIDE,
  // 참가자 전원이 동맹 — 콕핏 셔터를 잠근다(P07 §4.5 후속)
  killshotLock: '이 모드에서는 킬샷을 찍지 않아요. 스태프에게 잡히면 진행자가 아웃으로 기록해요.',
  // 참가자끼리 사냥하지 않는 모드라 "X끼리만 사냥"을 지킬 방법이 없다
  xModule: 'off',
  xModuleLockReason: '스태프 추격전은 킬샷이 없어 X를 쓰지 않습니다',
  available: true,
}
