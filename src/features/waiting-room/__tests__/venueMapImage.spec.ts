import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { JpegEncodeStep } from '@/shared/utils/encodeJpegDataUrl'

// 문서 상한 값만 쓴다 — Firestore를 초기화하지 않는다
vi.mock('../api/venueMap', () => ({ VENUE_MAP_IMAGE_MAX_LENGTH: 1000000 }))

// 줄이고 압축하는 일은 공용 인코더 몫이다 — 여기서는 어떤 비트맵을 어떤 단계로 넘기는지만 본다
const encodeBitmapMock =
  vi.fn<(bitmap: ImageBitmap, steps: readonly JpegEncodeStep[], maxLength: number) => string | null>()
vi.mock('@/shared/utils/encodeJpegDataUrl', () => ({
  encodeBitmapAsJpegDataUrl: (bitmap: ImageBitmap, steps: readonly JpegEncodeStep[], maxLength: number) =>
    encodeBitmapMock(bitmap, steps, maxLength),
}))

// HEIC 해독기(libheif wasm)는 jsdom에서 돌지 않는다 — 받아 오기와 돌려줄 비트맵만 흉내 낸다
type HeicToArgs = { blob: Blob; type: 'bitmap' }
const heicToMock = vi.fn<(args: HeicToArgs) => Promise<ImageBitmap>>()
const loadHeicDecoderMock = vi.fn<() => Promise<{ heicTo: (args: HeicToArgs) => Promise<ImageBitmap> }>>(
  async () => ({ heicTo: (args) => heicToMock(args) }),
)
vi.mock('../heicDecoder', () => ({ loadHeicDecoder: () => loadHeicDecoderMock() }))

import { encodeVenueMapImage } from '../venueMapImage'

const ENCODED = 'data:image/jpeg;base64,venue-map'

function fakeBitmap() {
  const close = vi.fn<() => void>()
  return { bitmap: { width: 4032, height: 3024, close } as unknown as ImageBitmap, close }
}

/** ISO 미디어 파일 머리(ftyp 상자) — 주 브랜드와 호환 브랜드를 정해 HEIC·AVIF 사진을 흉내 낸다 */
function isoMediaFile(majorBrand: string, compatibleBrands: string[]) {
  const brands = [majorBrand, '\0\0\0\0', ...compatibleBrands].join('')
  const header = new Uint8Array(8 + brands.length)
  new DataView(header.buffer).setUint32(0, header.length)
  header.set([...`ftyp${brands}`].map((char) => char.charCodeAt(0)), 4)
  return new File([header, new Uint8Array(200)], 'IMG_0001.HEIC')
}

/** 이 브라우저가 못 읽는 형식 — 크롬이 HEIC를 받았을 때와 같은 거절 */
function stubNativeDecodeFailure() {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      throw new DOMException('The source image could not be decoded.', 'InvalidStateError')
    }),
  )
}

beforeEach(() => {
  encodeBitmapMock.mockReset()
  heicToMock.mockReset()
  loadHeicDecoderMock.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('encodeVenueMapImage', () => {
  it('브라우저가 읽는 사진은 그대로 읽어 문서 상한 안으로 줄이고, 다 쓴 비트맵은 닫는다', async () => {
    const { bitmap, close } = fakeBitmap()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    encodeBitmapMock.mockReturnValue(ENCODED)

    await expect(encodeVenueMapImage(new File(['jpeg'], 'map.jpg'))).resolves.toBe(ENCODED)

    expect(encodeBitmapMock).toHaveBeenCalledExactlyOnceWith(bitmap, expect.any(Array), 1000000)
    expect(heicToMock).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('크기를 줄이기 전에 2000px에서 품질부터 낮춰 본다 — 사파리는 같은 품질에서 JPEG가 커서 바로 줄이면 아이폰 지도만 작아진다', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => fakeBitmap().bitmap))
    encodeBitmapMock.mockReturnValue(ENCODED)

    await encodeVenueMapImage(new File(['jpeg'], 'map.jpg'))

    const steps = encodeBitmapMock.mock.calls[0]![1]
    expect(steps.slice(0, 3)).toEqual([
      { maxEdge: 2000, quality: 0.8 },
      { maxEdge: 2000, quality: 0.6 },
      { maxEdge: 2000, quality: 0.5 },
    ])
    // 크기는 단계가 지날수록 커지지 않는다
    expect(steps.map((step) => step.maxEdge)).toEqual(steps.map((step) => step.maxEdge).sort((a, b) => b - a))
  })

  it('브라우저가 못 읽는 HEIC(안드로이드·PC 크롬)는 해독기로 읽어 같은 단계로 줄인다', async () => {
    stubNativeDecodeFailure()
    const { bitmap, close } = fakeBitmap()
    heicToMock.mockResolvedValue(bitmap)
    encodeBitmapMock.mockReturnValue(ENCODED)
    const file = isoMediaFile('heic', ['mif1', 'MiPr', 'miaf', 'heic'])

    await expect(encodeVenueMapImage(file)).resolves.toBe(ENCODED)

    expect(heicToMock).toHaveBeenCalledExactlyOnceWith({ blob: file, type: 'bitmap' })
    expect(encodeBitmapMock).toHaveBeenCalledExactlyOnceWith(bitmap, expect.any(Array), 1000000)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('주 브랜드가 일반(mif1)이어도 호환 브랜드에 heic가 있으면 HEIC로 본다', async () => {
    stubNativeDecodeFailure()
    heicToMock.mockResolvedValue(fakeBitmap().bitmap)
    encodeBitmapMock.mockReturnValue(ENCODED)

    await expect(encodeVenueMapImage(isoMediaFile('mif1', ['heic']))).resolves.toBe(ENCODED)
    expect(heicToMock).toHaveBeenCalledTimes(1)
  })

  it('이미지가 아닌 파일은 해독기를 쓰지 않고 null', async () => {
    stubNativeDecodeFailure()

    await expect(encodeVenueMapImage(new File(['%PDF-1.7 venue map'], 'map.pdf'))).resolves.toBeNull()

    expect(loadHeicDecoderMock).not.toHaveBeenCalled()
    expect(encodeBitmapMock).not.toHaveBeenCalled()
  })

  it('HEVC가 아닌 HEIF 계열(AVIF)은 해독기를 쓰지 않는다 — 해독기가 못 푸는데 내려받게 된다', async () => {
    stubNativeDecodeFailure()

    await expect(encodeVenueMapImage(isoMediaFile('avif', ['mif1', 'miaf']))).resolves.toBeNull()
    expect(loadHeicDecoderMock).not.toHaveBeenCalled()
  })

  it('해독기를 받지 못하면(오프라인) 던지지 않고 null', async () => {
    stubNativeDecodeFailure()
    loadHeicDecoderMock.mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))

    await expect(encodeVenueMapImage(isoMediaFile('heic', ['mif1', 'heic']))).resolves.toBeNull()
    expect(encodeBitmapMock).not.toHaveBeenCalled()
  })

  it('해독기도 못 읽으면(손상된 파일) 던지지 않고 null', async () => {
    stubNativeDecodeFailure()
    heicToMock.mockRejectedValue(new Error('heif_error_Invalid_input'))

    await expect(encodeVenueMapImage(isoMediaFile('heic', ['mif1', 'heic']))).resolves.toBeNull()
    expect(encodeBitmapMock).not.toHaveBeenCalled()
  })

  it('어떤 단계로도 문서 상한을 못 맞추면 null이고 비트맵은 닫는다', async () => {
    const { bitmap, close } = fakeBitmap()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    encodeBitmapMock.mockReturnValue(null)

    await expect(encodeVenueMapImage(new File(['jpeg'], 'map.jpg'))).resolves.toBeNull()
    expect(close).toHaveBeenCalledTimes(1)
  })
})
