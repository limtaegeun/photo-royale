import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseButton from '../BaseButton.vue'

describe('BaseButton', () => {
  it('기본 슬롯 라벨을 렌더한다', () => {
    const wrapper = mount(BaseButton, {
      slots: { default: '시작하기' },
    })

    expect(wrapper.text()).toBe('시작하기')
  })

  it('variant와 size prop을 data 속성과 유틸리티 클래스로 반영한다', () => {
    const wrapper = mount(BaseButton, {
      props: { variant: 'danger', size: 'lg' },
    })

    expect(wrapper.attributes('data-variant')).toBe('danger')
    expect(wrapper.attributes('data-size')).toBe('lg')
    expect(wrapper.classes()).toContain('bg-danger-solid')
    expect(wrapper.classes()).toContain('text-body')
  })

  it('기본값(primary/md)이 적용된다', () => {
    const wrapper = mount(BaseButton)

    expect(wrapper.attributes('data-variant')).toBe('primary')
    expect(wrapper.attributes('data-size')).toBe('md')
    expect(wrapper.classes()).toContain('bg-brand')
  })

  it('클릭 이벤트가 네이티브로 전파된다', async () => {
    const wrapper = mount(BaseButton)

    await wrapper.trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('disabled 상태에서는 disabled 속성이 존재하고 클릭 이벤트가 발생하지 않는다', async () => {
    const wrapper = mount(BaseButton, {
      props: { disabled: true },
    })

    expect(wrapper.attributes('disabled')).toBeDefined()

    await wrapper.trigger('click')

    expect(wrapper.emitted('click')).toBeUndefined()
  })

  describe('loading', () => {
    it('aria-busy·data-loading을 세팅하고 disabled와 동일하게 클릭을 막는다', async () => {
      const wrapper = mount(BaseButton, {
        props: { loading: true },
        slots: { default: '재배정' },
      })

      expect(wrapper.attributes('aria-busy')).toBe('true')
      expect(wrapper.attributes('data-loading')).toBe('true')
      expect(wrapper.attributes('disabled')).toBeDefined()

      await wrapper.trigger('click')

      expect(wrapper.emitted('click')).toBeUndefined()
    })

    it('스피너를 렌더하면서도 라벨 텍스트는 DOM에 그대로 유지한다(자리 유지, invisible 처리)', () => {
      const wrapper = mount(BaseButton, {
        props: { loading: true },
        slots: { default: '재배정' },
      })

      // 라벨은 지워지지 않고 invisible 클래스로만 시각적으로 숨는다 — 버튼 폭이 유지된다
      expect(wrapper.text()).toContain('재배정')
      expect(wrapper.find('.invisible').text()).toBe('재배정')

      // 스피너는 별도 요소로 렌더되고 스크린리더에서는 숨겨진다(aria-hidden)
      const spinner = wrapper.find('[aria-hidden="true"]')
      expect(spinner.exists()).toBe(true)
      expect(spinner.classes()).toContain('animate-spin')
    })

    it('loading이 false면 스피너를 렌더하지 않고 라벨이 보인다', () => {
      const wrapper = mount(BaseButton, {
        props: { loading: false },
        slots: { default: '재배정' },
      })

      expect(wrapper.find('[aria-hidden="true"]').exists()).toBe(false)
      expect(wrapper.find('.invisible').exists()).toBe(false)
      expect(wrapper.attributes('aria-busy')).toBeUndefined()
    })
  })
})
