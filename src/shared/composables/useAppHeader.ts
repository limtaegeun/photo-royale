import { ref } from 'vue'

/**
 * 앱 셸 공용 헤더(AppHeader)의 타이틀·설명·이탈 링크 런타임 오버라이드.
 *
 * 기본값은 라우트 meta(appHeaderTitle·appHeaderDescription·appHeaderBackTo)가 제공한다. 한 라우트
 * 안에서 상태에 따라 페이지 타이틀이 바뀌는 화면(예: 대기실 → 팀 배정 보드/라운드 카드)은
 * setHeader로 이 값을 덮어써서 헤더 한 곳에만 제목이 뜨게 한다(자체 h1 중복 금지).
 * 이탈 링크도 같은 방식이다 — meta로 선언한 링크를 상태에 따라 setBackLinkHidden으로 잠시 숨긴다.
 * 화면을 벗어날 때는 clearHeader로 비워 meta 기본값으로 되돌린다.
 */
const title = ref<string>()
const description = ref<string>()
const backLinkHidden = ref(false)

export function useAppHeader() {
  function setHeader(nextTitle: string, nextDescription?: string) {
    title.value = nextTitle
    description.value = nextDescription
  }
  function setBackLinkHidden(hidden: boolean) {
    backLinkHidden.value = hidden
  }
  function clearHeader() {
    title.value = undefined
    description.value = undefined
    backLinkHidden.value = false
  }
  return { title, description, backLinkHidden, setHeader, setBackLinkHidden, clearHeader }
}
