import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerChip from '../components/PlayerChip.vue'

describe('PlayerChip', () => {
  it('이름과 준비 상태 라벨을 렌더한다', () => {
    const wrapper = mount(PlayerChip, {
      props: { name: '하린', team: 'red', gender: 'female', isReady: true },
    })

    expect(wrapper.text()).toContain('하린')
    expect(wrapper.text()).toContain('준비')
  })

  it('준비 상태면 success 색, 팀 색 보더를 적용한다', () => {
    const wrapper = mount(PlayerChip, {
      props: { name: '하린', team: 'red', gender: 'female', isReady: true },
    })

    expect(wrapper.classes()).toContain('border-team-red-solid')
    expect(wrapper.attributes('data-ready')).toBe('true')
    expect(wrapper.find('.text-success').text()).toBe('준비')
    expect(wrapper.find('.bg-success-solid').exists()).toBe(true)
  })

  it('대기 상태면 warning 색으로 표시한다', () => {
    const wrapper = mount(PlayerChip, {
      props: { name: '지후', team: 'blue', gender: 'male', isReady: false },
    })

    expect(wrapper.classes()).toContain('border-team-blue-solid')
    expect(wrapper.attributes('data-ready')).toBe('false')
    expect(wrapper.find('.text-warning').text()).toBe('대기')
    expect(wrapper.find('.bg-warning-solid').exists()).toBe(true)
  })

  it('성별에 따라 이름 색을 다르게 표시한다 — 남 파랑, 여 빨강', () => {
    const male = mount(PlayerChip, {
      props: { name: '지후', team: null, gender: 'male', isReady: false },
    })
    expect(male.find('.text-gender-male').text()).toBe('지후')
    expect(male.attributes('data-gender')).toBe('male')

    const female = mount(PlayerChip, {
      props: { name: '하린', team: null, gender: 'female', isReady: false },
    })
    expect(female.find('.text-gender-female').text()).toBe('하린')
    expect(female.attributes('data-gender')).toBe('female')
  })

  it('성별 정보가 없으면 이름을 기본 텍스트 색으로 표시한다', () => {
    const wrapper = mount(PlayerChip, {
      props: { name: '오리', team: null, gender: null, isReady: false },
    })

    expect(wrapper.find('.text-content').text()).toBe('오리')
    expect(wrapper.attributes('data-gender')).toBe('none')
  })

  it('팀 미배정이면 중립 보더와 미배정 라벨로 표시한다', () => {
    const wrapper = mount(PlayerChip, {
      props: { name: '오리', team: null, gender: null, isReady: false },
    })

    expect(wrapper.classes()).toContain('border-stroke')
    expect(wrapper.attributes('data-team')).toBe('none')
    expect(wrapper.attributes('aria-label')).toBe('오리 · 팀 미배정 · 대기')
  })

  it('색약 대응 — 접근성 라벨에 성별과 팀명을 병기한다', () => {
    const wrapper = mount(PlayerChip, {
      props: { name: '지후', team: 'blue', gender: 'male', isReady: false },
    })

    expect(wrapper.attributes('aria-label')).toBe('지후 · 남성 · 블루팀 · 대기')
  })
})
