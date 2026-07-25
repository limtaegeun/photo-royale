import { describe, it, expect, beforeEach } from 'vitest'
import { useToast } from '../useToast'

describe('useToast', () => {
  beforeEach(() => {
    // 모듈 싱글턴 큐를 각 테스트마다 비운다
    const { toasts } = useToast()
    toasts.value.splice(0, toasts.value.length)
  })

  it('toast() 발행 시 큐에 항목이 추가되고 기본값이 채워진다', () => {
    const { toast, toasts } = useToast()

    toast({ title: '저장 완료' })

    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0]).toMatchObject({ title: '저장 완료', tone: 'neutral', duration: 4000 })
  })

  it('여러 토스트는 고유하게 증가하는 id를 갖는다', () => {
    const { toast, toasts } = useToast()

    const first = toast({ title: 'A' })
    const second = toast({ title: 'B' })

    expect(second).toBeGreaterThan(first)
    expect(toasts.value.map((t) => t.id)).toEqual([first, second])
  })

  it('dismiss(id)는 해당 토스트만 제거한다', () => {
    const { toast, dismiss, toasts } = useToast()

    const keep = toast({ title: '유지' })
    const remove = toast({ title: '제거' })

    dismiss(remove)

    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0]?.id).toBe(keep)
  })

  it('tone·duration 옵션을 반영한다', () => {
    const { toast, toasts } = useToast()

    toast({ title: '위험', tone: 'danger', duration: 0 })

    expect(toasts.value[0]).toMatchObject({ tone: 'danger', duration: 0 })
  })

  it('dismissAll()은 큐에 쌓인 모든 토스트를 비운다', () => {
    const { toast, dismissAll, toasts } = useToast()

    toast({ title: 'A' })
    toast({ title: 'B' })
    toast({ title: 'C' })

    dismissAll()

    expect(toasts.value).toHaveLength(0)
  })
})
