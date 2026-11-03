import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseToastProvider from '../BaseToastProvider.vue'
import { useToast } from '@/shared/composables/useToast'

// 프로바이더가 여러 개 남으면 같은 큐를 각자 렌더해, 한쪽 토스트를 멈춰도 다른 쪽이 닫아 버린다
enableAutoUnmount(afterEach)

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

  /**
   * 토스트가 안 사라지거나 너무 오래 남던 결함 회귀(2026-11-03).
   * Reka 타이머는 뷰포트 전체가 일시정지 플래그 하나를 공유해서, 플래그가 한 번 안 풀리면 다음 토스트부터 전부 남았다.
   * 자동 닫힘은 이제 토스트마다 따로 센다. jsdom에는 애니메이션이 없어 닫힘 뒤 250ms 폴백으로 큐에서 빠진다.
   */
  describe('자동 닫힘', () => {
    /** 기본 3초 + 닫힘 폴백 250ms를 넉넉히 넘기는 시간 — 멈춘 경우와 구분되도록 10초보다는 짧게 */
    const PAST_AUTO_CLOSE_MS = 5000

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    /** 타이머 사이의 마이크로태스크(Vue 반영)도 흘려보내며 시간을 민다 */
    async function advance(ms: number) {
      await vi.advanceTimersByTimeAsync(ms)
      await nextTick()
    }

    function titles() {
      return useToast().toasts.value.map((item) => item.title)
    }

    it('기본 3초 뒤 닫혀 큐에서 빠진다', async () => {
      mount(BaseToastProvider)
      useToast().toast({ title: '초대 링크를 복사했어요.', tone: 'success' })
      await nextTick()

      await advance(2999)
      expect(titles()).toEqual(['초대 링크를 복사했어요.'])

      await advance(PAST_AUTO_CLOSE_MS - 2999)
      expect(titles()).toEqual([])
    })

    it('duration 0이면 자동으로 닫히지 않는다', async () => {
      mount(BaseToastProvider)
      useToast().toast({ title: '수동 닫기', duration: 0 })
      await nextTick()

      await advance(60_000)
      expect(titles()).toEqual(['수동 닫기'])
    })

    it('마우스를 올린 채로 토스트가 사라져도 다음 토스트는 제 시간에 닫힌다', async () => {
      const wrapper = mount(BaseToastProvider)
      const { toast, dismissAll } = useToast()
      toast({ title: '첫 토스트' })
      await nextTick()
      await wrapper.get('[data-tone]').trigger('pointerenter', { pointerType: 'mouse' })
      await wrapper.get('[data-tone]').trigger('pointermove', { pointerType: 'mouse' })

      dismissAll()
      await nextTick()
      toast({ title: '다음 토스트' })
      await nextTick()

      await advance(PAST_AUTO_CLOSE_MS)
      expect(titles()).toEqual([])
    })

    // 브라우저는 탭·클릭으로 준 포커스를 :focus-visible로 보지 않는다. jsdom은 이 구분이 없어 그 판정만 대신한다
    it('토스트 본문을 탭해 포커스가 들어와도 닫힌다', async () => {
      vi.spyOn(HTMLElement.prototype, 'matches').mockReturnValue(false)
      const wrapper = mount(BaseToastProvider)
      useToast().toast({ title: '탭한 토스트' })
      await nextTick()
      await wrapper.get('[data-tone]').trigger('focusin')

      await advance(PAST_AUTO_CLOSE_MS)
      expect(titles()).toEqual([])
    })

    it('창이 포커스를 잃어도(다른 앱으로 이동) 시간이 흐른다', async () => {
      mount(BaseToastProvider)
      useToast().toast({ title: '복사했어요' })
      await nextTick()

      window.dispatchEvent(new Event('blur'))
      await advance(PAST_AUTO_CLOSE_MS)
      expect(titles()).toEqual([])
    })

    it('마우스를 올린 동안 멈추고, 내리면 남은 시간만큼 뒤에 닫힌다', async () => {
      const wrapper = mount(BaseToastProvider)
      useToast().toast({ title: '읽는 중' })
      await nextTick()
      const toastElement = wrapper.get('[data-tone]')

      await advance(1000)
      await toastElement.trigger('pointerenter', { pointerType: 'mouse' })
      await advance(10_000)
      expect(titles()).toEqual(['읽는 중'])

      await toastElement.trigger('pointerleave', { pointerType: 'mouse' })
      await advance(1999)
      expect(titles()).toEqual(['읽는 중'])
      await advance(1000)
      expect(titles()).toEqual([])
    })

    it('터치로 누른 뒤에는 멈추지 않는다', async () => {
      const wrapper = mount(BaseToastProvider)
      useToast().toast({ title: '터치' })
      await nextTick()
      await wrapper.get('[data-tone]').trigger('pointerenter', { pointerType: 'touch' })

      await advance(PAST_AUTO_CLOSE_MS)
      expect(titles()).toEqual([])
    })

    it('키보드로 포커스가 들어온 동안은 멈춘다', async () => {
      vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(
        (selector: string) => selector === ':focus-visible',
      )
      const wrapper = mount(BaseToastProvider)
      useToast().toast({ title: '키보드' })
      await nextTick()
      const toastElement = wrapper.get('[data-tone]')

      await toastElement.trigger('focusin')
      await advance(10_000)
      expect(titles()).toEqual(['키보드'])

      await toastElement.trigger('focusout', { relatedTarget: null })
      await advance(PAST_AUTO_CLOSE_MS)
      expect(titles()).toEqual([])
    })
  })
})
