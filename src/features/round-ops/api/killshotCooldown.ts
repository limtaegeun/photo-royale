import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '@/shared/api/firebase'

/**
 * 킬샷 과열(P19, docs/plans/p19-killshot-overheat.md) — 제출 한 번에 카메라 열이 1칸 오르고 3초에 1칸 식는다.
 * 열은 4칸까지 차고, 다음 1칸이 들어갈 자리가 없으면 셔터가 잠긴다. 단계는 없어서 잠금은 길어야 3초다.
 *
 * 열은 초 단위 숫자로 적는다 — 1칸 = 3, 꽉 참 = 12. 시간이 흐른 만큼(초) 그대로 빼면 식은 열이다.
 * 아래 두 숫자는 firestore.rules의 killshotCooldowns 갈래(`+ 3`, `<= 12`)와 **숫자까지 동일**해야 한다
 * (killshotCooldown.spec이 대조 검증 — 변경 시 rules도 함께 갱신·배포할 것).
 */
export const KILLSHOT_HEAT_PER_SUBMIT_SEC = 3
/** 열이 찰 수 있는 최대값(4칸) */
export const KILLSHOT_HEAT_CAP_SEC = 12
/**
 * 서버가 앱보다 느슨하게 보는 폭(초) — rules의 `heat - 0.5`. 앱은 경과 시간을 늘 실제보다 짧게 잡아
 * 열을 높게 적으므로 이 여유가 없어도 통과하지만, 서버 시각 반올림 같은 오차에 정상 제출이 거부되지 않게 둔다.
 * 앱 코드는 이 값을 쓰지 않는다(rules 대조용).
 */
export const KILLSHOT_HEAT_SERVER_GRACE_SEC = 0.5

/** 내 열 문서 — rooms/{code}/killshotCooldowns/{uid}. 본인과 그 방 진행자만 읽는다 */
export interface KillshotCooldown {
  /** 이 열을 쌓은 라운드(팀편성 차수) — 다른 라운드의 열은 0으로 본다 */
  round: number
  /** 마지막 제출 직후의 열(초) */
  heat: number
  /** 마지막 제출이 서버에 닿은 시각(ms). 내 쓰기가 아직 서버에 닿지 않은 스냅샷에서는 null */
  lastAtMs: number | null
}

export function killshotCooldownRef(code: string, uid: string) {
  return doc(db, 'rooms', code, 'killshotCooldowns', uid)
}

function toKillshotCooldown(data: Record<string, unknown>): KillshotCooldown | null {
  if (typeof data.round !== 'number' || typeof data.heat !== 'number') return null
  const lastAt = data.lastAt as { toMillis?: () => number } | null | undefined
  return {
    round: data.round,
    heat: data.heat,
    lastAtMs: typeof lastAt?.toMillis === 'function' ? lastAt.toMillis() : null,
  }
}

/**
 * 내 열 문서 구독 — 새로고침해도 남은 잠금이 이어지게 서버에 남은 값을 본다. 문서가 없으면 null(열 0).
 * 받는 쪽(useKillshotCooldown)이 받은 순간의 기기 시각을 함께 적어, 경과 시간을 재는 기준으로 쓴다.
 */
export function subscribeToKillshotCooldown(
  code: string,
  uid: string,
  onChange: (cooldown: KillshotCooldown | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    killshotCooldownRef(code, uid),
    (snapshot) => onChange(snapshot.exists() ? toKillshotCooldown(snapshot.data()) : null),
    (error) => onError?.(error),
  )
}
