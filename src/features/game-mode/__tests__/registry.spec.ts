import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { DEFAULT_GAME_MODE, GAME_MODE_IDS, GAME_MODES, isGameModeId } from '../registry'
import { ALL_ALLIES_TARGETING, TAIL_CHASE_TARGETING, X_ONLY_TARGETING } from '../targeting'
import type { GameModeId } from '../types'

describe('game-mode registry', () => {
  it('8종 모드를 고정 순서로 노출하고 각 정의가 id·라벨·설명·목표·모드 카드를 갖는다', () => {
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
      expect(definition.objective.length).toBeGreaterThan(0)
      expect(definition.ruleCard.icon.length).toBeGreaterThan(0)
      expect(definition.ruleCard.lines.length).toBeGreaterThan(0)
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

  /** 노션 ② "라운드 모드 카드" 원문 — 문구를 바꾸면 노션과 어긋난다 */
  it('선택 가능한 5개 모드의 카드 문구가 노션 ② 원문과 같다', () => {
    expect(GAME_MODES.normal.ruleCard).toEqual({
      icon: 'target',
      headline: '개인전: 모든 팀을 전멸시키세요',
      lines: [
        '우리 팀 말고는 모두 적이에요.',
        '마지막까지 살아남고 많이 잡으세요.',
        'X 완장은 특별해요. X끼리만 서로 잡을 수 있어요.',
      ],
    })
    expect(GAME_MODES['tail-chase'].ruleCard).toEqual({
      icon: 'tail',
      lines: [
        '바로 다음 알파벳만 잡을 수 있어요.',
        'A는 B만, B는 C만 잡아요.',
        '내 타깃은 완장 옆에 떠 있어요.',
        '잡히면 나를 잡은 팀의 꼬리가 되어 같이 움직여요.',
      ],
    })
    expect(GAME_MODES.group.ruleCard).toEqual({
      icon: 'group',
      lines: [
        '완장 색이 같으면 한편이에요.',
        '빨강, 파랑, 초록, 주황 네 그룹이 싸워요.',
        '같은 색은 잡을 수 없어요.',
        '그룹이 함께 번 점수와 우리 팀 점수를 더해서 계산해요.',
      ],
    })
    expect(GAME_MODES['king-hunt'].ruleCard).toEqual({
      icon: 'crown',
      lines: [
        '그룹마다 몰래 왕을 1명 정해요.',
        '왕을 잡으면 잡은 사람이 +30점을 얻어요. 그룹 전체는 +10점을 얻어요.',
        '우리 왕이 잡히면 그 판은 그룹 전체가 즉시 아웃됩니다.',
        '왕을 꼭 지키세요.',
      ],
    })
    expect(GAME_MODES['staff-chase'].ruleCard).toEqual({
      icon: 'timer',
      headline: '추격전: 3분동안 헌터로부터 살아남으세요',
      lines: [
        '이번엔 모두가 한편이에요. 스태프가 헌터가 되어 쫓아와요.',
        '끝까지 살아남은 사람이 많을수록 모두의 점수가 올라가요.',
      ],
    })
  })

  it('굵은 첫 줄이 있는 카드는 그 문구가 콕핏 목표 문구와 같다 — 노션 ② "굵은 첫 줄은 카메라 화면 맨 위 목표 문구와 같아요"', () => {
    const withHeadline = GAME_MODE_IDS.filter((id) => GAME_MODES[id].ruleCard.headline !== undefined)
    expect(withHeadline).toEqual(['normal', 'staff-chase'])
    for (const id of withHeadline) {
      expect(GAME_MODES[id].objective).toBe(GAME_MODES[id].ruleCard.headline)
    }
  })

  it('왕잡기만 비밀 왕 모드다 — 왕은 X 완장 대신 비밀 왕 배지를 받는다', () => {
    expect(GAME_MODES['king-hunt'].secretKing).toBe(true)
    expect(GAME_MODES['king-hunt'].xTeamBadge).toBe('비밀 왕')
    for (const id of GAME_MODE_IDS.filter((id) => id !== 'king-hunt')) {
      expect(GAME_MODES[id].secretKing).toBeUndefined()
    }
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

  it('그룹전·왕잡기는 같은 그룹을 잡을 수 없는 대상 제한을 공유하고, 꼬리잡기는 다음 알파벳만, 스태프 추격전은 전원 동맹, 일반전은 X끼리만으로 막으며, 나머지는 제한이 없다', () => {
    const context = { teams: ['A', 'B', 'F'], outTeams: [], xTeams: [] }
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

    expect(GAME_MODES.normal.targeting).toBe(X_ONLY_TARGETING)

    for (const id of GAME_MODE_IDS.filter(
      (id) =>
        id !== 'group' &&
        id !== 'king-hunt' &&
        id !== 'tail-chase' &&
        id !== 'staff-chase' &&
        id !== 'normal',
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
