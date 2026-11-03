import { ref } from 'vue'

/** 같은 화면 안에서 한 단계 뒤로 가는 헤더 버튼 — 라우트 이동이 아니라 페이지 상태를 되돌린다 */
export interface AppHeaderBackAction {
  /** 버튼의 접근성 라벨 */
  label: string
  run: () => void
}

/**
 * 앱 셸 공용 헤더(AppHeader)의 타이틀·설명·이탈 링크 런타임 오버라이드.
 *
 * 기본값은 라우트 meta(appHeaderTitle·appHeaderDescription·appHeaderBackTo)가 제공한다. 한 라우트
 * 안에서 상태에 따라 페이지 타이틀이 바뀌는 화면(예: 대기실 → 팀 배정 보드/라운드 카드)은
 * setHeader로 이 값을 덮어써서 헤더 한 곳에만 제목이 뜨게 한다(자체 h1 중복 금지).
 * 이탈 링크도 같은 방식이다 — meta로 선언한 링크를 상태에 따라 setBackLinkHidden으로 잠시 숨긴다.
 * 라우트가 아니라 페이지 안의 하위 화면(예: 대기실 위에 열린 배정 보드)에서 빠져나와야 하면
 * setBackAction으로 같은 자리에 버튼을 둔다 — meta 이탈 링크보다 우선한다.
 * 화면을 벗어날 때는 clearHeader로 비워 meta 기본값으로 되돌린다.
 */
const title = ref<string>()
const description = ref<string>()
const backLinkHidden = ref(false)
const backAction = ref<AppHeaderBackAction>()

export function useAppHeader() {
  function setHeader(nextTitle: string, nextDescription?: string) {
    title.value = nextTitle
    description.value = nextDescription
  }
  function setBackLinkHidden(hidden: boolean) {
    backLinkHidden.value = hidden
  }
  function setBackAction(nextBackAction: AppHeaderBackAction | undefined) {
    backAction.value = nextBackAction
  }
  function clearHeader() {
    title.value = undefined
    description.value = undefined
    backLinkHidden.value = false
    backAction.value = undefined
  }
  return {
    title,
    description,
    backLinkHidden,
    backAction,
    setHeader,
    setBackLinkHidden,
    setBackAction,
    clearHeader,
  }
}
