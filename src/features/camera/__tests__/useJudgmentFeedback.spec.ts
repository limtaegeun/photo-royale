import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { SubmissionRecord } from '@/features/round-ops'

const unsubscribeMock = vi.fn<() => void>()
const subscribeToMySubmissionsMock =
  vi.fn<
    (
      code: string,
      uid: string,
      round: number,
      onChange: (records: SubmissionRecord[]) => void,
      onError?: (error: Error) => void,
    ) => () => void
  >()

vi.mock('@/features/round-ops', () => ({
  subscribeToMySubmissions: (
    code: string,
    uid: string,
    round: number,
    onChange: (records: SubmissionRecord[]) => void,
    onError?: (error: Error) => void,
  ) => subscribeToMySubmissionsMock(code, uid, round, onChange, onError),
}))

import { useJudgmentFeedback } from '../composables/useJudgmentFeedback'

/** 기본은 대기(pending) 한 건 — 테스트마다 바뀌는 필드만 override한다 */
function record(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    id: 's1',
    uid: 'player1',
    team: 'B',
    round: 2,
    photo: 'data:image/jpeg;base64,killshot',
    status: 'pending',
    createdAtMs: 1_000,
    targetTeam: null,
    multiplier: 1,
    judgedAtMs: null,
    ...overrides,
  }
}

function setupInScope() {
  const roomCode = ref<string | null>('AB2C')
  const uid = ref<string | null>('player1')
  const round = ref<number | null>(2)
  const toast = vi.fn<(t: { title: string; description?: string; tone: string }) => void>()
  const scope = effectScope()
  const result = scope.run(() => useJudgmentFeedback({ roomCode, uid, round, toast }))!
  return { scope, roomCode, uid, round, toast, mySubmissions: result.mySubmissions }
}

beforeEach(() => {
  subscribeToMySubmissionsMock.mockReset().mockReturnValue(unsubscribeMock)
  unsubscribeMock.mockReset()
})

describe('useJudgmentFeedback', () => {
  it('첫 스냅샷은 상태만 시드하고 토스트를 띄우지 않는다 — 이미 확정된 기록이어도 마찬가지다', () => {
    const { toast } = setupInScope()
    const onChange = subscribeToMySubmissionsMock.mock.calls[0]![3]

    onChange([record({ status: 'approved', targetTeam: 'A' })])

    expect(toast).not.toHaveBeenCalled()
  })

  it('pending → approved로 바뀌면 배정 팀과 함께 성공 토스트를 띄운다', () => {
    const { toast } = setupInScope()
    const onChange = subscribeToMySubmissionsMock.mock.calls[0]![3]

    onChange([record({ status: 'pending' })])
    onChange([record({ status: 'approved', targetTeam: 'A' })])

    expect(toast).toHaveBeenCalledExactlyOnceWith({
      title: '킬샷이 인정됐어요.',
      description: '팀 A 킬로 기록됐어요.',
      tone: 'success',
    })
  })

  it('배율 3(낙오 포착)으로 확정되면 전용 문구로 알린다', () => {
    const { toast } = setupInScope()
    const onChange = subscribeToMySubmissionsMock.mock.calls[0]![3]

    onChange([record({ status: 'pending' })])
    onChange([record({ status: 'approved', targetTeam: 'A', multiplier: 3 })])

    expect(toast).toHaveBeenCalledExactlyOnceWith({
      title: '킬샷이 낙오 포착 3배로 인정됐어요.',
      description: '팀 A 킬로 기록됐어요.',
      tone: 'success',
    })
  })

  it('pending → rejected로 바뀌면 중립 톤으로 반려를 알린다', () => {
    const { toast } = setupInScope()
    const onChange = subscribeToMySubmissionsMock.mock.calls[0]![3]

    onChange([record({ status: 'pending' })])
    onChange([record({ status: 'rejected' })])

    expect(toast).toHaveBeenCalledExactlyOnceWith({
      title: '킬샷이 반려됐어요.',
      description: '다시 찍어 제출할 수 있어요.',
      tone: 'neutral',
    })
  })

  it('이미 확정된 기록이 같은 상태로 다시 와도 반복해서 알리지 않는다', () => {
    const { toast } = setupInScope()
    const onChange = subscribeToMySubmissionsMock.mock.calls[0]![3]

    onChange([record({ status: 'pending' })])
    onChange([record({ status: 'approved', targetTeam: 'A' })])
    onChange([record({ status: 'approved', targetTeam: 'A' })])

    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('라운드가 바뀌면 이전 구독을 해제하고 새 라운드로 다시 구독한다', async () => {
    const { round } = setupInScope()
    expect(subscribeToMySubmissionsMock).toHaveBeenCalledTimes(1)
    expect(subscribeToMySubmissionsMock.mock.calls[0]![2]).toBe(2)

    round.value = 3
    await nextTick()

    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
    expect(subscribeToMySubmissionsMock).toHaveBeenCalledTimes(2)
    expect(subscribeToMySubmissionsMock.mock.calls[1]![2]).toBe(3)
  })

  it('스코프가 해제되면 구독도 해제한다', () => {
    const { scope } = setupInScope()

    scope.stop()

    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
  })

  /**
   * 기록 시트(P08)가 같은 구독에서 내 제출 목록을 읽는다 — 사진이 실린 무거운 구독을 두 번 열지
   * 않으려고 토스트와 목록이 한 구독을 나눠 쓴다.
   */
  describe('mySubmissions', () => {
    it('첫 스냅샷부터 내 제출 목록을 그대로 내보낸다', () => {
      const { mySubmissions } = setupInScope()
      const onChange = subscribeToMySubmissionsMock.mock.calls[0]![3]
      expect(mySubmissions.value).toEqual([])

      const records = [record({ id: 's1' }), record({ id: 's2', status: 'approved', targetTeam: 'A' })]
      onChange(records)

      expect(mySubmissions.value).toEqual(records)
    })

    it('판정으로 바뀐 스냅샷도 목록에 반영한다', () => {
      const { mySubmissions } = setupInScope()
      const onChange = subscribeToMySubmissionsMock.mock.calls[0]![3]

      onChange([record({ status: 'pending' })])
      onChange([record({ status: 'rejected' })])

      expect(mySubmissions.value).toHaveLength(1)
      expect(mySubmissions.value[0]!.status).toBe('rejected')
    })

    it('라운드가 바뀌면 지난 라운드 제출을 비우고 새 구독을 기다린다', async () => {
      const { round, mySubmissions } = setupInScope()
      subscribeToMySubmissionsMock.mock.calls[0]![3]([record({ id: 'r2' })])
      expect(mySubmissions.value).toHaveLength(1)

      round.value = 3
      await nextTick()

      expect(mySubmissions.value).toEqual([])
      subscribeToMySubmissionsMock.mock.calls[1]![3]([record({ id: 'r3', round: 3 })])
      expect(mySubmissions.value.map((item) => item.id)).toEqual(['r3'])
    })

    it('구독 조건이 없으면(미배정) 빈 목록이다', () => {
      const roomCode = ref<string | null>('AB2C')
      const uid = ref<string | null>(null)
      const round = ref<number | null>(2)
      const toast = vi.fn<(t: { title: string; description?: string; tone: string }) => void>()
      const scope = effectScope()

      const result = scope.run(() => useJudgmentFeedback({ roomCode, uid, round, toast }))!

      expect(result.mySubmissions.value).toEqual([])
    })
  })

  it('uid가 없으면(미배정) 구독하지 않는다', () => {
    const roomCode = ref<string | null>('AB2C')
    const uid = ref<string | null>(null)
    const round = ref<number | null>(2)
    const toast = vi.fn<(t: { title: string; description?: string; tone: string }) => void>()
    const scope = effectScope()

    scope.run(() => {
      useJudgmentFeedback({ roomCode, uid, round, toast })
    })

    expect(subscribeToMySubmissionsMock).not.toHaveBeenCalled()
  })
})
