import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseSectionHeader from '../BaseSectionHeader.vue'

describe('BaseSectionHeader', () => {
  it('제목을 h2로 렌더하고 섹션 헤딩 위계(text-subheading)를 고정한다', () => {
    const wrapper = mount(BaseSectionHeader, { props: { title: '입장 명단' } })

    const heading = wrapper.get('h2')
    expect(heading.text()).toBe('입장 명단')
    expect(heading.classes()).toContain('text-subheading')
  })

  it('summary가 없으면 요약 문단을 렌더하지 않는다', () => {
    const wrapper = mount(BaseSectionHeader, { props: { title: '팀 편성' } })
    expect(wrapper.find('p').exists()).toBe(false)
  })

  it('summary와 aside 슬롯을 함께 노출한다', () => {
    const wrapper = mount(BaseSectionHeader, {
      props: { title: '팀 편성', summary: '3팀 · 5명 배정' },
      slots: { aside: '<span data-testid="badge">실시간</span>' },
    })

    expect(wrapper.get('p').text()).toBe('3팀 · 5명 배정')
    expect(wrapper.get('[data-testid="badge"]').text()).toBe('실시간')
  })

  it('aside 슬롯이 없으면 우측 컨테이너 자체를 만들지 않는다', () => {
    const wrapper = mount(BaseSectionHeader, { props: { title: '팀 편성' } })
    expect(wrapper.find('.shrink-0').exists()).toBe(false)
  })
})
