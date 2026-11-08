import { onUnmounted, readonly, ref, watch, type Ref } from 'vue'
import { subscribeToKillshotCooldown } from '@/features/round-ops'
import { serverNow } from '@/features/waiting-room'
import {
  currentHeat,
  heatAfterSubmit,
  lockRemainingMs,
  type HeatAnchor,
} from '../killshotHeat'

/** requestAnimationFrame이 없는 환경(테스트)에서는 프레임 대신 짧은 타이머로 돈다 */
function nextFrame(callback: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(callback)
    return () => cancelAnimationFrame(id)
  }
  const id = setTimeout(callback, 16)
  return () => clearTimeout(id)
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * 킬샷 과열(P19) — 내 열 문서를 구독해 셔터 잠금과 테두리 길이를 낸다.
 *
 * 잠금은 단계가 없다. 다음 1칸이 들어갈 자리가 없으면 잠기고, 1칸이 식으면 바로 풀린다(길어야 3초).
 * 구독이 실패하면 열 0으로 둔다 — 촬영 자체를 막을 근거가 아니고, 서버가 마지막으로 거른다.
 */
export function useKillshotCooldown(
  roomCode: string,
  uid: Readonly<Ref<string | null>>,
  round: Readonly<Ref<number | null>>,
) {
  const anchor = ref<HeatAnchor | null>(null)
  /** 셔터가 과열로 잠겼는가 */
  const isOverheated = ref(false)
  /** 잠금 테두리 길이 — 잠긴 순간 1에서 시작해 풀릴 때 0이 된다 */
  const lockFraction = ref(0)
  let lockTotalMs = 0
  let cancelFrame: (() => void) | null = null
  let unsubscribe: (() => void) | null = null
  const readyWaiters: Array<() => void> = []

  function heatNow(): number {
    return currentHeat(anchor.value, round.value, serverNow(), performance.now())
  }

  function tick() {
    cancelFrame = null
    const remaining = lockRemainingMs(heatNow())
    if (remaining <= 0) {
      isOverheated.value = false
      lockFraction.value = 0
      lockTotalMs = 0
      for (const resolve of readyWaiters.splice(0)) resolve()
      return
    }
    if (!isOverheated.value || remaining > lockTotalMs) lockTotalMs = remaining
    isOverheated.value = true
    // 움직임 줄이기 설정에서는 매끄럽게 줄이지 않고 1초 단위로 줄인다
    const shown = prefersReducedMotion() ? Math.ceil(remaining / 1000) * 1000 : remaining
    lockFraction.value = Math.min(1, shown / lockTotalMs)
    cancelFrame = nextFrame(tick)
  }

  function restart() {
    cancelFrame?.()
    tick()
  }

  watch(
    uid,
    (myUid) => {
      unsubscribe?.()
      unsubscribe = null
      anchor.value = null
      restart()
      if (myUid === null) return
      unsubscribe = subscribeToKillshotCooldown(
        roomCode,
        myUid,
        (cooldown) => {
          anchor.value =
            cooldown === null
              ? null
              : {
                  round: cooldown.round,
                  heat: cooldown.heat,
                  lastAtMs: cooldown.lastAtMs,
                  receivedAtMs: performance.now(),
                }
          restart()
        },
        () => {
          anchor.value = null
          restart()
        },
      )
    },
    { immediate: true },
  )
  watch(round, restart)

  /** 이번 제출로 오른 뒤의 열 — 제출 배치에 싣는다 */
  function heatForSubmit(): number {
    return heatAfterSubmit(heatNow())
  }

  /** 1칸이 식을 때까지 기다린다(길어야 3초). 잠기지 않았으면 바로 끝난다 */
  function waitUntilReady(): Promise<void> {
    restart()
    if (!isOverheated.value) return Promise.resolve()
    return new Promise((resolve) => readyWaiters.push(resolve))
  }

  onUnmounted(() => {
    unsubscribe?.()
    cancelFrame?.()
    for (const resolve of readyWaiters.splice(0)) resolve()
  })

  return {
    isOverheated: readonly(isOverheated),
    lockFraction: readonly(lockFraction),
    heatForSubmit,
    waitUntilReady,
  }
}
