import { onScopeDispose, ref } from 'vue'

/**
 * 이 높이부터 판정 화면을 사진 위·다이얼 아래로 쌓는다. 이보다 낮으면(브라우저 주소창이 있는 390×664 등)
 * 사진을 쌓을 자리가 모자라 좌우로 놓는다.
 */
export const TALL_SCREEN_MIN_HEIGHT_PX = 760

/** 화면 높이가 판정 화면을 쌓을 만큼 되는지 — 주소창이 접히고 펴져도 따라간다 */
export function useIsTallScreen() {
  const isTall = ref(window.innerHeight >= TALL_SCREEN_MIN_HEIGHT_PX)

  function measure() {
    isTall.value = window.innerHeight >= TALL_SCREEN_MIN_HEIGHT_PX
  }

  window.addEventListener('resize', measure)
  onScopeDispose(() => window.removeEventListener('resize', measure))
  return isTall
}
