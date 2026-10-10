import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerChip from '../PlayerChip.vue'

describe('PlayerChip', () => {
  it('이름만 렌더한다 — 준비 상태는 칩이 아니라 명단 묶음이 표시한다', () => {
    // 완장 'D'는 4색 순환상 red 그룹
    const wrapper = mount(PlayerChip, {
      props: { name: '하린', team: 'D', gender: 'female' },
    })

    expect(wrapper.text()).toBe('하린')
    expect(wrapper.find('.bg-success-solid').exists()).toBe(false)
    expect(wrapper.find('.bg-warning-solid').exists()).toBe(false)
  })

  it('완장에서 파생한 그룹 색 보더를 적용한다', () => {
    const red = mount(PlayerChip, {
      props: { name: '하린', team: 'D', gender: 'female' },
    })
    expect(red.classes()).toContain('border-team-red-solid')

    // 완장 'A'는 blue 그룹
    const blue = mount(PlayerChip, {
      props: { name: '지후', team: 'A', gender: 'male' },
    })
    expect(blue.classes()).toContain('border-team-blue-solid')
  })

  it('성별에 따라 이름 색을 다르게 표시한다 — 남 파랑, 여 빨강', () => {
    const male = mount(PlayerChip, {
      props: { name: '지후', team: null, gender: 'male' },
    })
    expect(male.find('.text-gender-male').text()).toBe('지후')
    expect(male.attributes('data-gender')).toBe('male')

    const female = mount(PlayerChip, {
      props: { name: '하린', team: null, gender: 'female' },
    })
    expect(female.find('.text-gender-female').text()).toBe('하린')
    expect(female.attributes('data-gender')).toBe('female')
  })

  it('성별 정보가 없으면 이름을 기본 텍스트 색으로 표시한다', () => {
    const wrapper = mount(PlayerChip, {
      props: { name: '오리', team: null, gender: null },
    })

    expect(wrapper.find('.text-content').text()).toBe('오리')
    expect(wrapper.attributes('data-gender')).toBe('none')
  })

  it('팀 미배정이면 중립 보더와 미배정 라벨로 표시한다', () => {
    const wrapper = mount(PlayerChip, {
      props: { name: '오리', team: null, gender: null },
    })

    expect(wrapper.classes()).toContain('border-stroke')
    expect(wrapper.attributes('data-team')).toBe('none')
    expect(wrapper.attributes('aria-label')).toBe('오리 · 팀 미배정')
  })

  it('배정된 완장이면 data-team에 완장 알파벳을 싣는다', () => {
    const wrapper = mount(PlayerChip, {
      props: { name: '하린', team: 'D', gender: 'female' },
    })

    expect(wrapper.attributes('data-team')).toBe('D')
  })

  it('색약 대응 — 접근성 라벨에 성별과 완장·그룹 색을 병기한다', () => {
    const wrapper = mount(PlayerChip, {
      props: { name: '지후', team: 'A', gender: 'male' },
    })

    expect(wrapper.attributes('aria-label')).toBe('지후 · 남성 · 완장 A · 파랑')
  })
})
