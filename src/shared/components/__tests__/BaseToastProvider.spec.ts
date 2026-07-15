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

  it('여러 토스트를 동시에 렌더한다', async () => {
    const wrapper = mount(BaseToastProvider)
    const { toast } = useToast()

    toast({ title: '첫번째' })
    toast({ title: '두번째' })
    await nextTick()

    expect(wrapper.findAll('[data-tone]')).toHaveLength(2)
  })
})
