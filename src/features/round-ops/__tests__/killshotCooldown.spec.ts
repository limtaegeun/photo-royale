import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/api/firebase', () => ({ db: {} }))

type SnapshotHandler = (snapshot: { exists: () => boolean; data: () => Record<string, unknown> }) => void
const onSnapshotMock = vi.fn<(ref: unknown, next: SnapshotHandler, error: (e: Error) => void) => () => void>()

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  onSnapshot: (ref: unknown, next: SnapshotHandler, error: (e: Error) => void) => onSnapshotMock(ref, next, error),
}))

import {
  KILLSHOT_HEAT_CAP_SEC,
  KILLSHOT_HEAT_PER_SUBMIT_SEC,
  KILLSHOT_HEAT_SERVER_GRACE_SEC,
  subscribeToKillshotCooldown,
} from '../api/killshotCooldown'

describe('subscribeToKillshotCooldown', () => {
  it('내 열 문서를 구독하고 서버 시각을 ms 로 바꿔 넘긴다', () => {
    const onChange = vi.fn<(cooldown: unknown) => void>()
    onSnapshotMock.mockImplementation((ref, next) => {
      expect(ref).toEqual({ path: 'rooms/AB2C/killshotCooldowns/player1' })
      next({ exists: () => true, data: () => ({ round: 2, heat: 9, lastAt: { toMillis: () => 1234 } }) })
      next({ exists: () => true, data: () => ({ round: 2, heat: 12, lastAt: null }) })
      next({ exists: () => false, data: () => ({}) })
      return () => {}
    })

    subscribeToKillshotCooldown('AB2C', 'player1', onChange)

    expect(onChange.mock.calls).toEqual([
      [{ round: 2, heat: 9, lastAtMs: 1234 }],
      // 내 쓰기가 아직 서버에 닿지 않은 스냅샷 — 서버 시각이 없다
      [{ round: 2, heat: 12, lastAtMs: null }],
      [null],
    ])
  })
})

describe('firestore.rules 동기화', () => {
  const rules = readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8')
  const block = rules.slice(rules.indexOf('match /killshotCooldowns/{uid}'))
  const cooldownRules = block.slice(0, block.indexOf('\n      }'))

  it('1칸·꽉 참·서버 여유가 코드 상수와 숫자까지 같다', () => {
    expect(cooldownRules).toContain(`request.resource.data.heat >= ${KILLSHOT_HEAT_PER_SUBMIT_SEC}\n`)
    expect(cooldownRules).toContain(`request.resource.data.heat <= ${KILLSHOT_HEAT_CAP_SEC}\n`)
    expect(cooldownRules).toContain(`>= cooledHeat() + ${KILLSHOT_HEAT_PER_SUBMIT_SEC})`)
    expect(cooldownRules).toContain(`resource.data.heat - ${KILLSHOT_HEAT_SERVER_GRACE_SEC}\n`)
  })

  it('제출 갈래는 같은 배치에서 내 열 문서를 이번 서버 시각으로 썼는지 대조한다(rules 2차)', () => {
    const start = rules.indexOf('match /submissions/{submissionId}')
    const submissionCreate = rules.slice(rules.indexOf('allow create:', start), rules.indexOf('allow update:', start))
    expect(submissionCreate).toMatch(
      /getAfter\(\/databases\/\$\(database\)\/documents\/rooms\/\$\(roomCode\)\/killshotCooldowns\/\$\(request\.auth\.uid\)\)\.data\.lastAt\s+== request\.time;/,
    )
  })

  it('본인만 쓰고, 서버 시각을 찍고, 지금 라운드여야 한다', () => {
    expect(cooldownRules).toContain('request.auth.uid == uid')
    expect(cooldownRules).toContain('request.resource.data.lastAt == request.time')
    expect(cooldownRules).toContain("hasOnly(['round', 'heat', 'lastAt'])")
    expect(cooldownRules).toMatch(
      /request\.resource\.data\.round\s+== get\(\/databases\/\$\(database\)\/documents\/rooms\/\$\(roomCode\)\)\.data\.assignmentRound/,
    )
  })
})
