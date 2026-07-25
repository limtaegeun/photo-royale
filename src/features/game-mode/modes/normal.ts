import type { GameModeDefinition } from '../types'

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
  available: true,
}
