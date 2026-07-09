import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import CameraPage from '../CameraPage.vue'

// jsdom에는 URL.createObjectURL/revokeObjectURL이 없어 직접 스텁한다
const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:preview')
const revokeObjectURL = vi.fn<(url: string) => void>()
Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })

function createFakeStream() {
  const tracks = [{ stop: vi.fn<() => void>() }]
  return { getTracks: () => tracks } as unknown as MediaStream
}

function stubGetUserMedia(impl: (constraints: MediaStreamConstraints) => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>(impl),
    },
    configurable: true,
  })
}

// jsdom은 canvas 2d 컨텍스트/toBlob을 구현하지 않으므로 프로토타입을 스텁한다
function stubCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage:
      vi.fn<(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) => void>(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['frame'], { type: 'image/jpeg' })),
  )
}

/** 뷰파인더가 켜진 상태의 페이지를 만들고 비디오 해상도 메타데이터까지 채운다 */
async function mountWithActiveCamera() {
  stubGetUserMedia(() => Promise.resolve(createFakeStream()))
  const wrapper = mount(CameraPage)
  await flushPromises()

  const video = wrapper.find('video').element
  Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true })
  Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true })
  return wrapper
}

function findButtonByText(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((button) => button.text() === text)
}

beforeEach(() => {
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('CameraPage', () => {
  it('마운트 시 카메라를 켜고 비디오에 스트림을 연결한다', async () => {
    const stream = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))

    const wrapper = mount(CameraPage)
    await flushPromises()

    const video = wrapper.find('video')
    expect(video.isVisible()).toBe(true)
    expect(video.element.srcObject).toBe(stream)
  })

  it('스트림이 활성화되면 촬영 버튼을 보여준다', async () => {
    const wrapper = await mountWithActiveCamera()

    expect(findButtonByText(wrapper, '촬영')).toBeDefined()
  })

  it('촬영 버튼을 누르면 현재 프레임을 캡처해 미리보기를 보여준다', async () => {
    stubCanvas()
    const wrapper = await mountWithActiveCamera()

    await findButtonByText(wrapper, '촬영')!.trigger('click')
    await flushPromises()

    const preview = wrapper.find('img')
    expect(preview.exists()).toBe(true)
    expect(preview.attributes('src')).toBe('blob:preview')
    expect(findButtonByText(wrapper, '촬영')).toBeUndefined()
  })

  it('다시 찍기를 누르면 미리보기를 닫고 뷰파인더로 돌아간다', async () => {
    stubCanvas()
    const wrapper = await mountWithActiveCamera()
    await findButtonByText(wrapper, '촬영')!.trigger('click')
    await flushPromises()

    await findButtonByText(wrapper, '다시 찍기')!.trigger('click')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(findButtonByText(wrapper, '촬영')).toBeDefined()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })

  it('권한 거부 시 안내 문구와 다시 시도 버튼을 보여준다', async () => {
    stubGetUserMedia(() => Promise.reject(new DOMException('denied', 'NotAllowedError')))

    const wrapper = mount(CameraPage)
    await flushPromises()

    expect(wrapper.find('video').isVisible()).toBe(false)
    expect(wrapper.text()).toContain('카메라 권한이 거부되었습니다')
    expect(wrapper.find('button').text()).toBe('다시 시도')
  })

  it('다시 시도 버튼을 누르면 카메라 켜기를 재시도한다', async () => {
    stubGetUserMedia(() => Promise.reject(new DOMException('denied', 'NotAllowedError')))
    const wrapper = mount(CameraPage)
    await flushPromises()

    const stream = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('video').isVisible()).toBe(true)
    expect(wrapper.find('video').element.srcObject).toBe(stream)
  })

  it('언마운트 시 스트림 트랙을 정지한다', async () => {
    const stream = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))

    const wrapper = mount(CameraPage)
    await flushPromises()
    wrapper.unmount()

    stream.getTracks().forEach((track) => expect(track.stop).toHaveBeenCalledOnce())
  })
})
