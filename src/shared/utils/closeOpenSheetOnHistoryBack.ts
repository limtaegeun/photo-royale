import type { RouteLocationNormalized } from 'vue-router'
import { isHistoryBackNavigation } from './isHistoryBackNavigation'

/** 열린 시트·다이얼로그(Reka Dialog·AlertDialog 의 내용 요소) */
const OPEN_OVERLAY_SELECTOR = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'

/**
 * 뒤로가기(브라우저·안드로이드 뒤로 버튼·제스처)로 화면을 떠나려 할 때 열린 시트·다이얼로그가 있으면 그것만 닫는다.
 * true 를 돌려주면 호출부의 onBeforeRouteLeave 가 이동을 취소한다 — vue-router 가 주소를 되돌린다.
 * 모바일 관례대로 뒤로가기가 시트만 닫게 한다. 그러지 않으면 대기실 누적 순위 시트를 연 채 뒤로가기를 누르면
 * 방을 나가 코드를 다시 넣어야 했다(11/01 QA 탐색 EX-01).
 *
 * 뒤로가기인지는 isHistoryBackNavigation 으로 가른다 — 시트 안 버튼이 부른 이동(예: 지난 라운드 기록 보기)은 막지 않는다.
 *
 * 닫기는 Reka 의 Escape 처리에 맡긴다 — 맨 위 레이어 하나만 닫히고, 처리 중이라 닫을 수 없는 시트는 그대로 남는다.
 */
export function closeOpenSheetOnHistoryBack(to: Pick<RouteLocationNormalized, 'fullPath'>): boolean {
  if (!isHistoryBackNavigation(to)) return false
  if (document.querySelector(OPEN_OVERLAY_SELECTOR) === null) return false
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  return true
}
