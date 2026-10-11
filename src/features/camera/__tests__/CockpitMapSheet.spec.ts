import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CockpitMapSheet from '../components/CockpitMapSheet.vue'

const MAP_IMAGE = 'data:image/jpeg;base64,venue-map'

/** 시트는 포털로 body에 렌더된다 — 포털 마운트를 기다린 뒤 document.body에서 확인한다 */
async function mountSheet(open = true) {
  const wrapper = mount(CockpitMapSheet, { props: { mapImage: MAP_IMAGE, open } })
  await flushPromises()
  return wrapper
}

describe('CockpitMapSheet', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('제목과 등록된 지도 이미지, 안전 수칙 한 줄을 보여준다', async () => {
    await mountSheet()

    const text = document.body.textContent ?? ''
    expect(text).toContain('행사장 지도')
    expect(text).toContain('무리한 추격, 도로 진입, 촬영 중 충돌을 피하고 진행자 안내를 우선합니다.')

    const image = document.body.querySelector<HTMLImageElement>('img[alt="행사장 지도"]')
    expect(image).not.toBeNull()
    expect(image!.getAttribute('src')).toBe(MAP_IMAGE)
  })

  it('지도를 누르면 화면 전체로 크게 열리고, 링크·다운로드 경로는 없다', async () => {
    await mountSheet()

    const image = document.body.querySelector<HTMLImageElement>('img[alt="행사장 지도"]')!
    const preview = image.closest('button')!
    expect(preview.getAttribute('aria-label')).toBe('행사장 지도 크게 보기')
    expect(document.body.querySelector('a')).toBeNull()
    expect(document.body.querySelector('[download]')).toBeNull()

    preview.click()
    await flushPromises()

    // 시트 위에 크게 보기가 겹쳐 열린다 — 같은 지도를 그대로 그리고 확대·축소 버튼이 있다
    const viewerImages = document.body.querySelectorAll<HTMLImageElement>('img[alt="행사장 지도"]')
    expect(viewerImages).toHaveLength(2)
    expect(viewerImages[1]!.getAttribute('src')).toBe(MAP_IMAGE)
    expect(document.body.querySelector('button[aria-label="확대"]')).not.toBeNull()
    expect(document.body.querySelector('button[aria-label="축소"]')).not.toBeNull()
  })

  it('닫혀 있으면 아무것도 렌더하지 않는다', async () => {
    await mountSheet(false)

    expect(document.body.querySelector('img[alt="행사장 지도"]')).toBeNull()
    expect(document.body.textContent ?? '').not.toContain('행사장 지도')
  })
})
