import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseSwitch from '../BaseSwitch.vue'

describe('BaseSwitch', () => {
  it('role=switch로 렌더하고 label을 aria-label로 노출한다', () => {
    const wrapper = mount(BaseSwitch, { props: { label: '특수 완장 X 모듈' } })

    const sw = wrapper.get('[role="switch"]')
    expect(sw.attributes('aria-label')).toBe('특수 완장 X 모듈')
  })

  it('off 상태(modelValue=false)는 aria-checked=false·data-state=unchecked', () => {
    const wrapper = mount(BaseSwitch, { props: { modelValue: false } })

    const sw = wrapper.get('[role="switch"]')
    expect(sw.attributes('aria-checked')).toBe('false')
    expect(sw.attributes('data-state')).toBe('unchecked')
  })

  it('on 상태(modelValue=true)는 aria-checked=true·data-state=checked', () => {
    const wrapper = mount(BaseSwitch, { props: { modelValue: true } })

    const sw = wrapper.get('[role="switch"]')
    expect(sw.attributes('aria-checked')).toBe('true')
    expect(sw.attributes('data-state')).toBe('checked')
  })

  it('클릭하면 boolean으로 v-model을 토글한다', async () => {
    const wrapper = mount(BaseSwitch, { props: { modelValue: false } })

    await wrapper.get('[role="switch"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
  })

  it('disabled면 disabled 속성을 달고 클릭해도 토글되지 않는다', async () => {
    const wrapper = mount(BaseSwitch, { props: { modelValue: false, disabled: true } })

    const sw = wrapper.get('[role="switch"]')
    expect(sw.attributes('disabled')).toBeDefined()

    await sw.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
