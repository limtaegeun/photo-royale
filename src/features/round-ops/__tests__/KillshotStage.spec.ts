import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import KillshotStage from '../components/KillshotStage.vue'

/** jsdom의 trigger는 clientX를 넣지 못한다 — 좌표가 든 이벤트를 직접 보낸다 */
async function pointer(wrapper: ReturnType<typeof mountStage>, type: string, clientX = 0, clientY = 0) {
  wrapper
    .get('[data-testid="killshot-stage"]')
    .element.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true }))
  await wrapper.vm.$nextTick()
}

function mountStage() {
  const wrapper = mount(KillshotStage, { props: { photo: 'data:image/jpeg;base64,x', alt: '판정할 킬샷' } })
  const shot = wrapper.get<HTMLImageElement>('img[alt="판정할 킬샷"]').element
  Object.defineProperty(shot, 'naturalWidth', { value: 540 })
  Object.defineProperty(shot, 'naturalHeight', { value: 960 })
  return wrapper
}

describe('KillshotStage', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('길게 누르면 돋보기가 뜨고 떼면 사라지며, 안내는 한 번 쓰면 다시 뜨지 않는다', async () => {
    const wrapper = mountStage()
    expect(wrapper.text()).toContain('길게 누르면 확대')

    await pointer(wrapper, 'pointerdown', 10, 10)
    vi.advanceTimersByTime(219)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="killshot-lens"]').exists()).toBe(false)

    vi.advanceTimersByTime(1)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="killshot-lens"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('길게 누르면 확대')

    await pointer(wrapper, 'pointerup')
    expect(wrapper.find('[data-testid="killshot-lens"]').exists()).toBe(false)
  })

  it('손가락이 움직이면 스크롤로 보고 돋보기를 띄우지 않는다', async () => {
    const wrapper = mountStage()

    await pointer(wrapper, 'pointerdown', 10, 10)
    await pointer(wrapper, 'pointermove', 10, 30)
    vi.advanceTimersByTime(500)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="killshot-lens"]').exists()).toBe(false)
  })
})
