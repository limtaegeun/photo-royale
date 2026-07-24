import type { GameModeDefinition } from '../types'

/** 빠른생존 — 식량·약·물 QR을 모아 본부에 반납하는 자원 수집 서바이벌 */
export const fastSurvivalMode: GameModeDefinition = {
  id: 'fast-survival',
  label: '빠른생존',
  description: '자원 수집 서바이벌',
  rules: [
    { kind: 'composition' },
    { kind: 'static', text: '식량·약·물 QR을 각 1개씩 수집해 본부 반납 QR을 스캔하세요.' },
    { kind: 'static', text: '자원 거점은 인당 1회만 획득할 수 있습니다.' },
  ],
  available: false,
}
