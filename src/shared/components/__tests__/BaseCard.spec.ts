import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseCard from '../BaseCard.vue'

describe('BaseCard', () => {
  it('기본은 div이며 카드 서피스(보더·배경·radius)와 md 패딩을 적용한다', () => {
    const wrapper = mount(BaseCard, { slots: { default: '내용' } })

    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['rounded-lg', 'border', 'border-stroke', 'bg-elevated', 'p-4']),
    )
    expect(wrapper.text()).toBe('내용')
  })

  it('padding=lg는 p-5, none은 패딩 유틸리티를 붙이지 않는다', () => {
    const large = mount(BaseCard, { props: { padding: 'lg' } })
    expect(large.classes()).toContain('p-5')
    expect(large.attributes('data-padding')).toBe('lg')

    const none = mount(BaseCard, { props: { padding: 'none' } })
    expect(none.classes()).not.toContain('p-4')
    expect(none.classes()).not.toContain('p-5')
  })

  it('as로 의미 있는 태그로 바꿀 수 있고, 사용처 class는 그대로 병합된다', () => {
    const wrapper = mount(BaseCard, {
      props: { as: 'section' },
      attrs: { class: 'flex gap-4' },
    })

    expect(wrapper.element.tagName).toBe('SECTION')
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['flex', 'gap-4', 'bg-elevated']))
  })
})
