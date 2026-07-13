import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWaitingRoomStore } from '../stores/useWaitingRoomStore'

describe('useWaitingRoomStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('초기 목 데이터 — 참가자 18명, 준비 14명', () => {
    const store = useWaitingRoomStore()

    expect(store.participantCount).toBe(18)
    expect(store.readyCount).toBe(14)
  })

  it('내 참가자는 초기에 대기 상태다', () => {
    const store = useWaitingRoomStore()

    expect(store.isReadyConfirmed).toBe(false)
  })

  it('confirmReady 호출 시 내 참가자가 준비 상태가 되고 준비 카운트가 늘어난다', () => {
    const store = useWaitingRoomStore()

    store.confirmReady()

    expect(store.isReadyConfirmed).toBe(true)
    expect(store.readyCount).toBe(15)
    expect(store.participants.find((p) => p.id === store.myId)?.isReady).toBe(true)
  })

  it('confirmReady를 중복 호출해도 준비 카운트는 한 번만 증가한다', () => {
    const store = useWaitingRoomStore()

    store.confirmReady()
    store.confirmReady()

    expect(store.readyCount).toBe(15)
  })
})
