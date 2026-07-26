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

  describe('건수 배지', () => {
    const tabOptions = [
      { label: '운영', value: 'ops' },
      { label: '판정', value: 'judge', badge: { count: 3, ariaLabel: '3건 판정 대기' } },
    ]

    it('badge가 있는 옵션에만 건수와 사용처의 접근성 문구를 렌더한다', () => {
      const wrapper = mount(BaseSegmented, { props: { options: tabOptions } })

      expect(wrapper.get('[data-value="judge"] .count-badge').text()).toBe('3')
      expect(wrapper.get('[data-value="judge"] .count-badge').attributes('aria-label')).toBe(
        '3건 판정 대기',
      )
      expect(wrapper.get('[data-value="ops"]').text()).toBe('운영')
      expect(wrapper.find('[data-value="ops"] .count-badge').exists()).toBe(false)
    })

    it('count가 0이 되면 배지가 사라진다', async () => {
      const wrapper = mount(BaseSegmented, { props: { options: tabOptions } })

      await wrapper.setProps({
        options: [tabOptions[0]!, { ...tabOptions[1]!, badge: { count: 0 } }],
      })

      expect(wrapper.find('.count-badge').exists()).toBe(false)
    })

    it('건수가 늘어나면 배지를 다시 마운트해 도착 펄스를 재생한다', async () => {
      const wrapper = mount(BaseSegmented, { props: { options: tabOptions } })
      const initialBadge = wrapper.get('.count-badge').element

      await wrapper.setProps({
        options: [tabOptions[0]!, { ...tabOptions[1]!, badge: { count: 4 } }],
      })
      // 키 교체로 새 엘리먼트가 생겨야 CSS 애니메이션이 처음부터 다시 재생된다
      expect(wrapper.get('.count-badge').element).not.toBe(initialBadge)
      expect(wrapper.get('.count-badge').text()).toContain('4')

      const increasedBadge = wrapper.get('.count-badge').element
      await wrapper.setProps({
        options: [tabOptions[0]!, { ...tabOptions[1]!, badge: { count: 2 } }],
      })
      // 판정으로 줄어들 때는 펄스 없이 숫자만 바뀐다
      expect(wrapper.get('.count-badge').element).toBe(increasedBadge)
      expect(wrapper.get('.count-badge').text()).toContain('2')
    })
  })
})
