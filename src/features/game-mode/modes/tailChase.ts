import type { GameModeDefinition } from '../types'
import { tailChaseScoring } from '../scoring'
import { TAIL_CHASE_TARGETING } from '../targeting'

/** 꼬리잡기 — 알파벳 상성으로 바로 다음 완장만 사냥하는 꼬리물기 */
export const tailChaseMode: GameModeDefinition = {
  id: 'tail-chase',
  label: '꼬리잡기',
  description: '알파벳 상성 꼬리물기',
  rules: [
    { kind: 'composition' },
    {
      kind: 'static',
      text: '바로 다음 알파벳만 사냥할 수 있습니다.',
      caption: 'A는 B만, Z는 A를 사냥합니다.',
    },
    {
      kind: 'static',
      text: '잡히면 완장을 떼고 잡은 팀의 꼬리로 편입됩니다.',
      caption: '잡은 팀은 잡힌 팀의 사냥감을 이어서 노립니다.',
    },
  ],
  // 꼬리잡기 원점수(P07 §4.2) — 킬 10 · 종료 시 미편입 생존 5. 편입자는 새 팀에서 받은 킬 크레딧으로 귀속
  scoring: tailChaseScoring,
  targeting: TAIL_CHASE_TARGETING,
  // 편입 체인의 데이터 근거 — 판정 배치가 잡힌 팀원을 잡은 팀 꼬리(tails)로, 킬 시점 소속을 크레딧(credits)으로 남긴다
  absorbsCaughtTeam: true,
  available: true,
}
