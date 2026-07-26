import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CapturedPhoto } from '../composables/usePhotoCapture'

const submitKillshotMock = vi.fn<(code: string, input: Record<string, unknown>) => Promise<void>>()

vi.mock('@/features/round-ops', () => ({
  SUBMISSION_PHOTO_PREFIX: 'data:image/jpeg;base64,',
  SUBMISSION_PHOTO_MAX_LENGTH: 900000,
  submitKillshot: (code: string, input: Record<string, unknown>) =>
    submitKillshotMock(code, input),
}))

import { useKillshotSubmit } from '../composables/useKillshotSubmit'

const bitmapCloseMock = vi.fn<() => void>()

function stubBitmap(width = 1920, height = 1080) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width, height, close: bitmapCloseMock })),
  )
}

/** 인코딩 단계마다 반환할 데이터 URL을 순서대로 지정한다 */
function stubToDataURL(...results: string[]) {
  const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
  for (const result of results) toDataURL.mockReturnValueOnce(result)
  return toDataURL
}

function stubCanvasContext() {
  const drawImage = vi.fn<(image: CanvasImageSource, dx: number, dy: number) => void>()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D)
  return drawImage
}

function capturedPhoto(): CapturedPhoto {
  return { blob: new Blob(['frame'], { type: 'image/jpeg' }), url: 'blob:x', width: 1920, height: 1080 }
}

function input() {
  return { roomCode: 'AB2C', uid: 'player1', team: 'A', round: 1, photo: capturedPhoto() }
}

beforeEach(() => {
  submitKillshotMock.mockReset().mockResolvedValue(undefined)
  bitmapCloseMock.mockReset()
  stubCanvasContext()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useKillshotSubmit', () => {
  it('첫 단계에서 상한 안에 들면 그대로 제출하고 비트맵을 해제한다', async () => {
    stubBitmap()
    stubToDataURL('data:image/jpeg;base64,small')
    const { submit } = useKillshotSubmit()

    await expect(submit(input())).resolves.toBe(true)

    expect(submitKillshotMock).toHaveBeenCalledExactlyOnceWith('AB2C', {
      uid: 'player1',
      team: 'A',
      round: 1,
      photo: 'data:image/jpeg;base64,small',
    })
    expect(bitmapCloseMock).toHaveBeenCalledTimes(1)
  })

  it('상한을 넘으면 더 작은 단계로 재시도해 통과한 결과를 제출한다', async () => {
    stubBitmap()
    const oversized = `data:image/jpeg;base64,${'a'.repeat(900001)}`
    stubToDataURL(oversized, 'data:image/jpeg;base64,retried')
    const { submit } = useKillshotSubmit()

    await expect(submit(input())).resolves.toBe(true)

    expect(submitKillshotMock.mock.calls[0]![1]).toMatchObject({
      photo: 'data:image/jpeg;base64,retried',
    })
  })

  it('모든 단계가 상한을 넘으면 제출하지 않고 실패를 돌려준다', async () => {
    stubBitmap()
    const oversized = `data:image/jpeg;base64,${'a'.repeat(900001)}`
    stubToDataURL(oversized, oversized, oversized)
    const { submit } = useKillshotSubmit()

    await expect(submit(input())).resolves.toBe(false)

    expect(submitKillshotMock).not.toHaveBeenCalled()
    expect(bitmapCloseMock).toHaveBeenCalledTimes(1)
  })

  it('JPEG 인코딩이 안 되는 환경(다른 접두)에서는 rules가 거부할 값을 보내지 않는다', async () => {
    stubBitmap()
    stubToDataURL('data:,', 'data:,', 'data:,')
    const { submit } = useKillshotSubmit()

    await expect(submit(input())).resolves.toBe(false)

    expect(submitKillshotMock).not.toHaveBeenCalled()
  })

  it('전송 실패는 false로 수렴하고 isSubmitting을 되돌린다', async () => {
    stubBitmap()
    stubToDataURL('data:image/jpeg;base64,small')
    submitKillshotMock.mockRejectedValueOnce(new Error('offline'))
    const { submit, isSubmitting } = useKillshotSubmit()

    await expect(submit(input())).resolves.toBe(false)
    expect(isSubmitting.value).toBe(false)
  })

  it('제출 중 중복 호출은 무시한다 — 셔터 연타로 킬샷이 두 번 쌓이지 않게', async () => {
    stubBitmap()
    stubToDataURL('data:image/jpeg;base64,small')
    let resolveSubmit!: () => void
    submitKillshotMock.mockReturnValueOnce(
      new Promise<void>((resolvePromise) => {
        resolveSubmit = resolvePromise
      }),
    )
    const { submit, isSubmitting } = useKillshotSubmit()

    const first = submit(input())
    // 인코딩(비동기)이 끝나 전송 대기 상태가 될 때까지 기다린다
    await vi.waitFor(() => expect(isSubmitting.value).toBe(true))
    const second = submit(input())

    await expect(second).resolves.toBe(false)
    resolveSubmit()
    await expect(first).resolves.toBe(true)
    expect(submitKillshotMock).toHaveBeenCalledTimes(1)
  })
})
