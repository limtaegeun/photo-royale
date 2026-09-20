import { onScopeDispose, watch, type Ref } from 'vue'
import { subscribeToMySubmissions, type SubmissionRecord } from '@/features/round-ops'

/** 판정 결과 토스트 한 건 — useToast().toast가 받는 톤의 부분집합과 호환된다 */
export interface JudgmentFeedbackToast {
  title: string
  description?: string
  tone: 'success' | 'neutral' | 'danger'
}

export interface UseJudgmentFeedbackOptions {
  /** 콕핏이 매인 방 코드 — null이면 아직 확정되지 않아 구독하지 않는다 */
  roomCode: Ref<string | null>
  /** 내 uid — null이면 아직 배정을 확인하지 못해 구독하지 않는다 */
  uid: Ref<string | null>
  /** 이번 차수(배정 라운드) — null이면 아직 배정 전이라 구독하지 않는다 */
  round: Ref<number | null>
  toast: (toast: JudgmentFeedbackToast) => void
}

/**
 * 판정 결과 알림(로드맵 D-3) — 내가 이번 라운드에 올린 킬샷이 대기(pending)에서 확정/반려로
 * 바뀌면 콕핏에 토스트로 알린다. 지금까지는 호스트가 판정해도 게스트에게 전달할 채널이 없었다.
 *
 * 첫 스냅샷은 상태만 시드하고 토스트를 띄우지 않는다 — 새로고침·재입장마다 지난 결과를 다시
 * 알리면 방금 판정 하나만 궁금한 게스트에게는 소음이 된다. 판정 큐 자체의 장애 안내는 호스트
 * 몫이라 구독 오류는 조용히 무시한다.
 */
export function useJudgmentFeedback(options: UseJudgmentFeedbackOptions): void {
  const seen = new Map<string, SubmissionRecord['status']>()
  let unsubscribe: (() => void) | null = null

  function resubscribe() {
    unsubscribe?.()
    unsubscribe = null
    seen.clear()

    const code = options.roomCode.value
    const uid = options.uid.value
    const round = options.round.value
    if (code === null || uid === null || round === null) return

    let isFirstSnapshot = true
    unsubscribe = subscribeToMySubmissions(
      code,
      uid,
      round,
      (records) => {
        if (isFirstSnapshot) {
          isFirstSnapshot = false
          for (const record of records) seen.set(record.id, record.status)
          return
        }
        for (const record of records) {
          const previousStatus = seen.get(record.id)
          seen.set(record.id, record.status)
          if (previousStatus !== 'pending') continue
          if (record.status === 'approved') {
            options.toast({
              title:
                record.multiplier === 3
                  ? '킬샷이 낙오 포착 3배로 인정됐어요.'
                  : '킬샷이 인정됐어요.',
              description: record.targetTeam ? `팀 ${record.targetTeam} 킬로 기록됐어요.` : undefined,
              tone: 'success',
            })
          } else if (record.status === 'rejected') {
            options.toast({
              title: '킬샷이 반려됐어요.',
              description: '다시 찍어 제출할 수 있어요.',
              tone: 'neutral',
            })
          }
        }
      },
      // 판정 큐 장애 안내는 호스트 몫 — 구독 오류를 게스트에게 알리지 않는다
      () => {},
    )
  }

  watch([options.roomCode, options.uid, options.round], resubscribe, { immediate: true })

  onScopeDispose(() => {
    unsubscribe?.()
  })
}
