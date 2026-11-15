import { describe, it, expect } from 'vitest'
import { SAFETY_RULES, isSafetyConsentValid } from '../safetyConsent'

describe('isSafetyConsentValid', () => {
  const now = new Date(2026, 10, 15, 14, 30).getTime()

  it('동의 기록이 없으면 유효하지 않다(늦게 들어온 사람은 처음 준비할 때 묻는다)', () => {
    expect(isSafetyConsentValid(null, now)).toBe(false)
  })

  it('같은 날 동의는 자정 직후 동의여도 유효하다(다음 라운드에 다시 묻지 않는다)', () => {
    expect(isSafetyConsentValid(new Date(2026, 10, 15, 0, 0).getTime(), now)).toBe(true)
    expect(isSafetyConsentValid(new Date(2026, 10, 15, 14, 29).getTime(), now)).toBe(true)
  })

  it('어제 동의는 오늘 다시 묻는다', () => {
    expect(isSafetyConsentValid(new Date(2026, 10, 14, 23, 59).getTime(), now)).toBe(false)
  })
})

describe('SAFETY_RULES', () => {
  it('기획서의 수칙 4개를 순서대로 담는다', () => {
    expect(SAFETY_RULES.map((rule) => rule.title)).toEqual([
      '뛰기 전에 주변부터 봐주세요.',
      '계단, 경사로, 젖은 바닥에서는 걸어요.',
      '공원은 우리만 쓰는 곳이 아니에요.',
      '힘들면 언제든 쉬어도 괜찮아요.',
    ])
  })
})
