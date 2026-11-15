import type { GameModeDefinition } from '../types'
import { NORMAL_JUDGE_GUIDE } from '../judgeGuides'
import { normalScoring } from '../scoring'
import { X_ONLY_TARGETING } from '../targeting'

/** 일반전 — 2인 1조 기본 생존 서바이벌. 유일하게 게임플레이가 구현된 모드다. */
export const normalMode: GameModeDefinition = {
  id: 'normal',
  label: '일반전',
  description: '2인 1조 팀전 기본 생존 서바이벌',
  objective: '개인전: 모든 팀을 전멸시키세요',
  ruleCard: {
    icon: 'target',
    headline: '개인전: 모든 팀을 전멸시키세요',
    lines: [
      '우리 팀 말고는 모두 적이에요.',
      '마지막까지 살아남고 많이 잡으세요.',
      'X 완장은 특별해요. X끼리만 서로 잡을 수 있어요.',
    ],
  },
  // 일반전 원점수(P07 §4.1) — 팀 킬 10 · 낙오 포착 킬 30 · 종료 시 생존 5(탈락 모델 M3), 팀원 각자에게
  scoring: normalScoring,
  // X 팀과 일반 팀은 서로 잡을 수 없다 — 판정 카드에서 X 여부가 다른 팀을 비활성화한다. X를 끈 라운드는 막지 않는다
  targeting: X_ONLY_TARGETING,
  judgeGuide: NORMAL_JUDGE_GUIDE,
  // 규칙서 §3.1이 X 규칙("오직 X끼리만 서로를 사냥")을 정한 모드 — 진행자가 켜고 끈다
  xModule: 'optional',
  available: true,
}
