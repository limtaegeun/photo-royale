import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { usePhotoCapture } from '../composables/usePhotoCapture'

// jsdom에는 URL.createObjectURL/revokeObjectURL이 없어 직접 스텁한다
let urlSeq = 0
const createObjectURL = vi.fn<(blob: Blob) => string>(() => `blob:preview-${++urlSeq}`)
const revokeObjectURL = vi.fn<(url: string) => void>()
Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })

function createFakeVideo(width = 640, height = 480) {
  return { videoWidth: width, videoHeight: height } as unknown as HTMLVideoElement
}

// jsdom은 canvas 2d 컨텍스트/toBlob을 구현하지 않으므로 프로토타입을 스텁한다
function stubCanvas(blob: Blob | null = new Blob(['frame'], { type: 'image/jpeg' })) {
  const drawImage =
    vi.fn<(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) => void>()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(blob))
  return { drawImage }
}

function setupInScope() {
  const scope = effectScope()
  const capturer = scope.run(() => usePhotoCapture())!
  return { scope, capturer }
}

beforeEach(() => {
  urlSeq = 0
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('usePhotoCapture', () => {
  it('비디오의 현재 프레임을 원본 해상도로 캡처해 미리보기 URL을 만든다', async () => {
    const { drawImage } = stubCanvas()
    const video = createFakeVideo(640, 480)
    const { capturer } = setupInScope()

    const result = await capturer.capture(video)

    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480)
    expect(result).not.toBeNull()
    expect(capturer.photo.value).toEqual({
      blob: expect.any(Blob),
      url: 'blob:preview-1',
      width: 640,
      height: 480,
    })
    expect(capturer.failed.value).toBe(false)
  })

  it('스트림 메타데이터가 없으면(해상도 0) 실패 처리한다', async () => {
    stubCanvas()
    const { capturer } = setupInScope()

    const result = await capturer.capture(createFakeVideo(0, 0))

    expect(result).toBeNull()
    expect(capturer.failed.value).toBe(true)
    expect(capturer.photo.value).toBeNull()
  })

  it('Blob 인코딩에 실패하면 실패 처리한다', async () => {
    stubCanvas(null)
    const { capturer } = setupInScope()

    const result = await capturer.capture(createFakeVideo())

    expect(result).toBeNull()
    expect(capturer.failed.value).toBe(true)
  })

  it('clear 시 미리보기 URL을 해제하고 사진을 비운다', async () => {
    stubCanvas()
    const { capturer } = setupInScope()

    await capturer.capture(createFakeVideo())
    capturer.clear()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
    expect(capturer.photo.value).toBeNull()
  })

  it('다시 캡처하면 이전 미리보기 URL을 해제한다', async () => {
    stubCanvas()
    const { capturer } = setupInScope()

    await capturer.capture(createFakeVideo())
    await capturer.capture(createFakeVideo())

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
    expect(capturer.photo.value?.url).toBe('blob:preview-2')
  })

  it('스코프가 해제되면 미리보기 URL을 자동으로 해제한다', async () => {
    stubCanvas()
    const { scope, capturer } = setupInScope()

    await capturer.capture(createFakeVideo())
    scope.stop()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
  })
})
