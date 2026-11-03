import type { RouteLocationNormalized } from 'vue-router'

/**
 * 이번 이동이 뒤로가기(브라우저·안드로이드 뒤로 버튼·제스처)인지 onBeforeRouteLeave 안에서 가른다.
 *
 * `history.state.current` 로 가른다 — popstate 이동은 가드가 돌 때 이미 목적지 기록으로 옮겨 와
 * current 가 목적지 주소다. 코드가 부른 push·replace 는 가드가 끝난 뒤에야 기록을 바꿔 current 가 지금 주소다.
 * 그래서 화면 안 버튼이 부른 이동(예: 지난 라운드 기록 보기·게임 시작 뒤 운영 화면 이동)은 뒤로가기로 치지 않는다.
 */
export function isHistoryBackNavigation(to: Pick<RouteLocationNormalized, 'fullPath'>): boolean {
  const state = window.history.state as { current?: unknown } | null
  return state?.current === to.fullPath
}
