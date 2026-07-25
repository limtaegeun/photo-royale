import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/shared/api/firebase'
import type { RoundState } from '@/features/waiting-room'

/** 라운드 기본 길이(20분) — 호스트가 '라운드 시작'을 누를 때의 총량 */
export const ROUND_DURATION_DEFAULT_MS = 20 * 60 * 1000

/** 시간 조정 한 스텝(1분) — −1분/+1분 버튼이 대기값에 누적한다 */
export const ROUND_ADJUST_STEP_MS = 60 * 1000

/**
 * 라운드 길이 상한(3시간). firestore.rules의 `durationMs <= 10800000`과 **숫자까지 동일**해야
 * 한다(rules는 클라 코드를 import할 수 없어 이중 정의이고, round.spec이 대조 검증한다.
 * 변경 시 rules도 함께 갱신·배포할 것).
 */
export const ROUND_DURATION_MAX_MS = 3 * 60 * 60 * 1000

/**
 * 라운드 상태 쓰기의 단일 경로. 모든 전이(시작·정지·재개·시간 반영)를 **"지금부터 남은 시간
 * 만큼"** 으로 다시 앵커한다 — 남은 시간은 어차피 durationMs - (now - startedAt)로만 정의되므로,
 * 앵커를 매번 서버 시각으로 새로 잡으면 클라이언트가 이전 Timestamp를 되쓰지 않아도 되고
 * (호스트 기기 시계가 개입할 여지도 없고) 네 전이의 payload 모양이 하나로 모인다.
 *
 * 방 문서의 top-level 키는 `round` 하나만 건드린다 — rules의 갈래 검사(hasOnly(['round']))가
 * 기존 status/배정 갈래와 겹치지 않게 하는 전제다.
 */
async function writeRound(
  code: string,
  status: RoundState['status'],
  remainingMs: number,
): Promise<void> {
  const durationMs = clampDurationMs(remainingMs)
  await updateDoc(doc(db, 'rooms', code), {
    round: {
      status,
      startedAt: serverTimestamp(),
      durationMs,
      // running에는 필드 자체가 없어야 한다(rules가 부재를 요구) — 정지 중에만 남은 시간을 고정한다
      ...(status === 'paused' ? { pausedRemainingMs: durationMs } : {}),
    },
  })
}

/** 음수·상한 초과·소수점을 서버 스키마(0 이상의 정수)에 맞춘다 */
function clampDurationMs(remainingMs: number): number {
  return Math.min(Math.max(Math.round(remainingMs), 0), ROUND_DURATION_MAX_MS)
}

/** 라운드 시작(재시작 포함) — 기본 20분으로 카운트다운을 건다 */
export async function startRound(code: string): Promise<void> {
  await writeRound(code, 'running', ROUND_DURATION_DEFAULT_MS)
}

/** 올스탑 — 클릭 순간의 남은 시간을 고정한다(오차는 클릭 시점 스큐뿐) */
export async function pauseRound(code: string, remainingMs: number): Promise<void> {
  await writeRound(code, 'paused', remainingMs)
}

/** 재개 — 정지 중 고정해 둔 남은 시간으로 카운트다운을 다시 건다 */
export async function resumeRound(code: string, remainingMs: number): Promise<void> {
  await writeRound(code, 'running', remainingMs)
}

/**
 * 시간 반영(±N분) — 현재 남은 시간에 대기 변경값을 더한다. 진행/정지 상태는 그대로 유지하므로
 * 정지 중에 시간을 조정해도 저절로 재개되지 않는다. 결과가 음수면 0으로 클램프된다(즉시 종료 표시).
 */
export async function adjustRound(
  code: string,
  status: RoundState['status'],
  remainingMs: number,
  deltaMs: number,
): Promise<void> {
  await writeRound(code, status, remainingMs + deltaMs)
}
