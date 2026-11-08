import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { subscribeToHitsOnTeam, type SubmissionRecord } from '@/features/round-ops'
import {
  deriveEliminationNotice,
  eliminatedByTeam,
  type EliminationNotice,
} from '../eliminationNotice'

/** 안내 창이 뜰 때 한 번 울리는 진동 — 판정 화면의 촉감 틱(6~8ms)과 달리 주머니 속에서도 느껴지는 길이 */
const NOTICE_VIBRATION_MS = 200

export interface UseEliminationNoticeOptions {
  /** 콕핏이 매인 방 코드 */
  roomCode: Ref<string | null>
  /** 내 완장 — 배정 확인 전이면 null이라 구독하지 않는다 */
  team: Ref<string | null>
  /** 이번 차수(배정 라운드) — null이면 구독하지 않는다 */
  round: Ref<number | null>
  /** 우리 팀 목숨(livesOf) — 원장이 없으면 탈락 모델도 없으니(P07 M3) null로 넘겨 안내를 띄우지 않는다 */
  lives: Ref<number | null>
  /** 이 모드에서 안내를 띄우는가 — 잡힌 팀이 상대 꼬리로 편입되는 모드(꼬리잡기)는 목표 카드가 이미 알린다 */
  enabled: Ref<boolean>
}

export interface UseEliminationNoticeResult {
  /** 지금 띄울 안내 — 없으면 null */
  notice: Ref<EliminationNotice | null>
  /** 우리 팀을 탈락시킨 팀 — 상태 카드 문구("팀 E에게 잡혔어요")에 쓴다. 모르면 null */
  eliminatedBy: Ref<string | null>
  /** 지금 안내를 확인했다 — 같은 피격으로 다시 띄우지 않는다 */
  acknowledge: () => void
}

function ackStorageKey(code: string, round: number): string {
  return `pr:elimination-ack:${code}:${round}`
}

/** 확인한 킬샷 id — 기기 저장소 best-effort. 저장소가 막힌 환경이면 빈 목록으로 시작한다 */
function readAcknowledged(code: string, round: number): Set<string> {
  try {
    const raw = localStorage.getItem(ackStorageKey(code, round))
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeAcknowledged(code: string, round: number, ids: Set<string>): void {
  try {
    localStorage.setItem(ackStorageKey(code, round), JSON.stringify([...ids]))
  } catch {
    // 저장소가 막힌 환경(프라이빗 모드 등) — 이 탭에서만 기억한다
  }
}

/**
 * 탈락 알림(P21) — 우리 팀을 잡은 확정 킬샷을 구독해 안내 창 내용을 낸다. 규칙서 §2.1 "유효 판정 시, 피격된
 * 플레이어는 즉시 라이프가 줄어들고 게임 툴 알림을 받습니다"의 알림이다.
 *
 * 내 킬샷 판정 토스트(useJudgmentFeedback)와 달리 첫 스냅샷도 알린다 — 폰을 끄고 뛰다 다시 켠 팀원도 탈락을
 * 알아야 한다. 대신 확인한 피격은 기기에 남겨 새로고침·재입장으로 다시 띄우지 않는다.
 * 구독 오류는 조용히 둔다 — 셔터 잠금은 원장이 따로 맡아서 알림이 빠져도 게임 규칙은 지켜진다.
 */
export function useEliminationNotice(options: UseEliminationNoticeOptions): UseEliminationNoticeResult {
  const hits = shallowRef<SubmissionRecord[]>([])
  const acknowledged = ref<Set<string>>(new Set())
  let unsubscribe: (() => void) | null = null

  function resubscribe() {
    unsubscribe?.()
    unsubscribe = null
    hits.value = []

    const code = options.roomCode.value
    const team = options.team.value
    const round = options.round.value
    if (code === null || team === null || round === null) {
      acknowledged.value = new Set()
      return
    }

    acknowledged.value = readAcknowledged(code, round)
    unsubscribe = subscribeToHitsOnTeam(
      code,
      round,
      team,
      (records) => {
        hits.value = records
      },
      () => {},
    )
  }

  watch([options.roomCode, options.team, options.round], resubscribe, { immediate: true })

  const notice = computed(() => {
    const lives = options.lives.value
    if (!options.enabled.value || lives === null) return null
    return deriveEliminationNotice(hits.value, lives, acknowledged.value)
  })

  const eliminatedBy = computed(() => {
    const lives = options.lives.value
    if (!options.enabled.value || lives === null) return null
    return eliminatedByTeam(hits.value, lives)
  })

  // 새 안내가 뜰 때 한 번 울린다. iOS 사파리는 진동 API가 없어 창만 뜬다
  watch(
    () => notice.value?.submissionId ?? null,
    (submissionId, previousId) => {
      if (submissionId !== null && submissionId !== previousId) navigator.vibrate?.(NOTICE_VIBRATION_MS)
    },
  )

  function acknowledge() {
    const code = options.roomCode.value
    const round = options.round.value
    if (notice.value === null || code === null || round === null) return
    // 지금 안내까지의 피격을 모두 확인한 것으로 본다 — 안내는 늘 마지막 피격이라 앞의 것도 이미 반영돼 있다
    const next = new Set(acknowledged.value)
    for (const hit of hits.value) next.add(hit.id)
    acknowledged.value = next
    writeAcknowledged(code, round, next)
  }

  onScopeDispose(() => {
    unsubscribe?.()
  })

  return { notice, eliminatedBy, acknowledge }
}
