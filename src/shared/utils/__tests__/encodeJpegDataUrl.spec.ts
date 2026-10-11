import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { JPEG_DATA_URL_PREFIX, encodeBitmapAsJpegDataUrl, encodeJpegDataUrl } from '../encodeJpegDataUrl'

const STEPS = [
  { maxEdge: 2000, quality: 0.8 },
  { maxEdge: 1000, quality: 0.6 },
] as const

const bitmapCloseMock = vi.fn<() => void>()

function stubBitmap(width: number, height: number) {
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

/** 그리기 순서를 한 목록에 남긴다 — 바탕을 먼저 칠하고 이미지를 그려야 투명 픽셀이 흰색이 된다 */
function stubCanvasContext() {
  const calls: string[] = []
  const fillRect = vi.fn<(x: number, y: number, w: number, h: number) => void>()
  const drawImage = vi.fn<(image: CanvasImageSource, ...rest: number[]) => void>()
  const context = { fillStyle: '', fillRect, drawImage }
  fillRect.mockImplementation(() => {
    calls.push(`fillRect:${context.fillStyle}`)
  })
  drawImage.mockImplementation(() => {
    calls.push('drawImage')
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  return { context, calls }
}

const source = new Blob(['image'], { type: 'image/png' })

beforeEach(() => {
  bitmapCloseMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('encodeJpegDataUrl', () => {
  it('긴 변을 첫 단계 크기로 줄여 흰 바탕 위에 그리고, 상한 안의 JPEG 데이터 URL을 돌려준다', async () => {
    stubBitmap(4000, 3000)
    const { context, calls } = stubCanvasContext()
    const toDataURL = stubToDataURL(`${JPEG_DATA_URL_PREFIX}small`)

    await expect(encodeJpegDataUrl(source, STEPS, 100)).resolves.toBe(`${JPEG_DATA_URL_PREFIX}small`)

    expect(calls).toEqual(['fillRect:#ffffff', 'drawImage'])
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 2000, 1500)
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2000, 1500)
    expect(toDataURL).toHaveBeenCalledExactlyOnceWith('image/jpeg', 0.8)
    expect(bitmapCloseMock).toHaveBeenCalledTimes(1)
  })

  it('이미 작은 이미지는 키우지 않는다', async () => {
    stubBitmap(800, 600)
    const { context } = stubCanvasContext()
    stubToDataURL(`${JPEG_DATA_URL_PREFIX}small`)

    await encodeJpegDataUrl(source, STEPS, 100)

    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 600)
  })

  it('상한을 넘으면 다음 단계(더 작게·낮은 품질)로 다시 인코딩한다', async () => {
    stubBitmap(4000, 3000)
    const { context } = stubCanvasContext()
    const oversized = `${JPEG_DATA_URL_PREFIX}${'a'.repeat(100)}`
    const toDataURL = stubToDataURL(oversized, `${JPEG_DATA_URL_PREFIX}retried`)

    await expect(encodeJpegDataUrl(source, STEPS, 100)).resolves.toBe(`${JPEG_DATA_URL_PREFIX}retried`)

    expect(toDataURL).toHaveBeenNthCalledWith(2, 'image/jpeg', 0.6)
    expect(context.drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 1000, 750)
  })

  it('모든 단계가 상한을 넘으면 null이고 비트맵은 해제한다', async () => {
    stubBitmap(4000, 3000)
    stubCanvasContext()
    const oversized = `${JPEG_DATA_URL_PREFIX}${'a'.repeat(100)}`
    stubToDataURL(oversized, oversized)

    await expect(encodeJpegDataUrl(source, STEPS, 100)).resolves.toBeNull()
    expect(bitmapCloseMock).toHaveBeenCalledTimes(1)
  })

  it('JPEG 인코딩이 안 되는 환경(다른 접두)이면 null — rules가 거부할 값을 돌려주지 않는다', async () => {
    stubBitmap(800, 600)
    stubCanvasContext()
    stubToDataURL('data:,', 'data:,')

    await expect(encodeJpegDataUrl(source, STEPS, 100)).resolves.toBeNull()
  })

  it('이미지를 읽지 못하면(손상·미지원 형식) 던지지 않고 null', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new DOMException('The source image could not be decoded.', 'InvalidStateError')
      }),
    )

    await expect(encodeJpegDataUrl(source, STEPS, 100)).resolves.toBeNull()
  })
})

describe('encodeBitmapAsJpegDataUrl', () => {
  it('이미 읽은 비트맵을 같은 단계로 줄이고, 비트맵은 닫지 않는다 — 읽은 쪽(다른 해독기)이 닫는다', () => {
    const close = vi.fn<() => void>()
    const bitmap = { width: 4000, height: 3000, close } as unknown as ImageBitmap
    const { context } = stubCanvasContext()
    const oversized = `${JPEG_DATA_URL_PREFIX}${'a'.repeat(100)}`
    stubToDataURL(oversized, `${JPEG_DATA_URL_PREFIX}retried`)

    expect(encodeBitmapAsJpegDataUrl(bitmap, STEPS, 100)).toBe(`${JPEG_DATA_URL_PREFIX}retried`)
    expect(context.drawImage).toHaveBeenLastCalledWith(bitmap, 0, 0, 1000, 750)
    expect(close).not.toHaveBeenCalled()
  })
})
