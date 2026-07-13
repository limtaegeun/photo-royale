import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseSegmented from '../BaseSegmented.vue'

const options = [
  { label: '남', value: 'male' },
  { label: '여', value: 'female' },
]

describe('BaseSegmented', () => {
  it('radiogroup으로 모든 옵션 라벨을 렌더한다', () => {
    const wrapper = mount(BaseSegmented, { props: { options } })

    expect(wrapper.get('[role="radiogroup"]')).toBeTruthy()
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(2)
    expect(wrapper.get('[data-value="male"]').text()).toBe('남')
    expect(wrapper.get('[data-value="female"]').text()).toBe('여')
  })

  it('옵션 클릭 시 해당 value로 v-model이 갱신된다', async () => {
    const wrapper = mount(BaseSegmented, { props: { options, modelValue: '' } })

    await wrapper.get('[data-value="female"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['female'])
  })

  it('선택된 옵션만 data-state=checked를 갖는다', () => {
    const wrapper = mount(BaseSegmented, { props: { options, modelValue: 'male' } })

    expect(wrapper.get('[data-value="male"]').attributes('data-state')).toBe('checked')
    expect(wrapper.get('[data-value="female"]').attributes('data-state')).toBe('unchecked')
  })
})
