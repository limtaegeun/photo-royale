import { describe, it, expect } from 'vitest'
import { ARMBAND_LABELS, armbandForTeamIndex } from '../armbands'

describe('ARMBAND_LABELS', () => {
  it('X를 제외한 알파벳 전체 25개다', () => {
    expect(ARMBAND_LABELS).toHaveLength(25)
    expect(ARMBAND_LABELS).not.toContain('X')
    // X를 건너뛰므로 W 다음이 Y로 이어진다
    expect(ARMBAND_LABELS.indexOf('W')).toBe(22)
    expect(ARMBAND_LABELS.indexOf('Y')).toBe(23)
    expect(ARMBAND_LABELS.indexOf('Z')).toBe(24)
  })
})

describe('armbandForTeamIndex', () => {
  it('팀 순번을 완장 알파벳으로 매핑한다(X는 건너뛴다)', () => {
    expect(armbandForTeamIndex(0)).toBe('A')
    expect(armbandForTeamIndex(3)).toBe('D')
    expect(armbandForTeamIndex(4)).toBe('E')
    expect(armbandForTeamIndex(15)).toBe('P')
    expect(armbandForTeamIndex(16)).toBe('Q')
    expect(armbandForTeamIndex(22)).toBe('W')
    expect(armbandForTeamIndex(23)).toBe('Y')
    expect(armbandForTeamIndex(24)).toBe('Z')
  })

  it('완장 개수(0~24) 밖이거나 정수가 아니면 throw한다', () => {
    expect(() => armbandForTeamIndex(25)).toThrow('완장')
    expect(() => armbandForTeamIndex(-1)).toThrow('완장')
    expect(() => armbandForTeamIndex(1.5)).toThrow('정수')
  })
})
