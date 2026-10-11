// HEIC 해독기(heic-to)는 묶음에 넣지 않고 파일 하나로 둔다 — 주소로 받아야 실패한 뒤 다른 주소로 다시 받을 수 있다
import heicToUrl from 'heic-to?url'

type HeicToModule = typeof import('heic-to')

/**
 * HEIC 해독기(heic-to, 약 3MB)를 처음 쓸 때 받는 함수를 만든다. 한 번 받으면 그 모듈을 계속 쓴다.
 * 브라우저는 실패한 모듈 가져오기를 그 화면이 살아 있는 동안 기억해 같은 주소로는 다시 받지 않는다 —
 * 오프라인에서 한 번 실패하면 온라인이 돼도 새로 고치기 전까지 HEIC가 계속 실패했다(크롬 실측, 2026-10-11).
 * 그래서 실패하면 다음 시도는 주소 뒤에 시도 번호를 붙여 새로 받는다.
 */
export function createHeicDecoderLoader(
  importModule: (url: string) => Promise<HeicToModule>,
): () => Promise<HeicToModule> {
  let loading: Promise<HeicToModule> | null = null
  let failedAttempts = 0
  return () => {
    if (loading !== null) return loading
    const url = new URL(heicToUrl, window.location.href)
    if (failedAttempts > 0) url.searchParams.set('retry', String(failedAttempts))
    loading = importModule(url.href).catch((error: unknown) => {
      loading = null
      failedAttempts += 1
      throw error
    })
    return loading
  }
}

export const loadHeicDecoder = createHeicDecoderLoader(
  (url) => import(/* @vite-ignore */ url) as Promise<HeicToModule>,
)
