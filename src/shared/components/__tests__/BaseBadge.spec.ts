import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseBadge from '../BaseBadge.vue'

describe('BaseBadge', () => {
  it('기본 슬롯 라벨을 렌더한다', () => {
    const wrapper = mount(BaseBadge, {
      slots: { default: 'RED팀' },
    })

    expect(wrapper.text()).toBe('RED팀')
  })

  it('team prop을 data 속성과 fill 유틸리티 클래스로 반영한다', () => {
    const wrapper = mount(BaseBadge, {
      props: { team: 'blue' },
    })

    expect(wrapper.attributes('data-team')).toBe('blue')
    expect(wrapper.classes()).toContain('bg-team-blue-solid')
  })

  it('team이 없으면 tone 기본값(neutral)이 적용된다', () => {
    const wrapper = mount(BaseBadge)

    expect(wrapper.attributes('data-tone')).toBe('neutral')
    expect(wrapper.classes()).toContain('bg-neutral')
  })

  it('team과 tone이 함께 주어지면 team이 우선한다', () => {
    const wrapper = mount(BaseBadge, {
      props: { team: 'green', tone: 'danger' },
    })

    expect(wrapper.attributes('data-team')).toBe('green')
    expect(wrapper.attributes('data-tone')).toBeUndefined()
    expect(wrapper.classes()).toContain('bg-team-green-solid')
    expect(wrapper.classes()).not.toContain('bg-danger-solid')
  })

  it("appearance='text'일 때 투명 배경 + 읽기용 텍스트 색이 적용된다", () => {
    const wrapper = mount(BaseBadge, {
      props: { appearance: 'text', tone: 'success' },
    })

    expect(wrapper.attributes('data-appearance')).toBe('text')
    expect(wrapper.classes()).toContain('text-success')
    expect(wrapper.classes()).not.toContain('bg-success-solid')
  })
})
