import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseInput from '../BaseInput.vue'

describe('BaseInput', () => {
  it('placeholder를 렌더한다', () => {
    const wrapper = mount(BaseInput, {
      props: { placeholder: '닉네임' },
    })

    expect(wrapper.find('input').attributes('placeholder')).toBe('닉네임')
  })

  it('기본값(md/text)이 적용된다', () => {
    const wrapper = mount(BaseInput)

    expect(wrapper.attributes('data-size')).toBe('md')
    expect(wrapper.find('input').attributes('type')).toBe('text')
    expect(wrapper.classes()).toContain('bg-surface')
  })

  it('size prop을 data 속성과 높이 유틸리티 클래스로 반영한다', () => {
    const wrapper = mount(BaseInput, {
      props: { size: 'lg' },
    })

    expect(wrapper.attributes('data-size')).toBe('lg')
    expect(wrapper.classes()).toContain('h-(--pr-size-control-lg)')
  })

  it('입력값이 v-model로 양방향 바인딩된다', async () => {
    const wrapper = mount(BaseInput, {
      props: { modelValue: '' },
    })

    await wrapper.find('input').setValue('leo')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['leo'])
  })

  it('disabled 상태에서는 disabled 속성이 존재한다', () => {
    const wrapper = mount(BaseInput, {
      props: { disabled: true },
    })

    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
  })
})
