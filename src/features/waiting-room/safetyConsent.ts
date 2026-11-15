/**
 * 안전 수칙 동의 — 게스트가 처음 준비 완료를 누를 때 동의 시트를 띄우고, 동의한 시각을 참가자 문서에
 * 남긴다(safetyConsentAt). 같은 날 다음 라운드에서는 다시 묻지 않고, 늦게 들어온 사람은 처음 준비할 때
 * 똑같이 묻는다(동의 기록이 없으므로).
 */

/** 시트에 보이는 수칙 한 줄 — 앞의 굵은 문장이 약속이고 뒤 문장이 덧붙이는 설명이다 */
export interface SafetyRule {
  key: string
  emoji: string
  title: string
  detail: string
}

export const SAFETY_RULES: readonly SafetyRule[] = [
  {
    key: 'look-around',
    emoji: '👀',
    title: '뛰기 전에 주변부터 봐주세요.',
    detail: '화면만 보면서 달리지 않아요.',
  },
  {
    key: 'walk-on-slopes',
    emoji: '🪜',
    title: '계단, 경사로, 젖은 바닥에서는 걸어요.',
    detail: '이런 곳에서는 특히 조심해주세요.',
  },
  {
    key: 'shared-park',
    emoji: '🌳',
    title: '공원은 우리만 쓰는 곳이 아니에요.',
    detail: '다른 시민, 꽃과 나무, 시설물을 지켜주세요.',
  },
  {
    key: 'rest-anytime',
    emoji: '🙋',
    title: '힘들면 언제든 쉬어도 괜찮아요.',
    detail: '몸이 안 좋으면 바로 스태프에게 말해주세요.',
  },
]

/**
 * 동의가 아직 유효한가 — 동의한 날과 지금이 같은 달력 날짜(기기 시간대)면 다시 묻지 않는다.
 * 같은 방을 다음 날 다시 쓰면 그날 처음 준비할 때 한 번 더 묻는다.
 */
export function isSafetyConsentValid(consentAtMs: number | null, nowMs: number): boolean {
  if (consentAtMs === null) return false
  const consentDay = new Date(consentAtMs)
  const today = new Date(nowMs)
  return (
    consentDay.getFullYear() === today.getFullYear() &&
    consentDay.getMonth() === today.getMonth() &&
    consentDay.getDate() === today.getDate()
  )
}
