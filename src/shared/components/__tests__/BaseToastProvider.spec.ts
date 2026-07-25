import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseToastProvider from '../BaseToastProvider.vue'
import { useToast } from '@/shared/composables/useToast'

describe('BaseToastProvider', () => {
  beforeEach(() => {
    const { toasts } = useToast()
    toasts.value.splice(0, toasts.value.length)
  })

  it('toast() 발행 시 뷰포트에 제목·설명을 렌더한다', async () => {
    const wrapper = mount(BaseToastProvider)
    const { toast } = useToast()

    toast({ title: '저장 완료', description: '변경 사항이 반영됐어요', tone: 'success' })
    await nextTick()

    expect(wrapper.html()).toContain('저장 완료')
    expect(wrapper.html()).toContain('변경 사항이 반영됐어요')
    expect(wrapper.get('[data-tone="success"]')).toBeTruthy()
  })

  /**
   * QA C-05·H-04 회귀 — 뷰포트는 화면 하단 전체를 덮는 투명 컨테이너라, pointer-events를 켜 두면
   * 토스트가 떠 있는 동안 아래의 하단 고정 바(대기실 CTA·라운드 운영 탭)가 클릭되지 않는다.
   */
  it('뷰포트는 클릭을 통과시키고 토스트 자신만 클릭을 받는다', async () => {
    const wrapper = mount(BaseToastProvider)
    const { toast } = useToast()

    toast({ title: '저장 완료' })
    await nextTick()

    const viewport = wrapper.find('ol')
    expect(viewport.classes()).toContain('pointer-events-none')
    const toastElement = wrapper.get('[data-tone]')
    expect(toastElement.classes()).toContain('pointer-events-auto')
    expect(toastElement.classes()).toContain('base-toast')
  })

  it('하단 조작을 가리지 않도록 상단 안전영역에 렌더한다', () => {
    const wrapper = mount(BaseToastProvider)
    const viewport = wrapper.get('ol')

    expect(viewport.classes()).toContain('top-0')
    expect(viewport.classes()).toContain('pt-[calc(var(--pr-inset-top-safe)+1rem)]')
    expect(viewport.classes()).not.toContain('bottom-0')
  })

  it('여러 토스트를 동시에 렌더한다', async () => {
    const wrapper = mount(BaseToastProvider)
    const { toast } = useToast()

    toast({ title: '첫번째' })
    toast({ title: '두번째' })
    await nextTick()

    expect(wrapper.findAll('[data-tone]')).toHaveLength(2)
  })
})
