import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CapturedPhoto } from '../composables/usePhotoCapture'

const submitKillshotMock = vi.fn<(code: string, input: Record<string, unknown>) => Promise<void>>()
/** 제출에 쓴 문서 id — 기존 검증(코드·내용 두 인자)을 그대로 두려고 따로 받는다 */
const submittedIds: string[] = []
const submissionExistsMock = vi.fn<(code: string, id: string) => Promise<boolean>>()

vi.mock('@/features/round-ops', () => ({
  SUBMISSION_PHOTO_PREFIX: 'data:image/jpeg;base64,',
  SUBMISSION_PHOTO_MAX_LENGTH: 900000,
  newSubmissionId: () => 'sub-new',
  submissionExists: (code: string, id: string) => submissionExistsMock(code, id),
  submitKillshot: (code: string, input: Record<string, unknown>, id: string) => {
    submittedIds.push(id)
    return submitKillshotMock(code, input)
  },
}))

import { SUBMIT_SLOW_MS, useKillshotSubmit } from '../composables/useKillshotSubmit'

const PENDING_KEY = 'pr:pending-killshot'
/** 1x1 JPEG 의 앞부분 — 되살리기 테스트가 Blob 으로 풀 수 있는 실제 base64 */
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=='

function storedPending(overrides: Record<string, unknown> = {}) {
  localStorage.setItem(
    PENDING_KEY,
    JSON.stringify({
      roomCode: 'AB2C',
      uid: 'player1',
      team: 'A',
      round: 1,
      submissionId: 'sub-old',
      photo: TINY_JPEG,
      width: 640,
      height: 480,
      ...overrides,
    }),
  )
}

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
    fillRect: vi.fn<(x: number, y: number, w: number, h: number) => void>(),
    drawImage,
  } as unknown as CanvasRenderingContext2D)
  return drawImage
}

function capturedPhoto(): CapturedPhoto {
  return { blob: new Blob(['frame'], { type: 'image/jpeg' }), url: 'blob:x', width: 1920, height: 1080 }
}

function input() {
  return { roomCode: 'AB2C', uid: 'player1', team: 'A', round: 1, photo: capturedPhoto(), heat: 6 }
}

beforeEach(() => {
  localStorage.clear()
  submittedIds.length = 0
  submissionExistsMock.mockReset().mockResolvedValue(false)
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
      // 과열(P19) — 콕핏이 넘긴 열을 그대로 제출 배치에 싣는다
      heat: 6,
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

  /** 10/28 최종 QA D4 — 끊긴 채 제출하면 스피너만 돌았고, 그때 닫으면 사진이 조용히 사라졌다 */
  describe('끊긴 채 제출', () => {
    it('보내기 직전에 사진을 남겨 두고, 서버가 확인하면 지운다', async () => {
      stubBitmap()
      stubToDataURL('data:image/jpeg;base64,small')
      let resolveSubmit!: () => void
      submitKillshotMock.mockReturnValueOnce(
        new Promise<void>((resolvePromise) => {
          resolveSubmit = resolvePromise
        }),
      )
      const { submit, isSubmitting } = useKillshotSubmit()

      const pending = submit(input())
      await vi.waitFor(() => expect(isSubmitting.value).toBe(true))
      await vi.waitFor(() => expect(localStorage.getItem(PENDING_KEY)).not.toBeNull())
      expect(JSON.parse(localStorage.getItem(PENDING_KEY)!)).toMatchObject({
        roomCode: 'AB2C',
        uid: 'player1',
        round: 1,
        submissionId: 'sub-new',
        photo: 'data:image/jpeg;base64,small',
      })

      resolveSubmit()
      await expect(pending).resolves.toBe(true)
      expect(localStorage.getItem(PENDING_KEY)).toBeNull()
      expect(submittedIds).toEqual(['sub-new'])
    })

    it(`${SUBMIT_SLOW_MS}ms 가 지나도 서버 확인이 없으면 isSlow 를 켜고, 끝나면 끈다`, async () => {
      stubBitmap()
      stubToDataURL('data:image/jpeg;base64,small')
      let resolveSubmit!: () => void
      submitKillshotMock.mockReturnValueOnce(
        new Promise<void>((resolvePromise) => {
          resolveSubmit = resolvePromise
        }),
      )
      vi.useFakeTimers()
      try {
        const { submit, isSlow } = useKillshotSubmit()
        const pending = submit(input())
        await vi.advanceTimersByTimeAsync(SUBMIT_SLOW_MS - 1)
        expect(isSlow.value).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        expect(isSlow.value).toBe(true)

        resolveSubmit()
        await pending
        expect(isSlow.value).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('거부됐는데 같은 id 가 이미 서버에 있으면 성공이다 — 먼저 보낸 쪽이 늦게 도착한 경우', async () => {
      stubBitmap()
      stubToDataURL('data:image/jpeg;base64,small')
      submitKillshotMock.mockRejectedValueOnce(new Error('permission-denied'))
      submissionExistsMock.mockResolvedValueOnce(true)
      const { submit } = useKillshotSubmit()

      await expect(submit({ ...input(), submissionId: 'sub-old' })).resolves.toBe(true)

      expect(submittedIds).toEqual(['sub-old'])
      expect(submissionExistsMock).toHaveBeenCalledWith('AB2C', 'sub-old')
      expect(localStorage.getItem(PENDING_KEY)).toBeNull()
    })

    it('거부되면(마감 이후 도착 등) 남겨 둔 사진을 지우고 실패를 돌려준다', async () => {
      stubBitmap()
      stubToDataURL('data:image/jpeg;base64,small')
      submitKillshotMock.mockRejectedValueOnce(new Error('permission-denied'))
      const { submit } = useKillshotSubmit()

      await expect(submit(input())).resolves.toBe(false)

      expect(localStorage.getItem(PENDING_KEY)).toBeNull()
    })
  })

  describe('resumePending — 다시 연 콕핏', () => {
    it('남은 킬샷이 없거나 다른 방·다른 사람 것이면 건드리지 않는다', async () => {
      const { resumePending } = useKillshotSubmit()
      await expect(resumePending('AB2C', 'player1', 1)).resolves.toEqual({ status: 'none' })

      storedPending({ roomCode: 'ZZ9Z' })
      await expect(resumePending('AB2C', 'player1', 1)).resolves.toEqual({ status: 'none' })
      storedPending({ uid: 'someone' })
      await expect(resumePending('AB2C', 'player1', 1)).resolves.toEqual({ status: 'none' })
      expect(localStorage.getItem(PENDING_KEY)).not.toBeNull()
    })

    it('지난 차수의 킬샷이면 지우고 expired 를 돌려준다', async () => {
      storedPending({ round: 1 })
      const { resumePending } = useKillshotSubmit()

      await expect(resumePending('AB2C', 'player1', 2)).resolves.toEqual({ status: 'expired' })
      expect(localStorage.getItem(PENDING_KEY)).toBeNull()
    })

    it('닫기 전에 서버에 도착해 있었으면 지우고 landed 를 돌려준다', async () => {
      storedPending()
      submissionExistsMock.mockResolvedValueOnce(true)
      const { resumePending } = useKillshotSubmit()

      await expect(resumePending('AB2C', 'player1', 1)).resolves.toEqual({ status: 'landed' })
      expect(submissionExistsMock).toHaveBeenCalledWith('AB2C', 'sub-old')
      expect(localStorage.getItem(PENDING_KEY)).toBeNull()
    })

    it('서버에 없으면 사진과 처음 정한 id 를 돌려준다 — 서버를 못 물어봐도(오프라인) 되살린다', async () => {
      storedPending()
      submissionExistsMock.mockRejectedValueOnce(new Error('offline'))
      const { resumePending } = useKillshotSubmit()

      const resumed = await resumePending('AB2C', 'player1', 1)

      expect(resumed).toMatchObject({ status: 'restored', width: 640, height: 480, submissionId: 'sub-old' })
      if (resumed.status !== 'restored') throw new Error('unreachable')
      expect(resumed.blob.type).toBe('image/jpeg')
      expect(resumed.blob.size).toBeGreaterThan(0)
      // 다시 보내기 전까지는 남겨 둔다 — 또 닫아도 다음에 다시 되살린다
      expect(localStorage.getItem(PENDING_KEY)).not.toBeNull()
    })
  })
})
