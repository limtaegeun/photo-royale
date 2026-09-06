import type { RoundDisplayState } from './composables/useRoundTimer'

/**
 * 라운드 표시 상태의 라벨·배지 톤·시간 색 단일 소스. 상태 색은 반드시 텍스트 라벨과 함께 쓰이므로
 * (색약 대응 — 디자인 시스템 §3-6) 세 값을 같은 파일에 붙여 두고 화면마다 다시 짜지 않는다.
 */
export const ROUND_STATE_LABEL: Record<RoundDisplayState, string> = {
  idle: '대기',
  running: 'LIVE',
  paused: '일시정지',
  ended: '종료',
}

/**
 * BaseBadge tone — 상태 라벨과 짝으로만 쓴다.
 *
 * ended가 neutral이 아닌 이유: 시간이 다 된 라운드는 진행자가 지금 무언가 해야 하는 상태다.
 * 시작 전(idle)과 같은 회색으로 두면 판정에 몰두한 진행자가 배지를 봐도 끝난 줄 모른다(QA A-3).
 */
export const ROUND_STATE_TONE: Record<
  RoundDisplayState,
  'neutral' | 'success' | 'warning' | 'danger'
> = {
  idle: 'neutral',
  running: 'success',
  paused: 'warning',
  ended: 'danger',
}

/**
 * 남은 시간 숫자 색 — 배지 톤과 같은 상태 축을 쓴다. 타이머 카드와 상단 상태 줄이 각자
 * 맵을 들고 있으면 한쪽만 고쳐져 같은 상태가 두 색으로 보인다.
 * (Tailwind 스캐너 대응 — 완전한 리터럴 클래스명)
 */
export const ROUND_STATE_TIME_CLASS: Record<RoundDisplayState, string> = {
  idle: 'text-content-secondary',
  running: 'text-success',
  paused: 'text-warning',
  ended: 'text-danger',
}
