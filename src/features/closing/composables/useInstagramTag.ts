import { useToast } from '@/shared/composables/useToast'

/** 포토로얄 인스타그램 계정 — 해시태그만으로는 알림이 오지 않고 비공개 계정 글은 검색되지 않아 계정 태그를 함께 부탁한다 */
export const INSTAGRAM_HANDLE = 'photoroyales'
/** 게시물에 붙여 넣을 태그 — 해시태그와 계정 태그를 한 번에 복사한다 */
export const INSTAGRAM_TAG_TEXT = `#포토로얄 @${INSTAGRAM_HANDLE}`
/** 인스타그램 앱의 계정 화면(앱이 있을 때) */
export const INSTAGRAM_APP_URL = `instagram://user?username=${INSTAGRAM_HANDLE}`
/** 앱이 없을 때 여는 웹 프로필 */
export const INSTAGRAM_WEB_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`
/**
 * 안드로이드는 같은 앱 주소를 intent:// 로 감싸 부른다. 앱 유무는 크롬이 직접 가리고, 앱이 없을 때만
 * browser_fallback_url(웹 프로필)로 간다. 타이머로 추측하지 않는다 — 앱이 1.4초에 떠도 크롬이 화면을 숨김으로
 * 바꾸는 건 2.9초여서, 타이머 방식은 앱을 연 채로 뒤 탭까지 웹으로 넘겼다(2026-11-15 에뮬레이터 크롬 145 실측).
 */
export const INSTAGRAM_ANDROID_INTENT_URL = `intent://user?username=${INSTAGRAM_HANDLE}#Intent;scheme=instagram;S.browser_fallback_url=${encodeURIComponent(INSTAGRAM_WEB_URL)};end`

/** 복사 안내를 읽을 틈 — 바로 앱으로 넘어가면 안내가 안 보인 채 화면이 바뀐다 */
export const OPEN_APP_DELAY_MS = 800
/** 앱을 부른 뒤 이 시간 동안 화면이 그대로면(앱으로 넘어가지 않았으면) 앱이 없다고 보고 웹을 연다 */
export const WEB_FALLBACK_DELAY_MS = 1500

const COPIED_MESSAGE = '태그를 복사했어요. 게시물에 붙여 넣어 주세요!'
const COPY_FAILED_MESSAGE = `복사하지 못했어요. ${INSTAGRAM_TAG_TEXT}를 직접 적어 주세요.`

interface InstagramTagOptions {
  /** 주소 이동 — 테스트가 실제 이동 대신 기록하도록 바꿔 끼운다 */
  navigate?: (url: string) => void
}

/**
 * 마무리 페이지의 @photoroyales — 누르면 두 가지가 한 번에 일어난다.
 * 1. "#포토로얄 @photoroyales"를 클립보드에 복사하고 복사 안내를 잠깐 띄운다.
 * 2. 인스타그램 앱의 계정 화면을 연다. 앱이 없으면 웹 프로필을 연다.
 *
 * 앱 유무는 브라우저가 알려 주지 않는다. 그래서 앱 주소를 부른 뒤 화면이 숨겨지는지(앱으로 넘어갔는지)를 보고,
 * 정해진 시간 안에 숨겨지지 않으면 웹 주소로 넘어간다. 복사가 실패해도 계정은 연다 — 태그는 직접 적으면 된다.
 */
export function useInstagramTag(options: InstagramTagOptions = {}) {
  const { toast } = useToast()
  const navigate = options.navigate ?? ((url: string) => window.location.assign(url))

  function openProfile() {
    if (/Android/i.test(navigator.userAgent)) {
      navigate(INSTAGRAM_ANDROID_INTENT_URL)
      return
    }
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null
    const cancelFallback = () => {
      if (fallbackTimer !== null) clearTimeout(fallbackTimer)
      fallbackTimer = null
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', cancelFallback)
    }
    // 앱이 열리면 브라우저 화면이 숨겨진다 — 그때는 웹으로 넘기지 않는다
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') cancelFallback()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', cancelFallback)
    fallbackTimer = setTimeout(() => {
      const appOpened = document.visibilityState === 'hidden'
      cancelFallback()
      if (!appOpened) navigate(INSTAGRAM_WEB_URL)
    }, WEB_FALLBACK_DELAY_MS)
    navigate(INSTAGRAM_APP_URL)
  }

  async function shareTag() {
    try {
      await navigator.clipboard.writeText(INSTAGRAM_TAG_TEXT)
      toast({ title: COPIED_MESSAGE, tone: 'success' })
    } catch {
      toast({ title: COPY_FAILED_MESSAGE, tone: 'danger' })
    }
    setTimeout(openProfile, OPEN_APP_DELAY_MS)
  }

  return { shareTag }
}
