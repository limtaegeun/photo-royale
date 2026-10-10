import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { DEFAULT_GAME_MODE, GAME_MODE_IDS, GAME_MODES, isGameModeId } from '../registry'
import { ALL_ALLIES_TARGETING, TAIL_CHASE_TARGETING } from '../targeting'
import type { GameModeId } from '../types'

describe('game-mode registry', () => {
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

  it('게임플레이가 구현된 일반전·꼬리잡기·그룹전·왕잡기·스태프 추격전만 available이고, 나머지 3종은 미구현이라 비활성이다', () => {
    const openIds: GameModeId[] = ['normal', 'tail-chase', 'group', 'king-hunt', 'staff-chase']
    for (const id of openIds) expect(GAME_MODES[id].available).toBe(true)

    const otherIds = GAME_MODE_IDS.filter((id) => !openIds.includes(id))
    expect(otherIds).toHaveLength(3)
    for (const id of otherIds) {
      expect(GAME_MODES[id].available).toBe(false)
    }
  })

  it('그룹전·왕잡기는 같은 그룹을 잡을 수 없는 대상 제한을 공유하고, 꼬리잡기는 다음 알파벳만, 스태프 추격전은 전원 동맹으로 막으며, 나머지는 제한이 없다', () => {
    const context = { teams: ['A', 'B', 'F'], outTeams: [] }
    for (const id of ['group', 'king-hunt'] as const) {
      const targeting = GAME_MODES[id].targeting!
      expect(targeting.blockedBadge).toBe('같은 그룹')
      expect(targeting.canTarget('B', 'F', context)).toBe(false)
      expect(targeting.canTarget('B', 'A', context)).toBe(true)
    }

    expect(GAME_MODES['tail-chase'].targeting).toBe(TAIL_CHASE_TARGETING)

    expect(GAME_MODES['staff-chase'].targeting).toBe(ALL_ALLIES_TARGETING)
    expect(GAME_MODES['staff-chase'].targeting!.blockedBadge).toBe('동맹')
    expect(GAME_MODES['staff-chase'].targeting!.canTarget('A', 'B', context)).toBe(false)

    for (const id of GAME_MODE_IDS.filter(
      (id) => id !== 'group' && id !== 'king-hunt' && id !== 'tail-chase' && id !== 'staff-chase',
    )) {
      expect(GAME_MODES[id].targeting).toBeUndefined()
    }
  })

  it('X 모듈은 모드가 정한다 — 일반전만 진행자 선택, 왕잡기는 항상 켬, 나머지 선택 가능 모드는 항상 끔', () => {
    expect(GAME_MODES.normal.xModule).toBe('optional')
    expect(GAME_MODES['king-hunt'].xModule).toBe('required')
    expect(GAME_MODES['tail-chase'].xModule).toBe('off')
    expect(GAME_MODES.group.xModule).toBe('off')
    expect(GAME_MODES['staff-chase'].xModule).toBe('off')
    // 선택할 수 있는 모드는 빠짐없이 정책을 밝힌다 — 새 모드를 열 때 X를 어떻게 다룰지 정하게 한다
    for (const id of GAME_MODE_IDS.filter((id) => GAME_MODES[id].available)) {
      expect(GAME_MODES[id].xModule).toBeDefined()
    }
  })

  it('X 스위치를 잠그는 모드는 잠근 이유를 가지고, 진행자 선택 모드는 갖지 않는다', () => {
    const lockedIds = GAME_MODE_IDS.filter(
      (id) => GAME_MODES[id].xModule === 'required' || GAME_MODES[id].xModule === 'off',
    )
    const unlockedIds = GAME_MODE_IDS.filter((id) => !lockedIds.includes(id))

    expect(lockedIds).toEqual(['tail-chase', 'group', 'king-hunt', 'staff-chase'])
    for (const id of lockedIds) {
      expect(GAME_MODES[id].xModuleLockReason).toContain('X')
    }
    for (const id of unlockedIds) {
      expect(GAME_MODES[id].xModuleLockReason).toBeUndefined()
    }
  })

  it('스태프 추격전만 콕핏 킬샷 잠금 문구를 가진다 — 참가자는 킬샷을 제출하지 않는 모드', () => {
    expect(GAME_MODES['staff-chase'].killshotLock?.length).toBeGreaterThan(0)
    for (const id of GAME_MODE_IDS.filter((id) => id !== 'staff-chase')) {
      expect(GAME_MODES[id].killshotLock).toBeUndefined()
    }
  })

  /**
   * firestore.rules의 gameMode 허용 리스트는 클라 코드를 import할 수 없어 이중화되어 있다.
   * 불일치 상태로 배포되면 새 모드 확정이 전부 permission-denied로 거부되므로,
   * 레지스트리를 단일 진실원으로 삼아 rules 쪽 리스트가 항상 일치하는지 여기서 잡는다.
   */
  it('firestore.rules의 gameMode 허용 리스트가 GAME_MODE_IDS와 일치한다(이중 소스 동기화 가드)', () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')
    const listMatch = rules.match(/gameMode in \[([^\]]+)\]/)
    expect(listMatch).not.toBeNull()

    const rulesModeIds = [...listMatch![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(rulesModeIds).toEqual([...GAME_MODE_IDS])
  })
})
