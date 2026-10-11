import type { GameModeDefinition } from '../types'
import { normalScoring } from '../scoring'
import { X_ONLY_TARGETING } from '../targeting'

/** 일반전 — 2인 1조 기본 생존 서바이벌. 유일하게 게임플레이가 구현된 모드다. */
export const normalMode: GameModeDefinition = {
  id: 'normal',
  label: '일반전',
  description: '2인 1조 팀전 기본 생존 서바이벌',
  rules: [
    { kind: 'composition' },
    { kind: 'group' },
    { kind: 'static', text: '상대 완장 알파벳을 찍어 제출하세요.' },
  ],
  // 일반전 원점수(P07 §4.1) — 팀 킬 10 · 낙오 포착 킬 30 · 종료 시 생존 5(탈락 모델 M3), 팀원 각자에게
  scoring: normalScoring,
  // X 팀과 일반 팀은 서로 잡을 수 없다 — 판정 시트에서 X 여부가 다른 팀을 비활성화한다. X를 끈 라운드는 막지 않는다
  targeting: X_ONLY_TARGETING,
  // 규칙서 §3.1이 X 규칙("오직 X끼리만 서로를 사냥")을 정한 모드 — 진행자가 켜고 끈다
  xModule: 'optional',
  available: true,
}
