import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseButton from '../BaseButton.vue'

describe('BaseButton', () => {
  it('기본 슬롯 라벨을 렌더한다', () => {
    const wrapper = mount(BaseButton, {
      slots: { default: '시작하기' },
    })

    expect(wrapper.text()).toBe('시작하기')
  })

  it('variant와 size prop을 data 속성과 유틸리티 클래스로 반영한다', () => {
    const wrapper = mount(BaseButton, {
      props: { variant: 'danger', size: 'lg' },
    })

    expect(wrapper.attributes('data-variant')).toBe('danger')
    expect(wrapper.attributes('data-size')).toBe('lg')
    expect(wrapper.classes()).toContain('bg-danger-solid')
    expect(wrapper.classes()).toContain('text-body')
  })

  it('기본값(primary/md)이 적용된다', () => {
    const wrapper = mount(BaseButton)

    expect(wrapper.attributes('data-variant')).toBe('primary')
    expect(wrapper.attributes('data-size')).toBe('md')
    expect(wrapper.classes()).toContain('bg-brand')
  })

  it('클릭 이벤트가 네이티브로 전파된다', async () => {
    const wrapper = mount(BaseButton)

    await wrapper.trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('disabled 상태에서는 disabled 속성이 존재하고 클릭 이벤트가 발생하지 않는다', async () => {
    const wrapper = mount(BaseButton, {
      props: { disabled: true },
    })

    expect(wrapper.attributes('disabled')).toBeDefined()

    await wrapper.trigger('click')

    expect(wrapper.emitted('click')).toBeUndefined()
  })
})
