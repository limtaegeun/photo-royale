import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { SubmissionRecord } from '@/features/round-ops'

const unsubscribeMock = vi.fn<() => void>()
const subscribeToHitsOnTeamMock =
  vi.fn<
    (
      code: string,
      round: number,
      team: string,
      onChange: (records: SubmissionRecord[]) => void,
      onError?: (error: Error) => void,
    ) => () => void
  >()

vi.mock('@/features/round-ops', () => ({
  subscribeToHitsOnTeam: (
    code: string,
    round: number,
    team: string,
    onChange: (records: SubmissionRecord[]) => void,
    onError?: (error: Error) => void,
  ) => subscribeToHitsOnTeamMock(code, round, team, onChange, onError),
}))

import { useEliminationNotice } from '../composables/useEliminationNotice'

function hit(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    id: 'h1',
    uid: 'attacker1',
    team: 'E',
    round: 1,
    photo: 'data:image/jpeg;base64,hit',
    status: 'approved',
    createdAtMs: 1_000,
    targetTeam: 'B',
    multiplier: 1,
    judgedAtMs: 2_000,
    rejectReason: null,
    ...overrides,
  }
}

const vibrateMock = vi.fn<(pattern: number) => boolean>()

function setupInScope(initial: { lives?: number | null; enabled?: boolean } = {}) {
  const roomCode = ref<string | null>('AB2C')
  const team = ref<string | null>('B')
  const round = ref<number | null>(1)
  const lives = ref<number | null>(initial.lives === undefined ? 1 : initial.lives)
  const enabled = ref(initial.enabled ?? true)
  const scope = effectScope()
  const result = scope.run(() => useEliminationNotice({ roomCode, team, round, lives, enabled }))!
  /** 가장 최근 구독의 스냅샷 콜백 */
  const deliver = (records: SubmissionRecord[]) => subscribeToHitsOnTeamMock.mock.lastCall![3](records)
  return { scope, roomCode, team, round, lives, enabled, deliver, ...result }
}

beforeEach(() => {
  subscribeToHitsOnTeamMock.mockReset().mockReturnValue(unsubscribeMock)
  unsubscribeMock.mockReset()
  vibrateMock.mockReset().mockReturnValue(true)
  Object.defineProperty(navigator, 'vibrate', { value: vibrateMock, configurable: true })
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('useEliminationNotice (P21)', () => {
  it('방·차수·우리 팀으로 구독하고, 배정 전(팀 없음)이면 구독하지 않는다', async () => {
    const { team, scope } = setupInScope()
    expect(subscribeToHitsOnTeamMock).toHaveBeenCalledWith('AB2C', 1, 'B', expect.any(Function), expect.any(Function))

    team.value = null
    await nextTick()
    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
    expect(subscribeToHitsOnTeamMock).toHaveBeenCalledTimes(1)

    scope.stop()
  })

  it('첫 스냅샷이어도 확인하지 않은 피격이면 안내를 띄우고 진동을 한 번 울린다 — 화면을 끄고 뛰던 팀원도 알아야 한다', async () => {
    const { deliver, notice, eliminatedBy, scope } = setupInScope()

    deliver([hit()])
    await nextTick()

    expect(notice.value).toMatchObject({ submissionId: 'h1', kind: 'out', attackerTeam: 'E' })
    expect(eliminatedBy.value).toBe('E')
    expect(vibrateMock).toHaveBeenCalledExactlyOnceWith(200)

    // 같은 피격이 다시 와도(다른 필드 갱신) 진동은 다시 울리지 않는다
    deliver([hit({ judgedAtMs: 2_500 })])
    await nextTick()
    expect(vibrateMock).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('확인하면 닫히고, 새로 구독해도(새로고침·재입장) 같은 피격으로 다시 띄우지 않는다', async () => {
    const first = setupInScope()
    first.deliver([hit()])
    await nextTick()
    first.acknowledge()
    expect(first.notice.value).toBeNull()
    // 상태 카드의 잡은 팀은 확인과 무관하게 남는다
    expect(first.eliminatedBy.value).toBe('E')
    first.scope.stop()

    const second = setupInScope()
    second.deliver([hit()])
    await nextTick()
    expect(second.notice.value).toBeNull()
    second.scope.stop()
  })

  it('확인 기록은 방·차수별이다 — 다음 차수의 피격은 다시 알린다', async () => {
    const { deliver, acknowledge, round, notice, scope } = setupInScope()
    deliver([hit()])
    await nextTick()
    acknowledge()

    round.value = 2
    await nextTick()
    deliver([hit({ round: 2 })])
    await nextTick()
    expect(notice.value).toMatchObject({ submissionId: 'h1' })
    scope.stop()
  })

  it('기기 저장소가 막혀도 안내는 뜨고, 이 탭에서는 확인한 피격을 기억한다', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { deliver, acknowledge, notice, scope } = setupInScope()
    deliver([hit()])
    await nextTick()
    expect(notice.value).not.toBeNull()

    acknowledge()
    deliver([hit()])
    await nextTick()
    expect(notice.value).toBeNull()

    getItem.mockRestore()
    setItem.mockRestore()
    scope.stop()
  })

  it('1인 팀은 첫 피격에 남은 목숨을, 두 번째에 탈락을 알린다', async () => {
    const { deliver, acknowledge, notice, eliminatedBy, scope } = setupInScope({ lives: 2 })
    deliver([hit()])
    await nextTick()
    expect(notice.value).toMatchObject({ kind: 'hit', livesLeft: 1 })
    expect(eliminatedBy.value).toBeNull()
    acknowledge()

    deliver([hit(), hit({ id: 'h2', team: 'C', judgedAtMs: 9_000 })])
    await nextTick()
    expect(notice.value).toMatchObject({ submissionId: 'h2', kind: 'out', attackerTeam: 'C' })
    expect(eliminatedBy.value).toBe('C')
    expect(vibrateMock).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('원장이 없거나(목숨 모름) 모드가 끄면 안내도 잡은 팀도 내지 않는다', async () => {
    const { deliver, lives, enabled, notice, eliminatedBy, scope } = setupInScope({ lives: null })
    deliver([hit()])
    await nextTick()
    expect(notice.value).toBeNull()
    expect(eliminatedBy.value).toBeNull()

    lives.value = 1
    await nextTick()
    expect(notice.value).not.toBeNull()

    enabled.value = false
    await nextTick()
    expect(notice.value).toBeNull()
    expect(eliminatedBy.value).toBeNull()
    scope.stop()
  })

  it('스코프가 끝나면 구독을 끊는다', () => {
    const { scope } = setupInScope()
    scope.stop()
    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
  })
})
