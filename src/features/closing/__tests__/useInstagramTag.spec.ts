import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastMock = vi.fn<(options: { title: string; tone?: string }) => number>()
vi.mock('@/shared/composables/useToast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

import {
  INSTAGRAM_ANDROID_INTENT_URL,
  INSTAGRAM_APP_URL,
  INSTAGRAM_TAG_TEXT,
  INSTAGRAM_WEB_URL,
  OPEN_APP_DELAY_MS,
  WEB_FALLBACK_DELAY_MS,
  useInstagramTag,
} from '../composables/useInstagramTag'

const writeTextMock = vi.fn<(text: string) => Promise<void>>()
let visibility: DocumentVisibilityState = 'visible'

describe('useInstagramTag', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    toastMock.mockReset()
    writeTextMock.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    })
    visibility = 'visible'
    Object.defineProperty(document, 'visibilityState', {
      get: () => visibility,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('태그를 복사하고 안내를 띄운 뒤, 안내를 읽을 틈을 두고 인스타그램 앱의 계정 화면을 연다', async () => {
    const navigate = vi.fn<(url: string) => void>()
    const { shareTag } = useInstagramTag({ navigate })

    await shareTag()

    expect(writeTextMock).toHaveBeenCalledWith('#포토로얄 @photoroyales')
    expect(INSTAGRAM_TAG_TEXT).toBe('#포토로얄 @photoroyales')
    expect(toastMock).toHaveBeenCalledWith({
      title: '태그를 복사했어요. 게시물에 붙여 넣어 주세요!',
      tone: 'success',
    })
    expect(navigate).not.toHaveBeenCalled()

    vi.advanceTimersByTime(OPEN_APP_DELAY_MS)
    expect(navigate).toHaveBeenCalledWith(INSTAGRAM_APP_URL)
    expect(INSTAGRAM_APP_URL).toBe('instagram://user?username=photoroyales')
  })

  it('앱을 부른 뒤에도 화면이 그대로면(앱이 없으면) 웹 프로필을 연다', async () => {
    const navigate = vi.fn<(url: string) => void>()
    const { shareTag } = useInstagramTag({ navigate })

    await shareTag()
    vi.advanceTimersByTime(OPEN_APP_DELAY_MS + WEB_FALLBACK_DELAY_MS)

    expect(navigate.mock.calls).toEqual([[INSTAGRAM_APP_URL], [INSTAGRAM_WEB_URL]])
    expect(INSTAGRAM_WEB_URL).toBe('https://www.instagram.com/photoroyales/')
  })

  it('앱으로 넘어가 화면이 숨겨지면 웹 프로필로 넘기지 않는다', async () => {
    const navigate = vi.fn<(url: string) => void>()
    const { shareTag } = useInstagramTag({ navigate })

    await shareTag()
    vi.advanceTimersByTime(OPEN_APP_DELAY_MS)
    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(WEB_FALLBACK_DELAY_MS)

    expect(navigate.mock.calls).toEqual([[INSTAGRAM_APP_URL]])
  })

  it('복사가 실패해도 태그를 직접 적으라고 알리고 계정은 연다', async () => {
    writeTextMock.mockRejectedValue(new Error('denied'))
    const navigate = vi.fn<(url: string) => void>()
    const { shareTag } = useInstagramTag({ navigate })

    await shareTag()
    vi.advanceTimersByTime(OPEN_APP_DELAY_MS)

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'danger', title: expect.stringContaining(INSTAGRAM_TAG_TEXT) }),
    )
    expect(navigate).toHaveBeenCalledWith(INSTAGRAM_APP_URL)
  })

  it('안드로이드는 앱 주소를 intent:// 로 한 번만 부르고, 앱 유무에 따른 웹 이동은 크롬에 맡긴다', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 16; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36',
    )
    const navigate = vi.fn<(url: string) => void>()
    const { shareTag } = useInstagramTag({ navigate })

    await shareTag()
    vi.advanceTimersByTime(OPEN_APP_DELAY_MS + WEB_FALLBACK_DELAY_MS)

    expect(navigate.mock.calls).toEqual([[INSTAGRAM_ANDROID_INTENT_URL]])
    expect(INSTAGRAM_ANDROID_INTENT_URL).toBe(
      'intent://user?username=photoroyales#Intent;scheme=instagram;S.browser_fallback_url=https%3A%2F%2Fwww.instagram.com%2Fphotoroyales%2F;end',
    )
  })
})
