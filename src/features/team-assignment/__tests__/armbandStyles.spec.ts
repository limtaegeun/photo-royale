import { describe, it, expect } from 'vitest'
import {
  displayGroup,
  groupBorderClass,
  groupLabelEn,
  groupLabelKo,
  groupSolidBgClass,
  groupSolidBorderClass,
  groupTextClass,
} from '../armbandStyles'

describe('armbandStyles', () => {
  it('완장 알파벳을 4색 순환 그룹으로 매핑한다', () => {
    expect(displayGroup('A')).toBe('blue')
    expect(displayGroup('B')).toBe('orange')
    expect(displayGroup('C')).toBe('green')
    expect(displayGroup('D')).toBe('red')
    expect(displayGroup('E')).toBe('blue')
  })

  it('표시 계층 방어 — 미배정·특수 완장 X·비정상 입력은 모두 중립(null)으로 흡수한다', () => {
    // groupForArmband는 이 입력들에 throw하거나 null을 주지만, 표시 계층은 절대 던지지 않아야 한다
    expect(displayGroup(null)).toBeNull()
    expect(displayGroup(undefined)).toBeNull()
    expect(displayGroup('')).toBeNull()
    expect(displayGroup('X')).toBeNull()
    expect(displayGroup('a')).toBeNull()
    expect(displayGroup('AB')).toBeNull()
  })

  it('그룹별 클래스는 완전한 리터럴 유틸리티 이름을 돌려준다(Tailwind 스캐너 대응)', () => {
    expect(groupTextClass('A')).toBe('text-team-blue')
    expect(groupSolidBgClass('B')).toBe('bg-team-orange-solid')
    expect(groupBorderClass('C')).toBe('border-team-green')
    expect(groupSolidBorderClass('D')).toBe('border-team-red-solid')
  })

  it('중립일 때는 각 용도에 맞는 중립 토큰 클래스로 떨어진다', () => {
    expect(groupTextClass(null)).toBe('text-content-secondary')
    expect(groupSolidBgClass(null)).toBe('bg-neutral')
    expect(groupBorderClass(null)).toBe('border-stroke-strong')
    expect(groupSolidBorderClass(null)).toBe('border-stroke')
  })

  it('색약 대응 라벨은 한글·영문 모두 제공하고, 중립이면 빈 문자열이다', () => {
    expect(groupLabelKo('A')).toBe('파랑')
    expect(groupLabelEn('A')).toBe('BLUE')
    expect(groupLabelKo('X')).toBe('')
    expect(groupLabelEn(null)).toBe('')
  })
})
