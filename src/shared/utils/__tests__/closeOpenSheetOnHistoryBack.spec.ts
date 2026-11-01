import { describe, it, expect, afterEach, vi } from 'vitest'
import { closeOpenSheetOnHistoryBack } from '../closeOpenSheetOnHistoryBack'

function openSheet() {
  const el = document.createElement('div')
  el.setAttribute('role', 'dialog')
  el.setAttribute('data-state', 'open')
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
  window.history.replaceState(null, '')
})

/** 11/01 QA 탐색 EX-01 — 누적 순위 시트를 연 채 뒤로가기를 누르면 방을 나갔다 */
describe('closeOpenSheetOnHistoryBack', () => {
  it('뒤로가기(기록이 이미 목적지)로 떠날 때 열린 시트가 있으면 Escape 로 닫고 true 를 돌려준다', () => {
    openSheet()
    window.history.replaceState({ current: '/' }, '')
    const escape = vi.fn<(event: KeyboardEvent) => void>()
    document.addEventListener('keydown', escape)

    expect(closeOpenSheetOnHistoryBack({ fullPath: '/' })).toBe(true)
    expect(escape).toHaveBeenCalledOnce()
    expect(escape.mock.calls[0]![0].key).toBe('Escape')
    document.removeEventListener('keydown', escape)
  })

  it('코드가 부른 이동(기록이 아직 지금 주소)은 막지 않는다 — 시트 안 버튼의 이동', () => {
    openSheet()
    window.history.replaceState({ current: '/waiting-room/AB2C' }, '')

    expect(closeOpenSheetOnHistoryBack({ fullPath: '/round-ops/AB2C?tab=log' })).toBe(false)
  })

  it('열린 시트가 없으면 뒤로가기를 그대로 둔다', () => {
    document.body.appendChild(Object.assign(document.createElement('div'), { role: 'dialog' }))
    window.history.replaceState({ current: '/' }, '')

    expect(closeOpenSheetOnHistoryBack({ fullPath: '/' })).toBe(false)
  })
})
