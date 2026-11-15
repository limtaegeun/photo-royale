import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseCheckbox from '../BaseCheckbox.vue'

describe('BaseCheckbox', () => {
  it('role=checkbox로 렌더하고 슬롯 글자가 라벨이 된다', () => {
    const wrapper = mount(BaseCheckbox, { slots: { default: '위 내용에 동의합니다.' } })

    expect(wrapper.get('[role="checkbox"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.get('label').text()).toBe('위 내용에 동의합니다.')
  })

  it('체크 상태(modelValue=true)는 aria-checked=true·data-state=checked', () => {
    const wrapper = mount(BaseCheckbox, { props: { modelValue: true } })

    const box = wrapper.get('[role="checkbox"]')
    expect(box.attributes('aria-checked')).toBe('true')
    expect(box.attributes('data-state')).toBe('checked')
  })

  it('박스를 누르면 boolean으로 v-model을 토글한다', async () => {
    const wrapper = mount(BaseCheckbox, { props: { modelValue: false } })

    await wrapper.get('[role="checkbox"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
  })

  it('라벨 글자를 눌러도 토글된다 — 행 전체가 터치 영역이다', async () => {
    const wrapper = mount(BaseCheckbox, {
      props: { modelValue: false },
      slots: { default: '동의합니다.' },
      attachTo: document.body,
    })

    await wrapper.get('label span').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    wrapper.unmount()
  })

  it('disabled면 눌러도 토글되지 않는다', async () => {
    const wrapper = mount(BaseCheckbox, { props: { modelValue: false, disabled: true } })

    await wrapper.get('[role="checkbox"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
