import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseListRow from '../BaseListRow.vue'

describe('BaseListRow', () => {
  it('라벨과 캡션을 위계대로 렌더하고, 행 높이를 최소 컨트롤 높이로 고정한다', () => {
    const wrapper = mount(BaseListRow, {
      props: { label: '게임 모드', caption: '일반전 · 기본 생존 서바이벌' },
    })

    const [label, caption] = wrapper.findAll('p')
    expect(label!.text()).toBe('게임 모드')
    expect(label!.classes()).toContain('text-label')
    expect(caption!.text()).toBe('일반전 · 기본 생존 서바이벌')
    expect(caption!.classes()).toEqual(expect.arrayContaining(['text-caption', 'truncate']))
    // 행 높이가 컨트롤 크기에 따라 흔들리지 않게 min-h를 토큰으로 고정한다
    expect(wrapper.classes()).toContain('min-h-(--pr-size-control-lg)')
  })

  it('caption이 없으면 캡션 문단을 렌더하지 않는다', () => {
    const wrapper = mount(BaseListRow, { props: { label: '특수 완장 X' } })
    expect(wrapper.findAll('p')).toHaveLength(1)
  })

  it('control 슬롯에 넘긴 컨트롤을 우측에 놓고 줄어들지 않게 한다', () => {
    const wrapper = mount(BaseListRow, {
      props: { label: '게임 모드' },
      slots: { control: '<button type="button">변경</button>' },
    })

    const control = wrapper.get('button')
    expect(control.text()).toBe('변경')
    expect(control.element.parentElement?.className).toContain('shrink-0')
  })
})
