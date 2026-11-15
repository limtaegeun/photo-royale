import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseAccordion from '../BaseAccordion.vue'

const ITEMS = [
  { value: 'one', title: '첫째 칸', marker: '1' },
  { value: 'two', title: '둘째 칸', marker: '2' },
  { value: 'three', title: '표식 없는 칸' },
]

function mountAccordion(modelValue: string[] = []) {
  return mount(BaseAccordion, {
    props: { items: ITEMS, modelValue },
    slots: { content: ({ item }: { item: { title: string } }) => `${item.title} 본문` },
  })
}

describe('BaseAccordion', () => {
  it('처음엔 전부 접혀 제목만 보이고, 칸마다 aria-expanded=false인 버튼이다', () => {
    const wrapper = mountAccordion()

    const triggers = wrapper.findAll('button')
    expect(triggers).toHaveLength(3)
    for (const trigger of triggers) expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.text()).toContain('첫째 칸')
    expect(wrapper.text()).not.toContain('첫째 칸 본문')
  })

  it('제목은 heading 안의 버튼이다 — 기본 h3', () => {
    const wrapper = mountAccordion()

    expect(wrapper.findAll('h3')).toHaveLength(3)
    expect(wrapper.find('h3 button').exists()).toBe(true)
  })

  it('누르면 그 칸만 펴고 v-model로 펼친 칸 목록을 알린다', async () => {
    const wrapper = mountAccordion()

    await wrapper.findAll('button')[1]!.trigger('click')

    const emitted = wrapper.emitted('update:modelValue') ?? []
    expect(emitted[emitted.length - 1]).toEqual([['two']])
  })

  it('여러 칸을 함께 펼 수 있고 펼친 칸은 본문을 그린다', () => {
    const wrapper = mountAccordion(['one', 'three'])

    const triggers = wrapper.findAll('button')
    expect(triggers[0]!.attributes('aria-expanded')).toBe('true')
    expect(triggers[1]!.attributes('aria-expanded')).toBe('false')
    expect(triggers[2]!.attributes('aria-expanded')).toBe('true')
    expect(wrapper.text()).toContain('첫째 칸 본문')
    expect(wrapper.text()).toContain('표식 없는 칸 본문')
    expect(wrapper.text()).not.toContain('둘째 칸 본문')
  })

  it('표식(marker)이 있는 칸만 동그라미 번호를 그린다', () => {
    const wrapper = mountAccordion()

    const markers = wrapper.findAll('button span[aria-hidden="true"]')
    expect(markers.map((marker) => marker.text())).toEqual(['1', '2'])
  })

  it('칸은 큰 컨트롤 높이(56px) 이상의 터치 영역이다', () => {
    const wrapper = mountAccordion()

    expect(wrapper.find('button').classes()).toContain('min-h-(--pr-size-control-lg)')
  })
})
