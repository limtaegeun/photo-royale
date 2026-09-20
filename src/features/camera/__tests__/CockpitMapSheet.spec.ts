import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CockpitMapSheet from '../components/CockpitMapSheet.vue'

const MAP_URL = 'https://cdn.example.com/venue/map.png'

/** 시트는 포털로 body에 렌더된다 — 포털 마운트를 기다린 뒤 document.body에서 확인한다 */
async function mountSheet(open = true) {
  const wrapper = mount(CockpitMapSheet, { props: { mapImageUrl: MAP_URL, open } })
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
    expect(image!.getAttribute('src')).toBe(MAP_URL)
  })

  it('이미지는 스크롤·핀치 줌이 되는 상자 안에 있고 링크·다운로드 경로가 없다', async () => {
    await mountSheet()

    const image = document.body.querySelector<HTMLImageElement>('img[alt="행사장 지도"]')!
    const box = image.parentElement!
    expect(box.className).toContain('overflow-auto')
    expect(box.className).toContain('touch-pinch-zoom')
    expect(document.body.querySelector('a')).toBeNull()
    expect(document.body.querySelector('[download]')).toBeNull()
  })

  it('닫혀 있으면 아무것도 렌더하지 않는다', async () => {
    await mountSheet(false)

    expect(document.body.querySelector('img[alt="행사장 지도"]')).toBeNull()
    expect(document.body.textContent ?? '').not.toContain('행사장 지도')
  })
})
