import type { RoundDisplayState } from './composables/useRoundTimer'

/**
 * 라운드 표시 상태의 라벨·배지 톤 단일 소스. 상태 색은 반드시 텍스트 라벨과 함께 쓰이므로
 * (색약 대응 — 디자인 시스템 §3-6) 두 값을 같은 파일에 붙여 두고 화면마다 다시 짜지 않는다.
 */
export const ROUND_STATE_LABEL: Record<RoundDisplayState, string> = {
  idle: '대기',
  running: 'LIVE',
  paused: '일시정지',
  ended: '종료',
}

/** BaseBadge tone — 상태 라벨과 짝으로만 쓴다 */
export const ROUND_STATE_TONE: Record<RoundDisplayState, 'neutral' | 'success' | 'warning'> = {
  idle: 'neutral',
  running: 'success',
  paused: 'warning',
  ended: 'neutral',
}
