import { describe, it, expect, afterEach } from 'vitest'
import { isHistoryBackNavigation } from '../isHistoryBackNavigation'

afterEach(() => {
  window.history.replaceState(null, '')
})

describe('isHistoryBackNavigation', () => {
  it('기록이 이미 목적지 주소면 뒤로가기다 — popstate 는 가드 전에 기록을 옮긴다', () => {
    window.history.replaceState({ current: '/' }, '')

    expect(isHistoryBackNavigation({ fullPath: '/' })).toBe(true)
  })

  it('기록이 아직 지금 주소면 코드가 부른 이동이다 — push·replace 는 가드 뒤에 기록을 바꾼다', () => {
    window.history.replaceState({ current: '/waiting-room/AB2C' }, '')

    expect(isHistoryBackNavigation({ fullPath: '/round-ops/AB2C' })).toBe(false)
  })

  it('vue-router 기록이 없으면 뒤로가기로 치지 않는다', () => {
    expect(isHistoryBackNavigation({ fullPath: '/' })).toBe(false)
  })
})
