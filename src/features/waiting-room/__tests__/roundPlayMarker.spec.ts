import { describe, it, expect, beforeEach, vi } from 'vitest'
import { hasPlayedRound, markRoundPlayed } from '../roundPlayMarker'

describe('roundPlayMarker', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('마크한 방·차수는 hasPlayedRound가 true를 돌려준다', () => {
    markRoundPlayed('AB2C', 1)

    expect(hasPlayedRound('AB2C', 1)).toBe(true)
  })

  it('마크하지 않은 방·차수는 false다', () => {
    expect(hasPlayedRound('AB2C', 1)).toBe(false)
  })

  it('다른 방·다른 차수는 서로 격리된다', () => {
    markRoundPlayed('AB2C', 1)

    expect(hasPlayedRound('ZZ99', 1)).toBe(false) // 다른 방 코드
    expect(hasPlayedRound('AB2C', 2)).toBe(false) // 같은 방, 다른 차수
  })

  /**
   * 가드는 best-effort다 — Safari 프라이빗 모드 등에서 sessionStorage.setItem이 throw해도
   * markRoundPlayed는 조용히 무시하고(가드가 없을 뿐 실행을 막지 않는다), 이후 조회도 실패 상태를
   * 그대로 반영해 false로 수렴해야 한다.
   */
  it('setItem이 throw해도 markRoundPlayed는 에러를 던지지 않고 조용히 무시한다', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => markRoundPlayed('AB2C', 1)).not.toThrow()
    expect(hasPlayedRound('AB2C', 1)).toBe(false)

    setItemSpy.mockRestore()
  })
})
