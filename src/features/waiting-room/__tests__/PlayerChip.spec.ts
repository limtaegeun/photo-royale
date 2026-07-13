import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerChip from '../components/PlayerChip.vue'

describe('PlayerChip', () => {
  it('이름과 준비 상태 라벨을 렌더한다', () => {
    const wrapper = mount(PlayerChip, {
      props: { name: '하린', team: 'red', isReady: true },
    })

    expect(wrapper.text()).toContain('하린')
    expect(wrapper.text()).toContain('준비')
  })

  it('준비 상태면 success 색, 팀 색 보더를 적용한다', () => {
    const wrapper = mount(PlayerChip, {
      props: { name: '하린', team: 'red', isReady: true },
    })

    expect(wrapper.classes()).toContain('border-team-red-solid')
    expect(wrapper.attributes('data-ready')).toBe('true')
    expect(wrapper.find('.text-success').text()).toBe('준비')
    expect(wrapper.find('.bg-success-solid').exists()).toBe(true)
  })

  it('대기 상태면 warning 색으로 표시한다', () => {
    const wrapper = mount(PlayerChip, {
      props: { name: '지후', team: 'blue', isReady: false },
    })

    expect(wrapper.classes()).toContain('border-team-blue-solid')
    expect(wrapper.attributes('data-ready')).toBe('false')
    expect(wrapper.find('.text-warning').text()).toBe('대기')
    expect(wrapper.find('.bg-warning-solid').exists()).toBe(true)
  })

  it('색약 대응 — 접근성 라벨에 팀명을 병기한다', () => {
    const wrapper = mount(PlayerChip, {
      props: { name: '지후', team: 'blue', isReady: false },
    })

    expect(wrapper.attributes('aria-label')).toBe('지후 · 블루팀 · 대기')
  })
})
