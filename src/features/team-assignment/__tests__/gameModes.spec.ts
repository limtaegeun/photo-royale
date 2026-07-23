import { describe, it, expect } from 'vitest'
import {
  DEFAULT_GAME_MODE,
  GAME_MODE_IDS,
  GAME_MODES,
  isGameModeId,
} from '../gameModes'

describe('gameModes', () => {
  it('8종 모드를 고정 순서로 노출하고 각 정의가 id·라벨·설명·규칙을 갖는다', () => {
    expect(GAME_MODE_IDS).toEqual([
      'normal',
      'tail-chase',
      'group',
      'king-hunt',
      'staff-chase',
      'bomb-plant',
      'kkomkkomi',
      'fast-survival',
    ])

    for (const id of GAME_MODE_IDS) {
      const definition = GAME_MODES[id]
      expect(definition.id).toBe(id)
      expect(definition.label.length).toBeGreaterThan(0)
      expect(definition.description.length).toBeGreaterThan(0)
      expect(definition.rules.length).toBeGreaterThan(0)
    }
  })

  it('기본 모드는 일반전(normal)이다', () => {
    expect(DEFAULT_GAME_MODE).toBe('normal')
    expect(GAME_MODES[DEFAULT_GAME_MODE].label).toBe('일반전')
  })

  it('주요 모드의 한글 라벨을 확정한다', () => {
    expect(GAME_MODES.normal.label).toBe('일반전')
    expect(GAME_MODES['tail-chase'].label).toBe('꼬리잡기')
    expect(GAME_MODES['staff-chase'].label).toBe('스태프 추격전')
  })

  it('isGameModeId는 유효한 id만 통과시킨다', () => {
    expect(isGameModeId('normal')).toBe(true)
    expect(isGameModeId('king-hunt')).toBe(true)
    expect(isGameModeId('unknown')).toBe(false)
    expect(isGameModeId('')).toBe(false)
    expect(isGameModeId('Normal')).toBe(false)
  })

  it('normal 규칙은 composition → group → static(상대 완장) 순으로 구성된다', () => {
    expect(GAME_MODES.normal.rules).toEqual([
      { kind: 'composition' },
      { kind: 'group' },
      { kind: 'static', text: '상대 완장 알파벳을 찍어 제출하세요.' },
    ])
  })

  it('staff-chase는 composition 없이 정적 규칙 2개만 가진다', () => {
    const rules = GAME_MODES['staff-chase'].rules
    expect(rules).toHaveLength(2)
    expect(rules.every((rule) => rule.kind === 'static')).toBe(true)
  })
})
