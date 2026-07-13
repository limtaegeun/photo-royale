import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WaitingRoomPage from '../WaitingRoomPage.vue'
import PlayerChip from '../components/PlayerChip.vue'

function mountPage() {
  return mount(WaitingRoomPage, {
    global: { plugins: [createPinia()] },
  })
}

describe('WaitingRoomPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('룸 코드와 대기 중 뱃지를 렌더한다', () => {
    const wrapper = mountPage()

    expect(wrapper.text()).toContain('ROOM 7K2')
    expect(wrapper.text()).toContain('대기 중')
  })

  it('참가자 수만큼 PlayerChip을 렌더하고 카운트를 표시한다', () => {
    const wrapper = mountPage()

    expect(wrapper.findAllComponents(PlayerChip)).toHaveLength(18)
    expect(wrapper.text()).toContain('참가자 18명 · 준비 14명')
    expect(wrapper.text()).toContain('18명 입장 · 14명 레디')
  })

  it('안전 수칙 카드와 동의 안내를 렌더한다', () => {
    const wrapper = mountPage()

    expect(wrapper.text()).toContain('안전 수칙 확인')
    expect(wrapper.text()).toContain('아래 확인 버튼을 누르면 안전 수칙과 개인 책임에 동의합니다.')
  })

  it('CTA 클릭 시 내가 준비 상태가 되어 카운트가 갱신되고 버튼이 비활성화된다', async () => {
    const wrapper = mountPage()
    const cta = wrapper.find('button')

    expect(cta.text()).toBe('확인하고 준비 완료')

    await cta.trigger('click')

    expect(wrapper.text()).toContain('참가자 18명 · 준비 15명')
    expect(cta.text()).toBe('준비 완료')
    expect(cta.attributes('disabled')).toBeDefined()
  })
})
