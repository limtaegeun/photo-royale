import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseSegmented from '../BaseSegmented.vue'

const options = [
  { label: '남', value: 'male' },
  { label: '여', value: 'female' },
]

describe('BaseSegmented', () => {
  it('모든 옵션 라벨을 렌더한다', () => {
    const wrapper = mount(BaseSegmented, { props: { options } })

    expect(wrapper.findAll('button')).toHaveLength(2)
    expect(wrapper.get('[data-value="male"]').text()).toBe('남')
    expect(wrapper.get('[data-value="female"]').text()).toBe('여')
  })

  it('옵션 클릭 시 해당 value로 v-model이 갱신된다', async () => {
    const wrapper = mount(BaseSegmented, { props: { options, modelValue: '' } })

    await wrapper.get('[data-value="female"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['female'])
  })

  it('선택된 옵션은 aria-checked=true와 fill 클래스를 갖는다', () => {
    const wrapper = mount(BaseSegmented, { props: { options, modelValue: 'male' } })

    const male = wrapper.get('[data-value="male"]')
    expect(male.attributes('aria-checked')).toBe('true')
    expect(male.classes()).toContain('bg-brand')
  })

  it('선택되지 않은 옵션은 outline 스타일이다', () => {
    const wrapper = mount(BaseSegmented, { props: { options, modelValue: 'male' } })

    const female = wrapper.get('[data-value="female"]')
    expect(female.attributes('aria-checked')).toBe('false')
    expect(female.classes()).toContain('border-stroke-strong')
  })
})
