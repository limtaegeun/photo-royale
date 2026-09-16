import { describe, it, expect } from 'vitest'
import { groupForArmband, isSameGroup } from '../armbandGroups'

describe('groupForArmband', () => {
  it('4색 순환으로 완장 알파벳을 그룹 색에 매핑한다(표 정본 기준)', () => {
    expect(groupForArmband('A')).toBe('blue')
    expect(groupForArmband('B')).toBe('orange')
    expect(groupForArmband('C')).toBe('green')
    expect(groupForArmband('D')).toBe('red')
    expect(groupForArmband('E')).toBe('blue')
    expect(groupForArmband('P')).toBe('red')
  })

  it('확장된 완장(U·Y·Z)도 순환 규칙을 그대로 따른다', () => {
    // charCode 오프셋 % 4: U(20)→blue, Y(24)→blue, Z(25)→orange
    expect(groupForArmband('U')).toBe('blue')
    expect(groupForArmband('Y')).toBe('blue')
    expect(groupForArmband('Z')).toBe('orange')
  })

  it('특수 완장 X는 단일 그룹이 없으므로 null을 반환한다', () => {
    expect(groupForArmband('X')).toBeNull()
  })

  it('A~Z 범위 밖(소문자·기호 등)은 throw한다', () => {
    expect(() => groupForArmband('a')).toThrow('A~Z')
    expect(() => groupForArmband('?')).toThrow('A~Z')
  })
})

describe('isSameGroup', () => {
  it('4칸 떨어진 완장끼리 같은 그룹이고, 이웃 완장은 다른 그룹이다', () => {
    expect(isSameGroup('A', 'E')).toBe(true)
    expect(isSameGroup('A', 'A')).toBe(true)
    expect(isSameGroup('A', 'B')).toBe(false)
  })

  it('그룹이 없는 X는 누구와도 같은 그룹이 아니다', () => {
    expect(isSameGroup('X', 'X')).toBe(false)
    expect(isSameGroup('A', 'X')).toBe(false)
  })
})
