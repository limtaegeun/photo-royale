import { describe, it, expect } from 'vitest'
import { formatClock } from '../formatClock'

describe('formatClock', () => {
  it('기기 시간대의 시:분을 두 자리로 맞춘다', () => {
    expect(formatClock(new Date(2026, 10, 8, 9, 5).getTime())).toBe('09:05')
    expect(formatClock(new Date(2026, 10, 8, 14, 32).getTime())).toBe('14:32')
  })
})
