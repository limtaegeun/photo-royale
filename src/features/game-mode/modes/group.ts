import type { GameModeDefinition } from '../types'
import { groupScoring } from '../scoring'
import { ALLY_GROUP_TARGETING } from '../targeting'

/** 그룹전 — 완장 색 4개 그룹이 동맹으로 묶이는 연합전 */
export const groupMode: GameModeDefinition = {
  id: 'group',
  label: '그룹전',
  description: '완장 색 4개 그룹 연합전',
  // 노션 ② 카드에 굵은 첫 줄이 없는 모드 — 콕핏 목표는 카드 문구에서 줄여 쓴다
  objective: '완장 색이 같으면 한편이에요. 같은 색은 잡을 수 없어요.',
  ruleCard: {
    icon: 'group',
    lines: [
      '완장 색이 같으면 한편이에요.',
      '빨강, 파랑, 초록, 주황 네 그룹이 싸워요.',
      '같은 색은 잡을 수 없어요.',
      '그룹이 함께 번 점수와 우리 팀 점수를 더해서 계산해요.',
    ],
  },
  // 그룹전 원점수(노션 ②) — 우리 팀 킬 원점수 + 그룹 점수(같은 그룹 모든 팀의 킬 원점수 합), 팀원 각자에게
  scoring: groupScoring,
  // 동맹은 잡을 수 없다 — 판정 카드에서 제출 팀과 같은 그룹을 비활성화한다
  targeting: ALLY_GROUP_TARGETING,
  // 규칙서에 X 규칙이 없고, 4색이 모두 인쇄된 X 완장은 "같은 색은 동맹"으로 편을 가를 수 없다
  xModule: 'off',
  xModuleLockReason: '그룹전은 X를 쓰지 않습니다',
  available: true,
}
