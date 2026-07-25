import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Participant, RoomInfo, RoundState } from '@/features/waiting-room'
import type { Notice } from '../api/notices'

// 테스트마다 로그인 상태를 바꿀 수 있도록 getter로 참조한다
const authState = { user: null as { uid: string } | null }
vi.mock('@/features/auth', () => ({
  useAuthStore: () => ({
    get user() {
      return authState.user
    },
  }),
}))

const unsubscribeRoomMock = vi.fn<() => void>()
const unsubscribeParticipantsMock = vi.fn<() => void>()
const unsubscribeNoticeMock = vi.fn<() => void>()
const subscribeRoomMock =
  vi.fn<(code: string, onChange: (room: RoomInfo | null) => void) => () => void>()
const subscribeParticipantsMock =
  vi.fn<(code: string, onChange: (participants: Participant[]) => void) => () => void>()
const subscribeNoticeMock =
  vi.fn<(code: string, onChange: (notice: Notice | null) => void) => () => void>()

const endGameMock = vi.fn<(code: string) => Promise<void>>()

vi.mock('@/features/waiting-room', () => ({
  endGame: (code: string) => endGameMock(code),
  // 순수 판정 함수 — firebase에 의존하지 않으므로 실제와 같은 로직을 그대로 쓴다
  isAssignedInRound: (participant: Participant, assignmentRound: number) =>
    assignmentRound > 0 &&
    participant.team !== null &&
    participant.assignedRound === assignmentRound,
  subscribeToRoom: (code: string, onChange: (room: RoomInfo | null) => void) =>
    subscribeRoomMock(code, onChange),
  subscribeToParticipants: (code: string, onChange: (participants: Participant[]) => void) =>
    subscribeParticipantsMock(code, onChange),
}))

const startRoundMock = vi.fn<(code: string) => Promise<void>>()
const pauseRoundMock = vi.fn<(code: string, remainingMs: number) => Promise<void>>()
const resumeRoundMock = vi.fn<(code: string, remainingMs: number) => Promise<void>>()
const adjustRoundMock =
  vi.fn<
    (code: string, status: string, remainingMs: number, deltaMs: number) => Promise<void>
  >()

vi.mock('../api/round', () => ({
  ROUND_DURATION_DEFAULT_MS: 20 * 60 * 1000,
  ROUND_ADJUST_STEP_MS: 60 * 1000,
  ROUND_DURATION_MAX_MS: 3 * 60 * 60 * 1000,
  startRound: (code: string) => startRoundMock(code),
  pauseRound: (code: string, remainingMs: number) => pauseRoundMock(code, remainingMs),
  resumeRound: (code: string, remainingMs: number) => resumeRoundMock(code, remainingMs),
  adjustRound: (code: string, status: string, remainingMs: number, deltaMs: number) =>
    adjustRoundMock(code, status, remainingMs, deltaMs),
}))

const sendNoticeMock = vi.fn<(code: string, text: string) => Promise<void>>()

vi.mock('../api/notices', () => ({
  NOTICE_TEXT_MAX_LENGTH: 100,
  sendNotice: (code: string, text: string) => sendNoticeMock(code, text),
  subscribeToLatestNotice: (code: string, onChange: (notice: Notice | null) => void) =>
    subscribeNoticeMock(code, onChange),
}))

import { useRoundOpsStore } from '../stores/useRoundOpsStore'

const NOW = new Date('2026-07-25T19:20:00Z').getTime()

/** 구독 콜백들을 붙잡아 테스트가 스냅샷 도착을 흉내 낼 수 있게 한다 */
function captureSnapshotCallbacks() {
  let deliverRoom: (room: RoomInfo | null) => void = () => {}
  let deliverParticipants: (participants: Participant[]) => void = () => {}
  let deliverNotice: (notice: Notice | null) => void = () => {}
  subscribeRoomMock.mockImplementation((_code, onChange) => {
    deliverRoom = onChange
    return unsubscribeRoomMock
  })
  subscribeParticipantsMock.mockImplementation((_code, onChange) => {
    deliverParticipants = onChange
    return unsubscribeParticipantsMock
  })
  subscribeNoticeMock.mockImplementation((_code, onChange) => {
    deliverNotice = onChange
    return unsubscribeNoticeMock
  })
  return {
    room: (room: RoomInfo | null) => deliverRoom(room),
    participants: (participants: Participant[]) => deliverParticipants(participants),
    notice: (notice: Notice | null) => deliverNotice(notice),
  }
}

function room(overrides: Partial<RoomInfo> = {}): RoomInfo {
  return {
    hostUid: 'me',
    status: 'playing',
    assignmentRound: 2,
    gameMode: 'normal',
    round: null,
    ...overrides,
  }
}

const RUNNING: RoundState = {
  status: 'running',
  startedAtMs: NOW,
  durationMs: 1_200_000,
  pausedRemainingMs: null,
}
const PAUSED: RoundState = {
  status: 'paused',
  startedAtMs: NOW,
  durationMs: 300_000,
  pausedRemainingMs: 300_000,
}

function assigned(id: string, team: string, assignedRound: number): Participant {
  return {
    id,
    name: id,
    team,
    assignedRound,
    gender: null,
    isXTeam: false,
    sameGenderStreak: 0,
    previousPartnerIds: [],
    isReady: true,
  }
}

describe('useRoundOpsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    authState.user = { uid: 'me' }
    for (const mock of [
      startRoundMock,
      pauseRoundMock,
      resumeRoundMock,
      adjustRoundMock,
      sendNoticeMock,
      endGameMock,
    ]) {
      mock.mockReset().mockResolvedValue(undefined)
    }
    subscribeRoomMock.mockReset().mockReturnValue(unsubscribeRoomMock)
    subscribeParticipantsMock.mockReset().mockReturnValue(unsubscribeParticipantsMock)
    subscribeNoticeMock.mockReset().mockReturnValue(unsubscribeNoticeMock)
    unsubscribeRoomMock.mockReset()
    unsubscribeParticipantsMock.mockReset()
    unsubscribeNoticeMock.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('구독 수명주기', () => {
    it('enter는 방 문서·명단·최근 공지를 구독하고 첫 스냅샷에서 ready가 된다', () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()

      store.enter('AB2C')

      expect(store.phase).toBe('loading')
      expect(subscribeRoomMock).toHaveBeenCalledWith('AB2C', expect.any(Function))
      expect(subscribeParticipantsMock).toHaveBeenCalledWith('AB2C', expect.any(Function))
      expect(subscribeNoticeMock).toHaveBeenCalledWith('AB2C', expect.any(Function))

      deliver.room(room({ round: RUNNING }))

      expect(store.phase).toBe('ready')
      expect(store.isHost).toBe(true)
      expect(store.gameStatus).toBe('playing')
      expect(store.round).toEqual(RUNNING)
    })

    it('세션이 없으면 구독하지 않고 error로 남는다', () => {
      authState.user = null
      const store = useRoundOpsStore()

      store.enter('AB2C')

      expect(store.phase).toBe('error')
      expect(subscribeRoomMock).not.toHaveBeenCalled()
    })

    it('방 문서가 없으면 not-found로 수렴한다', () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('ZZZZ')

      deliver.room(null)

      expect(store.phase).toBe('not-found')
    })

    it('leave는 세 구독을 모두 해제하고 대기값까지 비운다', () => {
      captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      store.adjustBy(2)

      store.leave()

      expect(unsubscribeRoomMock).toHaveBeenCalledTimes(1)
      expect(unsubscribeParticipantsMock).toHaveBeenCalledTimes(1)
      expect(unsubscribeNoticeMock).toHaveBeenCalledTimes(1)
      expect(store.roomCode).toBeNull()
      expect(store.room).toBeNull()
      expect(store.latestNotice).toBeNull()
      expect(store.pendingAdjustMinutes).toBe(0)
      expect(store.phase).toBe('idle')
    })
  })

  describe('요약 파생값', () => {
    it('이번 라운드에 배정된 참가자의 완장 고유 개수를 팀 수로 센다', () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room({ assignmentRound: 2 }))

      deliver.participants([
        assigned('u1', 'A', 2),
        assigned('u2', 'A', 2),
        assigned('u3', 'B', 2),
        // 직전 라운드 잔재 — 이번 라운드 팀 수에 섞이면 안 된다
        assigned('u4', 'C', 1),
      ])

      expect(store.assignedTeamCount).toBe(2)
    })
  })

  describe('라운드 액션 가드', () => {
    it('호스트가 아니면 아무 것도 쓰지 않는다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room({ hostUid: 'host9' }))

      await store.start()

      expect(startRoundMock).not.toHaveBeenCalled()
    })

    it('아직 시작되지 않은 방(waiting)에서는 라운드를 쓰지 않는다 — rules와 같은 조건', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room({ status: 'waiting' }))

      await store.start()

      expect(startRoundMock).not.toHaveBeenCalled()
    })

    it('진행 중이 아니면 일시정지를, 정지 중이 아니면 재개를 무시한다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room({ round: PAUSED }))

      await store.pause()
      expect(pauseRoundMock).not.toHaveBeenCalled()

      deliver.room(room({ round: RUNNING }))
      await store.resume()
      expect(resumeRoundMock).not.toHaveBeenCalled()
    })
  })

  describe('라운드 액션', () => {
    it('start는 방 코드로 라운드를 건다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room())

      await store.start()

      expect(startRoundMock).toHaveBeenCalledExactlyOnceWith('AB2C')
    })

    it('pause는 클릭 순간의 남은 시간을 계산해 넘긴다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room({ round: RUNNING }))

      vi.setSystemTime(NOW + 60_000)
      await store.pause()

      expect(pauseRoundMock).toHaveBeenCalledExactlyOnceWith('AB2C', 1_140_000)
    })

    it('resume은 정지 중 고정된 남은 시간을 넘긴다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room({ round: PAUSED }))

      vi.setSystemTime(NOW + 600_000) // 정지 중 흐른 시간은 남은 시간에 영향을 주지 않는다
      await store.resume()

      expect(resumeRoundMock).toHaveBeenCalledExactlyOnceWith('AB2C', 300_000)
    })

    it('실패하면 안내를 세우고 다음 시도에서 비운다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room())

      startRoundMock.mockRejectedValueOnce(new Error('permission denied'))
      await store.start()
      expect(store.actionError).toBe('요청을 처리하지 못했어요. 다시 시도해 주세요.')

      await store.start()
      expect(store.actionError).toBeNull()
      expect(startRoundMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('시간 조정', () => {
    it('스테퍼는 서버에 쓰지 않고 대기값만 누적한다', () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room({ round: RUNNING }))

      store.adjustBy(1)
      store.adjustBy(1)
      store.adjustBy(-1)

      expect(store.pendingAdjustMinutes).toBe(1)
      expect(adjustRoundMock).not.toHaveBeenCalled()
    })

    it('반영은 현재 상태·남은 시간·대기값(ms)을 함께 넘기고 성공 시 대기값을 비운다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room({ round: RUNNING }))
      store.adjustBy(2)

      vi.setSystemTime(NOW + 60_000)
      await store.applyAdjust()

      expect(adjustRoundMock).toHaveBeenCalledExactlyOnceWith('AB2C', 'running', 1_140_000, 120_000)
      expect(store.pendingAdjustMinutes).toBe(0)
    })

    it('대기값이 0이면 반영하지 않는다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room({ round: RUNNING }))

      await store.applyAdjust()

      expect(adjustRoundMock).not.toHaveBeenCalled()
    })

    it('반영에 실패하면 대기값을 남겨 재시도할 수 있게 한다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room({ round: RUNNING }))
      store.adjustBy(1)

      adjustRoundMock.mockRejectedValueOnce(new Error('offline'))
      await store.applyAdjust()

      expect(store.pendingAdjustMinutes).toBe(1)
      expect(store.actionError).not.toBeNull()
    })
  })

  describe('게임 종료', () => {
    it('호스트가 진행 중인 방을 종료하면 endGame을 호출하고 성공을 알린다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room({ round: RUNNING }))

      await expect(store.finishGame()).resolves.toBe(true)

      expect(endGameMock).toHaveBeenCalledExactlyOnceWith('AB2C')
    })

    it('라운드 시작 전에도 게임 자체는 종료할 수 있다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room({ round: null }))

      await store.finishGame()

      expect(endGameMock).toHaveBeenCalledExactlyOnceWith('AB2C')
    })

    it('게스트와 이미 대기 중인 방에서는 종료하지 않는다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')

      deliver.room(room({ hostUid: 'host9' }))
      await expect(store.finishGame()).resolves.toBe(false)

      deliver.room(room({ status: 'waiting' }))
      await expect(store.finishGame()).resolves.toBe(false)

      expect(endGameMock).not.toHaveBeenCalled()
    })

    it('실패하면 false와 안내를 남긴다 — 화면이 다이얼로그를 닫아도 상태는 그대로다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room({ round: RUNNING }))

      endGameMock.mockRejectedValueOnce(new Error('permission denied'))

      await expect(store.finishGame()).resolves.toBe(false)
      expect(store.actionError).toBe('요청을 처리하지 못했어요. 다시 시도해 주세요.')
    })
  })

  describe('공지 전송', () => {
    it('공백을 제거해 보내고 성공을 알린다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room())

      await expect(store.submitNotice('  집합  ')).resolves.toBe(true)

      expect(sendNoticeMock).toHaveBeenCalledExactlyOnceWith('AB2C', '집합')
      expect(store.isSendingNotice).toBe(false)
    })

    it('빈 공지와 상한 초과는 서버 왕복 없이 거른다', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room())

      await expect(store.submitNotice('   ')).resolves.toBe(false)
      await expect(store.submitNotice('가'.repeat(101))).resolves.toBe(false)

      expect(sendNoticeMock).not.toHaveBeenCalled()
    })

    it('전송에 실패하면 false와 안내를 남긴다 — 화면이 시트를 닫지 않는 근거', async () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')
      deliver.room(room())

      sendNoticeMock.mockRejectedValueOnce(new Error('offline'))

      await expect(store.submitNotice('집합')).resolves.toBe(false)
      expect(store.actionError).not.toBeNull()
      expect(store.isSendingNotice).toBe(false)
    })

    it('최근 공지 스냅샷을 그대로 보관한다', () => {
      const deliver = captureSnapshotCallbacks()
      const store = useRoundOpsStore()
      store.enter('AB2C')

      deliver.notice({ id: 'n1', text: '집합', createdAtMs: NOW })

      expect(store.latestNotice).toEqual({ id: 'n1', text: '집합', createdAtMs: NOW })
    })
  })
})
