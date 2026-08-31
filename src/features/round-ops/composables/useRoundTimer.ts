import { computed, onUnmounted, ref, type Ref } from 'vue'
import { computeRoundRemainingMs, type RoundState } from '@/features/waiting-room'
import { ROUND_DURATION_DEFAULT_MS } from '../api/round'

/** 화면이 구분해야 하는 라운드 표시 상태 — 배지 톤·타이머 색·주 액션이 여기서 갈린다 */
export type RoundDisplayState = 'idle' | 'running' | 'paused' | 'ended'

/** 1초마다 다시 계산한다 — 카운트다운은 초 단위 표기라 그 이상 촘촘할 이유가 없다 */
const TICK_INTERVAL_MS = 1000

/**
 * 남은 시간(ms) — 화면(1초 tick)과 스토어(쓰기 직전 클릭 순간)가 같은 값을 보도록 순수 함수다.
 *
 * 진행 중인 라운드의 계산은 방 문서의 소유자(waiting-room의 computeRoundRemainingMs)가 갖는다.
 * 여기가 더하는 것은 라운드 시작 전(null)의 기본 20분뿐이다 — 시작 버튼 위에 놓일
 * "앞으로 이만큼" 미리보기라 운영 화면에서만 뜻이 있다.
 */
export function computeRemainingMs(round: RoundState | null, nowMs: number): number {
  if (round === null) return ROUND_DURATION_DEFAULT_MS
  return computeRoundRemainingMs(round, nowMs)
}

/** 남은 ms → `mm:ss`. 초는 올림이라 시작 직후 20:00이 한 틱 동안 유지된다(19:59로 튀지 않음) */
export function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** 라운드 상태 + 종료 여부 → 화면 표시 상태 */
export function resolveDisplayState(round: RoundState | null, isEnded: boolean): RoundDisplayState {
  if (round === null) return 'idle'
  if (isEnded) return 'ended'
  return round.status === 'paused' ? 'paused' : 'running'
}

/**
 * 라운드 카운트다운 — 방 문서의 round 상태를 1초 tick으로 화면 값으로 바꾼다.
 *
 * 화면 잠금·백그라운드 전환 중에는 브라우저가 타이머를 늦추거나 멈추므로, 복귀 시점
 * (visibilitychange)에 즉시 재계산해 남은 시간이 멈춰 보이지 않게 한다 — 진행자가 잠금 해제
 * 직후 보는 값이 몇 초 어긋나면 올스탑 판단이 흔들린다(QA G-01).
 */
export function useRoundTimer(round: Ref<RoundState | null>) {
  const nowMs = ref(Date.now())

  function tick() {
    nowMs.value = Date.now()
  }

  const intervalId = setInterval(tick, TICK_INTERVAL_MS)
  document.addEventListener('visibilitychange', tick)

  onUnmounted(() => {
    clearInterval(intervalId)
    document.removeEventListener('visibilitychange', tick)
  })

  const remainingMs = computed(() => computeRemainingMs(round.value, nowMs.value))
  const formatted = computed(() => formatRemaining(remainingMs.value))
  /** 라운드가 시작된 뒤 남은 시간이 0에 닿은 상태 — 종료는 별도 쓰기 없이 클라이언트가 판정한다 */
  const isEnded = computed(() => round.value !== null && remainingMs.value === 0)
  const displayState = computed(() => resolveDisplayState(round.value, isEnded.value))

  return { nowMs, remainingMs, formatted, isEnded, displayState }
}
