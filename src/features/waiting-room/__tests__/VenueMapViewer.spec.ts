import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import VenueMapViewer from '../components/VenueMapViewer.vue'

const MAP_IMAGE = 'data:image/jpeg;base64,venue-map'

/** 크게 보기는 포털로 body에 렌더된다 — 포털 마운트를 기다린 뒤 document.body에서 확인한다 */
async function mountViewer() {
  const wrapper = mount(VenueMapViewer, { props: { image: MAP_IMAGE, open: true } })
  await flushPromises()
  return wrapper
}

const viewerImage = () => document.body.querySelector<HTMLImageElement>('img[alt="행사장 지도"]')!
const button = (label: string) => document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!

/** jsdom 은 이미지를 읽지 않는다 — 원본 크기를 정해 load 를 직접 보낸다 */
async function loadImage(width: number, height: number) {
  const image = viewerImage()
  Object.defineProperty(image, 'naturalWidth', { value: width, configurable: true })
  Object.defineProperty(image, 'naturalHeight', { value: height, configurable: true })
  image.dispatchEvent(new Event('load'))
  await flushPromises()
}

describe('VenueMapViewer', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('제목과 받아 둔 지도, 닫기·축소·확대 버튼을 화면 전체로 보여준다', async () => {
    await mountViewer()

    expect(document.body.textContent ?? '').toContain('행사장 지도')
    expect(viewerImage().getAttribute('src')).toBe(MAP_IMAGE)
    expect(button('닫기')).not.toBeNull()
    expect(button('축소')).not.toBeNull()
    expect(button('확대')).not.toBeNull()
    // 손가락 동작은 브라우저 화면 확대가 아니라 지도가 받는다
    expect(document.body.querySelector('[data-testid="venue-map-stage"]')!.className).toContain('touch-none')
  })

  it('맞춤 크기에서 시작해 축소는 막혀 있고, 확대하면 지도가 커지고 축소가 열린다', async () => {
    await mountViewer()
    await loadImage(2000, 1500)

    expect(button('축소').disabled).toBe(true)
    expect(button('확대').disabled).toBe(false)

    button('확대').click()
    await flushPromises()

    expect(viewerImage().style.transform).toContain('scale(2)')
    expect(button('축소').disabled).toBe(false)
  })

  it('닫기를 누르면 닫힌다', async () => {
    const wrapper = await mountViewer()

    button('닫기').click()
    await flushPromises()

    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })
})
