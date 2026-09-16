import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { ROUND_RESULT_KEYS, ROUND_SNAPSHOT_KEYS, ROUND_TALLY_KEYS } from '../types'

/**
 * rules는 클라 코드를 import할 수 없어 rounds 문서의 키 목록이 types.ts와 이중화되어 있다.
 * 한쪽만 바꾸면 배정 확정·판정·종료 배치가 통째로 permission-denied가 된다(배치라 다른 쓰기까지
 * 같이 실패한다). rules 파일을 직접 읽어 갈래 존재와 키 목록을 대조한다(notices.spec 패턴).
 */
describe('firestore.rules 라운드 원장 규칙 동기화 가드', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')
  const roundsBlock = rules.match(/match \/rounds\/\{roundNo\}[\s\S]*?\n {6}\}/)?.[0]

  /** rules 리스트 리터럴 `['a', 'b']`를 문자열 배열로 */
  function parseList(source: string, prefix: string): string[][] {
    return [...source.matchAll(new RegExp(`${prefix}\\(\\[([^\\]]+)\\]\\)`, 'g'))].map((m) =>
      [...m[1]!.matchAll(/'([^']+)'/g)].map((k) => k[1]!),
    )
  }

  it('rounds 갈래가 존재하고 삭제를 막는다', () => {
    expect(roundsBlock).toBeDefined()
    expect(roundsBlock).toContain('allow delete: if false;')
  })

  it('create 갈래의 키 화이트리스트(hasAll·hasOnly)가 ROUND_SNAPSHOT_KEYS와 같다', () => {
    const createBlock = roundsBlock!.match(/allow create:[\s\S]*?;/)![0]
    expect(parseList(createBlock, 'keys\\(\\)\\.hasAll')).toEqual([[...ROUND_SNAPSHOT_KEYS]])
    expect(parseList(createBlock, 'keys\\(\\)\\.hasOnly')).toEqual([[...ROUND_SNAPSHOT_KEYS]])
  })

  it('create는 같은 배치의 방 문서(getAfter)와 차수·모드를 대조한다 — 스냅샷 단독 생성 불가', () => {
    const createBlock = roundsBlock!.match(/allow create:[\s\S]*?;/)![0]
    expect(createBlock).toContain('roundNo == string(getAfter(')
    expect(createBlock).toMatch(/\.mode\s*==\s*getAfter\([\s\S]*?\)\.data\.gameMode/)
  })

  it('update 갈래 ②(판정 집계)가 허용하는 키가 ROUND_TALLY_KEYS와 같다', () => {
    const updateBlock = roundsBlock!.match(/allow update:[\s\S]*?\n {10}\);/)![0]
    const affected = parseList(updateBlock, 'affectedKeys\\(\\)\\.hasOnly')
    expect(affected).toContainEqual([...ROUND_TALLY_KEYS])
    expect(affected).toContainEqual(['result'])
  })

  it('update 갈래 ③(정산 확정)의 result 키 화이트리스트가 ROUND_RESULT_KEYS와 같다', () => {
    const updateBlock = roundsBlock!.match(/allow update:[\s\S]*?\n {10}\);/)![0]
    expect(parseList(updateBlock, 'result\\.keys\\(\\)\\.hasAll')).toEqual([[...ROUND_RESULT_KEYS]])
    expect(parseList(updateBlock, 'result\\.keys\\(\\)\\.hasOnly')).toEqual([[...ROUND_RESULT_KEYS]])
  })

  it('정산 확정은 게임 종료 배치와 함께만 성립한다(커밋 후 방 상태 waiting 대조)', () => {
    const updateBlock = roundsBlock!.match(/allow update:[\s\S]*?\n {10}\);/)![0]
    expect(updateBlock).toMatch(/getAfter\([\s\S]*?\)\.data\.status == 'waiting'/)
  })
})
