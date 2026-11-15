import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { groupForArmband } from '../armbandGroups'

/**
 * 왕잡기 그룹 탈락의 서버 판정(firestore.rules isTeamOutInLedger)은 클라 코드를 import할 수 없어 이중화되어 있다.
 * rules의 완장 → 그룹 정규식이 groupForArmband와 어긋나면 서버가 엉뚱한 그룹의 제출을 막거나 통과시킨다.
 */
describe('firestore.rules 왕잡기 그룹 탈락 동기화 가드', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')
  const groupFn = rules.slice(rules.indexOf('function armbandGroup('), rules.indexOf('function isKingDownAt('))

  /** rules armbandGroup의 정규식 갈래를 그룹 → 글자 집합으로 읽는다 */
  function rulesGroupOf(letter: string): string {
    for (const match of groupFn.matchAll(/team\.matches\('\^\[([A-Z]+)\]\$'\) \? '(\w+)'/g)) {
      if (match[1]!.includes(letter)) return match[2]!
    }
    return 'none'
  }

  it('A~Z 모든 완장의 그룹이 groupForArmband와 같다(X는 그룹 없음)', () => {
    const letters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))
    expect(Object.fromEntries(letters.map((letter) => [letter, rulesGroupOf(letter)]))).toEqual(
      Object.fromEntries(letters.map((letter) => [letter, groupForArmband(letter) ?? 'none'])),
    )
  })

  it('왕잡기 모드에서만 같은 그룹 왕의 아웃으로 탈락시키고, 왕 칸 네 개를 본다', () => {
    const kingFn = rules.slice(rules.indexOf('function isKingDownInGroup('), rules.indexOf('function isTeamOutInLedger('))
    expect(kingFn).toContain("ledger.mode == 'king-hunt'")
    for (const index of [0, 1, 2, 3]) expect(kingFn).toContain(`isKingDownAt(ledger, team, ${index})`)
    expect(rules).toContain('return hitsReachLives(ledger, team) || isKingDownInGroup(ledger, team);')
  })

  it('킬샷 제출 갈래가 이 탈락 판정을 쓴다', () => {
    const submissions = rules.slice(rules.indexOf('match /submissions/{submissionId}'))
    expect(submissions).toContain('!isTeamOutInLedger(')
  })
})
