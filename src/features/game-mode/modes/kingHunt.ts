import type { GameModeDefinition } from '../types'
import { KING_HUNT_JUDGE_GUIDE } from '../judgeGuides'
import { kingHuntScoring } from '../scoring'
import { ALLY_GROUP_TARGETING } from '../targeting'

/**
 * 왕잡기 — 그룹의 비밀 왕을 지키고 상대 왕을 잡는 그룹전 변형(노션 ② 왕잡기 카드). 왕 = X 겸직 팀(xRole)이지만
 * X 완장을 차지 않는다 — 왕은 같은 그룹에만 알린다("그룹마다 몰래 왕을 1명 정해요")
 */
export const kingHuntMode: GameModeDefinition = {
  id: 'king-hunt',
  label: '왕잡기',
  description: '그룹의 왕을 지키고 상대 왕을 사냥',
  // 노션 ② 카드에 굵은 첫 줄이 없는 모드 — 콕핏 목표는 카드 문구에서 줄여 쓴다
  objective: '왕을 꼭 지키세요. 왕을 잡으면 +30점이에요.',
  ruleCard: {
    icon: 'crown',
    lines: [
      '그룹마다 몰래 왕을 1명 정해요.',
      '왕을 잡으면 잡은 사람이 +30점을 얻어요. 그룹 전체는 +10점을 얻어요.',
      '우리 왕이 잡히면 그 판은 그룹 전체가 즉시 아웃됩니다.',
      '왕을 꼭 지키세요.',
    ],
  },
  // 왕잡기 원점수(노션 ②) — 킬 10 · 왕을 잡은 킬 30 · 왕을 잡은 팀의 그룹 전체 +10. 왕이 잡힌 그룹은 감점 없이 전원 아웃
  scoring: kingHuntScoring,
  targeting: ALLY_GROUP_TARGETING,
  judgeGuide: KING_HUNT_JUDGE_GUIDE,
  // 왕이 없으면 성립하지 않는 모드 — 배정 보드가 X 모듈을 켜고 잠근다
  xModule: 'required',
  xModuleLockReason: '왕잡기는 그룹마다 비밀 왕이 필요해 항상 켜집니다. 왕은 X 완장을 차지 않아요',
  xTeamBadge: '비밀 왕',
  xTeamCaption: '우리 팀이 그룹의 왕이에요. 다른 그룹에는 비밀이에요. 잡히면 그룹 전체가 즉시 아웃돼요.',
  // 왕은 같은 그룹에만 알리고, 왕이 아웃되면 같은 그룹 전원이 그 판에서 아웃된다
  secretKing: true,
  available: true,
}
