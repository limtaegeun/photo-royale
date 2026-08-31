import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Participant, RoomInfo, RoundState } from '@/features/waiting-room'
import type { Notice } from '../api/notices'
import type { Submission, SubmissionRecord } from '../api/submissions'

// 세션 상실(로그아웃)까지 재현해야 하므로 실제 스토어처럼 반응형 ref로 둔다
const authUser = ref<{ uid: string } | null>(null)
vi.mock('@/features/auth', () => ({
  useAuthStore: () => ({
    get user() {
      return authUser.value
    },
  }),
}))

const unsubscribeMock = vi.fn<() => void>()
const endGameMock = vi.fn<(code: string) => Promise<void>>()
const subscribeRoomMock =
  vi.fn<(code: string, onChange: (room: RoomInfo | null) => void) => () => void>()
const subscribeParticipantsMock =
  vi.fn<(code: string, onChange: (participants: Participant[]) => void) => () => void>()

// 방 데이터의 소유자는 waiting-room이다 — 구독만 갈아끼우고 순수 함수·정규화는 실제 구현을 쓴다
vi.mock('@/features/waiting-room', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/waiting-room')>()
  return {
    ...actual,
    endGame: (code: string) => endGameMock(code),
    subscribeToRoom: (code: string, onChange: (room: RoomInfo | null) => void) =>
      subscribeRoomMock(code, onChange),
    subscribeToParticipants: (code: string, onChange: (participants: Participant[]) => void) =>
      subscribeParticipantsMock(code, onChange),
  }
})

const startRoundMock = vi.fn<(code: string) => Promise<void>>()
const pauseRoundMock = vi.fn<(code: string, remainingMs: number) => Promise<void>>()
const resumeRoundMock = vi.fn<(code: string, remainingMs: number) => Promise<void>>()
const adjustRoundMock =
  vi.fn<(code: string, status: string, remainingMs: number, deltaMs: number) => Promise<void>>()

vi.mock('../api/round', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/round')>()
  return {
    ...actual,
    startRound: (code: string) => startRoundMock(code),
    pauseRound: (code: string, remainingMs: number) => pauseRoundMock(code, remainingMs),
    resumeRound: (code: string, remainingMs: number) => resumeRoundMock(code, remainingMs),
    adjustRound: (code: string, status: string, remainingMs: number, deltaMs: number) =>
      adjustRoundMock(code, status, remainingMs, deltaMs),
  }
})

const sendNoticeMock = vi.fn<(code: string, text: string) => Promise<void>>()
const subscribeNoticeMock =
  vi.fn<(code: string, onChange: (notice: Notice | null) => void) => () => void>()

vi.mock('../api/notices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/notices')>()
  return {
    ...actual,
    sendNotice: (code: string, text: string) => sendNoticeMock(code, text),
    subscribeToLatestNotice: (code: string, onChange: (notice: Notice | null) => void) =>
      subscribeNoticeMock(code, onChange),
  }
})

const approveSubmissionMock =
  vi.fn<
    (
      code: string,
      submissionId: string,
      target: { team: string; participantUid: string },
    ) => Promise<void>
  >()
const rejectSubmissionMock = vi.fn<(code: string, submissionId: string) => Promise<void>>()
const getSubmissionStatusFromServerMock =
  vi.fn<(code: string, submissionId: string) => Promise<'pending' | 'approved' | 'rejected' | null>>()
const subscribeSubmissionsMock =
  vi.fn<
    (
      code: string,
      round: number,
      onChange: (submissions: Submission[]) => void,
      onError?: (error: Error) => void,
    ) => () => void
  >()
const subscribeRecordsMock =
  vi.fn<
    (
      code: string,
      onChange: (records: SubmissionRecord[]) => void,
      onError?: (error: Error) => void,
    ) => () => void
  >()

vi.mock('../api/submissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/submissions')>()
  return {
    ...actual,
    approveSubmission: (
      code: string,
      submissionId: string,
      target: { team: string; participantUid: string },
    ) => approveSubmissionMock(code, submissionId, target),
    rejectSubmission: (code: string, submissionId: string) =>
      rejectSubmissionMock(code, submissionId),
    getSubmissionStatusFromServer: (code: string, submissionId: string) =>
      getSubmissionStatusFromServerMock(code, submissionId),
    subscribeToPendingSubmissions: (
      code: string,
      round: number,
      onChange: (submissions: Submission[]) => void,
      onError?: (error: Error) => void,
    ) => subscribeSubmissionsMock(code, round, onChange, onError),
    subscribeToSubmissionLog: (
      code: string,
      onChange: (records: SubmissionRecord[]) => void,
      onError?: (error: Error) => void,
    ) => subscribeRecordsMock(code, onChange, onError),
  }
})

const toastMock = vi.fn<(options: { title: string; tone?: string }) => number>()
vi.mock('@/shared/composables/useToast', () => ({
  useToast: () => ({ toast: toastMock, dismissAll: vi.fn<() => void>() }),
}))

const replaceMock = vi.fn<(to: unknown) => void>()
/** 진입 쿼리 — 대기실이 붙이는 `?tab=log`를 테스트가 재현할 수 있게 밖에 둔다 */
const routeQuery: Record<string, string> = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: { roomCode: 'ab2c' },
    query: routeQuery,
    fullPath: '/round-ops/ab2c',
  }),
  useRouter: () => ({ replace: replaceMock, push: vi.fn<() => void>() }),
}))

import RoundOpsPage from '../RoundOpsPage.vue'

/** 구독 콜백들을 붙잡아 테스트가 스냅샷 도착을 흉내 낼 수 있게 한다 */
function captureSnapshotCallbacks() {
  let deliverRoom: (room: RoomInfo | null) => void = () => {}
  let deliverParticipants: (participants: Participant[]) => void = () => {}
  let deliverNotice: (notice: Notice | null) => void = () => {}
  let deliverSubmissions: (submissions: Submission[]) => void = () => {}
  let failSubmissions: (error: Error) => void = () => {}
  let deliverRecords: (records: SubmissionRecord[]) => void = () => {}
  let failRecords: (error: Error) => void = () => {}
  subscribeRoomMock.mockImplementation((_code, onChange) => {
    deliverRoom = onChange
    return unsubscribeMock
  })
  subscribeParticipantsMock.mockImplementation((_code, onChange) => {
    deliverParticipants = onChange
    return unsubscribeMock
  })
  subscribeNoticeMock.mockImplementation((_code, onChange) => {
    deliverNotice = onChange
    return unsubscribeMock
  })
  subscribeSubmissionsMock.mockImplementation((_code, _round, onChange, onError) => {
    deliverSubmissions = onChange
    failSubmissions = onError ?? (() => {})
    return unsubscribeMock
  })
  subscribeRecordsMock.mockImplementation((_code, onChange, onError) => {
    deliverRecords = onChange
    failRecords = onError ?? (() => {})
    return unsubscribeMock
  })
  return {
    room: (room: RoomInfo | null) => deliverRoom(room),
    participants: (participants: Participant[]) => deliverParticipants(participants),
    notice: (notice: Notice | null) => deliverNotice(notice),
    submissions: (submissions: Submission[]) => deliverSubmissions(submissions),
    submissionsError: (error: Error) => failSubmissions(error),
    records: (records: SubmissionRecord[]) => deliverRecords(records),
    recordsError: (error: Error) => failRecords(error),
  }
}

/**
 * 마운트한 화면은 afterEach에서 반드시 언마운트한다 — 남아 있으면 다음 테스트가 공유 상태
 * (authUser ref)를 건드릴 때 이전 인스턴스의 watcher까지 함께 깨어나 라우팅이 중복 호출된다.
 */
const mounted: ReturnType<typeof mount>[] = []
function mountPage() {
  const wrapper = mount(RoundOpsPage, { global: { plugins: [createPinia()] } })
  mounted.push(wrapper)
  return wrapper
}

function findButton(wrapper: ReturnType<typeof mountPage>, text: string) {
  return wrapper.findAll('button').find((button) => button.text() === text)
}

function hostRoom(overrides: Partial<RoomInfo> = {}): RoomInfo {
  return {
    hostUid: 'me',
    status: 'playing',
    assignmentRound: 2,
    gameMode: 'normal',
    roundModes: {},
    round: null,
    ...overrides,
  }
}

function running(durationMs = 1_200_000): RoundState {
  return { status: 'running', startedAtMs: Date.now(), durationMs, pausedRemainingMs: null }
}

/** 총량보다 오래 지난 앵커 — 남은 시간이 0에 닿은 라운드 */
function ended(): RoundState {
  return {
    status: 'running',
    startedAtMs: Date.now() - 10_000,
    durationMs: 5_000,
    pausedRemainingMs: null,
  }
}

function paused(remainingMs = 300_000): RoundState {
  return {
    status: 'paused',
    startedAtMs: Date.now(),
    durationMs: remainingMs,
    pausedRemainingMs: remainingMs,
  }
}

function assigned(id: string, team: string): Participant {
  return {
    id,
    name: id,
    team,
    assignedRound: 2,
    gender: null,
    isXTeam: false,
    sameGenderStreak: 0,
    previousPartnerIds: [],
    isReady: true,
  }
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('RoundOpsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    authUser.value = { uid: 'me' }
    for (const key of Object.keys(routeQuery)) delete routeQuery[key]
    toastMock.mockReset()
    replaceMock.mockReset()
    unsubscribeMock.mockReset()
    for (const mock of [startRoundMock, pauseRoundMock, resumeRoundMock, adjustRoundMock]) {
      mock.mockReset().mockResolvedValue(undefined)
    }
    sendNoticeMock.mockReset().mockResolvedValue(undefined)
    endGameMock.mockReset().mockResolvedValue(undefined)
    approveSubmissionMock.mockReset().mockResolvedValue(undefined)
    rejectSubmissionMock.mockReset().mockResolvedValue(undefined)
    getSubmissionStatusFromServerMock.mockReset().mockResolvedValue('pending')
    subscribeSubmissionsMock.mockReset().mockReturnValue(unsubscribeMock)
    subscribeRecordsMock.mockReset().mockReturnValue(unsubscribeMock)
  })
  afterEach(() => {
    while (mounted.length > 0) mounted.pop()!.unmount()
    document.body.innerHTML = ''
  })

  describe('상태별 렌더', () => {
    it('시작 전에는 대기 배지·기본 20분 미리보기와 라운드 시작 버튼만 보인다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom())
      await flushPromises()

      // 경로의 방 코드를 대문자로 정규화해 보여준다
      expect(wrapper.text()).toContain('AB2C')
      expect(wrapper.text()).toContain('대기')
      expect(wrapper.text()).toContain('20:00')
      expect(findButton(wrapper, '라운드 시작')).toBeDefined()
      // 시작 전에는 조정할 대상이 없다
      expect(wrapper.text()).not.toContain('시간 조정')
      expect(findButton(wrapper, '일시정지')).toBeUndefined()
    })

    it('진행 중에는 LIVE 배지와 실데이터 요약이 뜨고 일시정지만 누를 수 있다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ round: running() }))
      deliver.participants([assigned('u1', 'A'), assigned('u2', 'A'), assigned('u3', 'B')])
      await flushPromises()

      // 상태는 ROOM 행 배지가, 라운드 번호는 타이머 카드가 맡는다(요약 줄 제거)
      expect(wrapper.text()).toContain('LIVE')
      expect(wrapper.text()).toContain('라운드 2')
      expect(wrapper.text()).not.toContain('팀 배정')
      expect(findButton(wrapper, '일시정지')!.attributes('disabled')).toBeUndefined()
      expect(findButton(wrapper, '재개')!.attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('시간 조정')
    })

    it('일시정지 상태에서는 재개만 누를 수 있다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ round: paused() }))
      await flushPromises()

      expect(wrapper.text()).toContain('일시정지')
      expect(wrapper.text()).toContain('05:00')
      expect(findButton(wrapper, '일시정지')!.attributes('disabled')).toBeDefined()
      expect(findButton(wrapper, '재개')!.attributes('disabled')).toBeUndefined()
    })

    it('남은 시간이 0이면 종료로 표시하고 주 액션을 라운드 종료로 바꾼다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ round: ended() }))
      await flushPromises()

      expect(wrapper.text()).toContain('00:00')
      expect(wrapper.text()).toContain('종료')
      expect(findButton(wrapper, '라운드 종료')).toBeDefined()
      // 되돌릴 타이머가 없는 일시정지/재개만 감춘다
      expect(findButton(wrapper, '일시정지')).toBeUndefined()
      expect(findButton(wrapper, '재개')).toBeUndefined()
    })

    /**
     * −1분 오조작으로 0에 닿으면 복구할 수단이 전무했다. rules는 방이 playing이면 round 쓰기를
     * 허용하므로 종료 표시 상태에서도 +N분 반영이 그대로 성립한다.
     */
    it('종료 상태에서도 시간 조정으로 라운드를 되살릴 수 있다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ round: ended() }))
      await flushPromises()

      expect(wrapper.text()).toContain('시간 조정')

      await findButton(wrapper, '+1분')!.trigger('click')
      await findButton(wrapper, '반영')!.trigger('click')
      await flushPromises()

      expect(adjustRoundMock).toHaveBeenCalledExactlyOnceWith(
        'AB2C',
        'running',
        expect.any(Number),
        60_000,
      )
    })

    /**
     * 재시작을 남겨 두면 startRound가 assignmentRound를 올리지 않으므로 직전 라운드의 미판정
     * 킬샷이 새 20분의 판정 큐에 그대로 남고 기록도 두 라운드가 한 라운드로 뭉친다. 기획서
     * 타임테이블도 "게임 20분 → 다음 팀편성"이라 종료 다음에 오는 것은 재편성이다.
     */
    it('종료 상태에는 타이머를 재시작하는 경로가 없다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ round: ended() }))
      await flushPromises()

      expect(findButton(wrapper, '라운드 시작')).toBeUndefined()
      // 쓰기가 완전히 같은 버튼이 둘 보이지 않게 '게임 종료'는 감춘다
      expect(findButton(wrapper, '게임 종료')).toBeUndefined()
    })

    /**
     * assignmentRound=0(한 번도 배정된 적 없는 방)만 이 카피를 쓴다. hostRoom()의 기본값(2)은
     * "이미 배정을 치른 방"을 뜻하므로 명시적으로 0을 줘야 이 시나리오가 된다 — assignmentRound>0
     * 인 waiting 방의 새 카피는 아래 '라운드 종료 후 대기 안내'에서 검증한다.
     */
    it('한 번도 배정되지 않은 방에서는 컨트롤 대신 기존 안내를 보여준다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ status: 'waiting', assignmentRound: 0 }))
      await flushPromises()

      expect(wrapper.text()).toContain('게임이 아직 시작되지 않았어요')
      expect(findButton(wrapper, '라운드 시작')).toBeUndefined()
    })

    it('보류된 판정 대기 행은 화면에 없다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      // 남은 '판정' 텍스트는 하단 탭 라벨뿐이고, 스켈레톤의 판정 대기 행은 사라졌다
      expect(wrapper.text()).not.toContain('판정 대기')
      expect(wrapper.text()).not.toContain('3건')
    })
  })

  /**
   * 타이머와 종료 버튼이 운영 탭 안에만 있으면, 판정·기록 탭을 보는 진행자는 시간이 다 가도
   * 화면에서 아무 변화를 보지 못해 라운드가 끝난 줄 모르고 계속 판정한다(QA A-3).
   */
  describe('상태 줄', () => {
    it('판정·기록 탭에서도 남은 시간과 라운드 상태가 남는다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      await wrapper.find('[data-value="judge"]').trigger('click')
      expect(wrapper.find('[aria-label="라운드 남은 시간"]').text()).toMatch(/^\d{2}:\d{2}$/)
      expect(wrapper.text()).toContain('LIVE')
      // 운영 컨트롤은 탭을 따라 사라져도 상태 줄은 남는다
      expect(findButton(wrapper, '일시정지')).toBeUndefined()

      await wrapper.find('[data-value="log"]').trigger('click')
      expect(wrapper.find('[aria-label="라운드 남은 시간"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('AB2C')
    })

    it('라운드가 없으면 상태 줄에 시간을 띄우지 않는다 — 20분 미리보기는 타이머 카드의 몫', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom())
      await flushPromises()

      expect(wrapper.find('[aria-label="라운드 남은 시간"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('20:00')
    })

    it('종료는 시작 전과 같은 회색이 아니라 danger 톤으로 구분한다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ round: running() }))
      await flushPromises()
      expect(wrapper.find('[data-tone="danger"]').exists()).toBe(false)

      deliver.room(hostRoom({ round: ended() }))
      await flushPromises()

      expect(wrapper.find('[data-tone="danger"]').exists()).toBe(true)
    })

    it('시간이 0에 닿는 순간을 토스트로 알린다 — 다른 탭을 보고 있어도 놓치지 않게', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ round: running() }))
      await flushPromises()
      await wrapper.find('[data-value="judge"]').trigger('click')
      toastMock.mockClear()

      deliver.room(hostRoom({ round: ended() }))
      await flushPromises()

      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('라운드 시간이 끝났어요') }),
      )
      expect(wrapper.find('[aria-label="라운드 남은 시간"]').text()).toBe('00:00')
    })

    /** 이미 끝나 있던 방을 지금 연 것은 방금 일어난 사건이 아니고, 그 순간 화면은 보고 있다 */
    it('이미 종료된 방으로 들어올 때는 종료 알림을 띄우지 않는다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ round: ended() }))
      await flushPromises()

      expect(toastMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('라운드 시간이 끝났어요') }),
      )
      expect(wrapper.text()).toContain('종료')
    })
  })

  describe('컨트롤', () => {
    it('일시정지·재개는 방 문서에 쓴다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      await findButton(wrapper, '일시정지')!.trigger('click')
      expect(pauseRoundMock).toHaveBeenCalledExactlyOnceWith('AB2C', expect.any(Number))

      deliver.room(hostRoom({ round: paused() }))
      await flushPromises()
      await findButton(wrapper, '재개')!.trigger('click')
      expect(resumeRoundMock).toHaveBeenCalledExactlyOnceWith('AB2C', 300_000)
    })

    it('라운드 시작은 기본 길이로 카운트다운을 건다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom())
      await flushPromises()

      await findButton(wrapper, '라운드 시작')!.trigger('click')

      expect(startRoundMock).toHaveBeenCalledExactlyOnceWith('AB2C')
    })

    it('시간 조정은 대기값을 쌓고 반영을 눌러야 서버에 쓴다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      // 대기값이 0이면 반영은 비활성이다
      expect(findButton(wrapper, '반영')!.attributes('disabled')).toBeDefined()

      await findButton(wrapper, '+1분')!.trigger('click')
      await findButton(wrapper, '+1분')!.trigger('click')
      expect(wrapper.text()).toContain('대기 변경값: +2분')
      expect(adjustRoundMock).not.toHaveBeenCalled()

      await findButton(wrapper, '반영')!.trigger('click')
      await flushPromises()

      expect(adjustRoundMock).toHaveBeenCalledExactlyOnceWith(
        'AB2C',
        'running',
        expect.any(Number),
        120_000,
      )
      expect(wrapper.text()).not.toContain('대기 변경값')
    })

    /**
     * 전역 pending 하나를 모든 버튼의 disabled에 물리면, 쓰기 왕복(로컬에서도 ~50ms)마다
     * 관계없는 컨트롤이 회색으로 깜빡인다. 진행 표시는 눌린 버튼에만 준다.
     */
    it('한 컨트롤이 쓰는 동안 다른 컨트롤이 잠기지 않는다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      // 응답이 오지 않는 상태로 붙잡아 '쓰는 중' 구간을 관찰한다
      let settle: () => void = () => {}
      pauseRoundMock.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          settle = resolve
        }),
      )
      await findButton(wrapper, '일시정지')!.trigger('click')
      await flushPromises()

      // 눌린 버튼만 진행 표시를 갖는다
      expect(findButton(wrapper, '일시정지')!.attributes('aria-busy')).toBe('true')
      // 서버에 쓰지도 않는 스테퍼와, 다이얼로그만 여는 종료 버튼은 그대로 눌린다
      expect(findButton(wrapper, '+1분')!.attributes('disabled')).toBeUndefined()
      expect(findButton(wrapper, '-1분')!.attributes('disabled')).toBeUndefined()
      expect(findButton(wrapper, '게임 종료')!.attributes('disabled')).toBeUndefined()

      settle()
      await flushPromises()
      expect(findButton(wrapper, '일시정지')!.attributes('aria-busy')).toBeUndefined()
    })

    it('쓰기에 실패하면 에러 토스트로 알린다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom())
      await flushPromises()

      startRoundMock.mockRejectedValueOnce(new Error('offline'))
      await findButton(wrapper, '라운드 시작')!.trigger('click')
      await flushPromises()

      expect(toastMock).toHaveBeenCalledWith({
        title: '요청을 처리하지 못했어요. 다시 시도해 주세요.',
        tone: 'danger',
      })
    })
  })

  describe('공지', () => {
    it('보낸 공지가 없으면 빈 상태를, 있으면 상대 시각과 본문을 보여준다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      expect(wrapper.text()).toContain('아직 보낸 공지가 없어요.')

      deliver.notice({ id: 'n1', text: '보급품 A', createdAtMs: Date.now() - 125_000 })
      await flushPromises()

      expect(wrapper.text()).toContain('2분 전 · 보급품 A')
    })

    /** QA C-06 회귀 — 상한을 넘긴 입력에서 전송이 활성인 채 조용히 거절되면 안 된다 */
    it('공지가 상한을 넘으면 전송을 막고 카운터를 경고색으로 바꾼다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      await findButton(wrapper, '공지 보내기')!.trigger('click')
      await flushPromises()

      const input = document.body.querySelector<HTMLInputElement>('input')!
      // maxlength를 우회하는 입력 경로(IME 조합 등)를 흉내 낸다
      input.value = '가'.repeat(101)
      input.dispatchEvent(new Event('input'))
      await flushPromises()

      const send = [...document.body.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === '전송',
      )!
      expect(send.hasAttribute('disabled')).toBe(true)
      const counter = [...document.body.querySelectorAll('p')].find((p) =>
        /^\d+\/100$/.test(p.textContent!.trim()),
      )!
      expect(counter.className).toContain('text-danger')

      send.click()
      await flushPromises()
      expect(sendNoticeMock).not.toHaveBeenCalled()
    })

    it('시트에서 공지를 보내면 전송 후 시트가 닫히고 성공을 알린다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      await findButton(wrapper, '공지 보내기')!.trigger('click')
      await flushPromises()

      const input = document.body.querySelector<HTMLInputElement>('input')
      expect(input).not.toBeNull()
      input!.value = '집합'
      input!.dispatchEvent(new Event('input'))
      await flushPromises()

      const send = [...document.body.querySelectorAll<HTMLElement>('button')].find(
        (button) => button.textContent?.trim() === '전송',
      )
      send!.click()
      await flushPromises()

      expect(sendNoticeMock).toHaveBeenCalledExactlyOnceWith('AB2C', '집합')
      expect(toastMock).toHaveBeenCalledWith({ title: '공지를 보냈어요.', tone: 'success' })
      expect(document.body.textContent).not.toContain('참가자 전원에게 즉시 전달됩니다.')
    })
  })

  describe('게임 종료', () => {
    it('버튼은 확인 다이얼로그를 열 뿐 바로 종료하지 않는다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      await findButton(wrapper, '게임 종료')!.trigger('click')
      await flushPromises()

      expect(document.body.textContent).toContain('게임을 종료할까요?')
      expect(document.body.textContent).toContain('참가자 전원이 대기실로 돌아가고')
      expect(endGameMock).not.toHaveBeenCalled()
      // 위 = 안전, 아래 = 파괴. 킬샷 종료 다이얼로그와 순서를 맞춰 학습 전이 오조작을 막는다
      // (라벨 없는 닫기 아이콘 버튼은 위계 비교 대상이 아니다)
      const labels = [...document.body.querySelectorAll('button')]
        .map((button) => button.textContent?.trim())
        .filter((label) => label !== '')
      expect(labels).toEqual(['계속 진행', '게임 종료'])
    })

    it('다이얼로그에서 계속 진행을 누르면 아무 일도 일어나지 않는다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      await findButton(wrapper, '게임 종료')!.trigger('click')
      await flushPromises()
      const keep = [...document.body.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === '계속 진행',
      )!
      keep.click()
      await flushPromises()

      expect(endGameMock).not.toHaveBeenCalled()
      expect(document.body.textContent).not.toContain('게임을 종료할까요?')
    })

    it('확인하면 게임을 종료하고 성공을 알린다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      await findButton(wrapper, '게임 종료')!.trigger('click')
      await flushPromises()
      const confirm = [...document.body.querySelectorAll('button')].filter(
        (b) => b.textContent?.trim() === '게임 종료',
      ).pop()!
      confirm.click()
      await flushPromises()

      expect(endGameMock).toHaveBeenCalledExactlyOnceWith('AB2C')
      expect(toastMock).toHaveBeenCalledWith({ title: '게임을 종료했어요.', tone: 'success' })
    })

    /** 종료 스냅샷이 오면 종료를 누른 창뿐 아니라 같은 계정의 다른 기기도 함께 돌아가야 한다 */
    it('playing → waiting 스냅샷이 오면 호스트를 대기실로 보낸다', async () => {
      const deliver = captureSnapshotCallbacks()
      mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()
      expect(replaceMock).not.toHaveBeenCalled()

      deliver.room(hostRoom({ status: 'waiting', round: null }))
      await flushPromises()

      expect(replaceMock).toHaveBeenCalledWith({
        name: 'waiting-room',
        params: { roomCode: 'AB2C' },
      })
    })

    it('처음부터 waiting인 방에 딥링크로 들어온 호스트는 안내 카드에 머문다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      // '처음부터' waiting이라는 시나리오라 assignmentRound도 0(한 번도 배정 안 됨)으로 명시한다
      deliver.room(hostRoom({ status: 'waiting', round: null, assignmentRound: 0 }))
      await flushPromises()

      expect(replaceMock).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('게임이 아직 시작되지 않았어요')
    })

    it('아직 시작되지 않은 방에는 게임 종료 버튼이 없다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ status: 'waiting', round: null }))
      await flushPromises()

      expect(findButton(wrapper, '게임 종료')).toBeUndefined()
    })
  })

  describe('호스트 가드', () => {
    it('라운드가 시작된 방이면 게스트를 방 코드가 담긴 콕핏으로 보낸다', async () => {
      const deliver = captureSnapshotCallbacks()
      mountPage()

      deliver.room(hostRoom({ hostUid: 'host9', round: running() }))
      await flushPromises()

      expect(replaceMock).toHaveBeenCalledWith({ name: 'camera', params: { roomCode: 'AB2C' } })
    })

    /** 대기실의 전이 규칙과 같아야 한다 — URL을 직접 연 게스트만 카메라가 켜지면 안 된다 */
    it('게임은 시작됐지만 라운드 시작 전이면 게스트를 대기실로 돌려보낸다', async () => {
      const deliver = captureSnapshotCallbacks()
      mountPage()

      deliver.room(hostRoom({ hostUid: 'host9', round: null }))
      await flushPromises()

      expect(replaceMock).toHaveBeenCalledWith({
        name: 'waiting-room',
        params: { roomCode: 'AB2C' },
      })
    })

    it('아직 시작 전인 방이면 게스트를 대기실로 돌려보낸다', async () => {
      const deliver = captureSnapshotCallbacks()
      mountPage()

      deliver.room(hostRoom({ hostUid: 'host9', status: 'waiting' }))
      await flushPromises()

      expect(replaceMock).toHaveBeenCalledWith({
        name: 'waiting-room',
        params: { roomCode: 'AB2C' },
      })
    })

    it('방이 없으면 안내 후 입장 화면으로 보낸다', async () => {
      const deliver = captureSnapshotCallbacks()
      mountPage()

      deliver.room(null)
      await flushPromises()

      expect(toastMock).toHaveBeenCalledWith({ title: '방을 찾을 수 없어요.', tone: 'danger' })
      expect(replaceMock).toHaveBeenCalledWith({ name: 'entry' })
    })

    /**
     * QA O-01 회귀 — 세션이 끊기면 isHost가 false가 되는데, 이때 게스트로 오인해 카메라로
     * 보내면 진행자가 콕핏에 갇힌다(이 화면이 막으려던 바로 그 상황).
     */
    it('세션이 끊기면 카메라가 아니라 로그인으로 보낸다', async () => {
      const deliver = captureSnapshotCallbacks()
      mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()
      expect(replaceMock).not.toHaveBeenCalled()

      authUser.value = null
      await flushPromises()

      expect(replaceMock).toHaveBeenCalledWith({
        name: 'login',
        query: { redirect: '/round-ops/ab2c' },
      })
      expect(replaceMock).not.toHaveBeenCalledWith({
        name: 'camera',
        params: { roomCode: 'AB2C' },
      })
    })

    it('호스트는 어디로도 보내지 않는다', async () => {
      const deliver = captureSnapshotCallbacks()
      mountPage()

      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      expect(replaceMock).not.toHaveBeenCalled()
    })
  })

  describe('탭', () => {
    /**
     * 첫 스냅샷 전에는 빈 배열이 "기록 없음"으로 읽혀 "아직 기록이 없어요"라는 확언이 도착 전에
     * 떴다. 빈 상태는 실제로 빈 스냅샷을 받은 뒤에만 단언해야 한다.
     */
    it('기록 탭은 운영 컨트롤을 숨기고, 스냅샷이 오기 전에는 빈 상태를 단언하지 않는다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      await wrapper.find('[data-value="log"]').trigger('click')

      expect(wrapper.text()).toContain('기록을 불러오는 중…')
      expect(wrapper.text()).not.toContain('아직 기록이 없어요.')
      expect(findButton(wrapper, '일시정지')).toBeUndefined()

      deliver.records([])
      await flushPromises()
      expect(wrapper.text()).toContain('아직 기록이 없어요.')

      await wrapper.find('[data-value="ops"]').trigger('click')
      expect(findButton(wrapper, '일시정지')).toBeDefined()
    })

    /** 대기실의 '지난 라운드 기록 보기'가 붙이는 쿼리 — 진입 즉시 기록 탭이어야 한다 */
    it('?tab=log로 들어오면 기록 탭에서 시작한다', async () => {
      routeQuery.tab = 'log'
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      expect(findButton(wrapper, '일시정지')).toBeUndefined()
      expect(subscribeRecordsMock).toHaveBeenCalledTimes(1)
    })

    it('모르는 tab 쿼리는 무시하고 운영 탭으로 연다', async () => {
      routeQuery.tab = 'nope'
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      expect(findButton(wrapper, '일시정지')).toBeDefined()
    })
  })

  describe('기록 탭', () => {
    /** 판정 이력 픽스처 — 제출자 u3(팀 B)의 킬샷. 기본은 이번 라운드(2)의 확정 건 */
    function submissionRecord(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
      return {
        id: 'r1',
        uid: 'u3',
        team: 'B',
        round: 2,
        photo: 'data:image/jpeg;base64,killshot',
        status: 'approved',
        createdAtMs: Date.now(),
        targetTeam: 'A',
        judgedAtMs: Date.now(),
        ...overrides,
      }
    }

    /** 기록 탭을 열고(로그 구독 시작) 기록 스냅샷과 배정 명단을 채운다 */
    async function openLogTab(records: SubmissionRecord[]) {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      deliver.participants([assigned('u1', 'A'), assigned('u2', 'A'), assigned('u3', 'B')])
      await flushPromises()
      await wrapper.find('[data-value="log"]').trigger('click')
      deliver.records(records)
      await flushPromises()
      return { deliver, wrapper }
    }

    it('기록 탭 첫 활성화에서만 로그를 구독한다 — 탭을 오가도 다시 열지 않는다', async () => {
      const { wrapper } = await openLogTab([])

      expect(subscribeRecordsMock).toHaveBeenCalledExactlyOnceWith(
        'AB2C',
        expect.any(Function),
        expect.any(Function),
      )

      await wrapper.find('[data-value="ops"]').trigger('click')
      await wrapper.find('[data-value="log"]').trigger('click')
      expect(subscribeRecordsMock).toHaveBeenCalledTimes(1)
    })

    it('전 라운드 기록을 라운드 구분·상태와 함께 보여준다', async () => {
      const { wrapper } = await openLogTab([
        submissionRecord({ id: 'r2', round: 2, status: 'pending', targetTeam: null, judgedAtMs: null }),
        submissionRecord({ id: 'r1', round: 1 }),
      ])

      const text = wrapper.text()
      expect(text).toContain('라운드 2')
      expect(text).toContain('라운드 1')
      expect(text).toContain('u3')
      expect(wrapper.find('button[data-record="r2"]').text()).toContain('대기')
      expect(wrapper.find('button[data-record="r1"]').text()).toContain('확정')
      expect(wrapper.find('button[data-record="r1"]').text()).toContain('팀 A · 파랑')
    })

    it('판정된 기록을 누르면 읽기 전용 상세 시트가 열린다', async () => {
      const { wrapper } = await openLogTab([submissionRecord()])

      await wrapper.find('button[data-record="r1"]').trigger('click')
      await flushPromises()

      expect(document.body.textContent).toContain('킬샷 기록')
      expect(document.body.textContent).toContain('잡힌 팀')
      // 판정 시트가 아니다 — 확정/반려 액션이 없어야 읽기 전용이다
      expect(document.body.textContent).not.toContain('판정 확정')
    })

    it('이번 라운드의 대기 기록을 누르면 판정 시트가 바로 열린다', async () => {
      const { wrapper } = await openLogTab([
        submissionRecord({ status: 'pending', targetTeam: null, judgedAtMs: null }),
      ])

      await wrapper.find('button[data-record="r1"]').trigger('click')
      await flushPromises()

      expect(document.body.textContent).toContain('킬샷 판정')
      expect(document.body.textContent).toContain('잡힌 팀 선택')
    })

    it('라운드가 지난 대기 기록은 판정할 수 없어 상세 시트로 연다', async () => {
      const { wrapper } = await openLogTab([
        submissionRecord({ round: 1, status: 'pending', targetTeam: null, judgedAtMs: null }),
      ])

      await wrapper.find('button[data-record="r1"]').trigger('click')
      await flushPromises()

      expect(document.body.textContent).toContain('킬샷 기록')
      expect(document.body.textContent).toContain('판정되지 않은 채 라운드가 지난 제출이에요.')
      expect(document.body.textContent).not.toContain('킬샷 판정')
    })

    it('기록 Listen 오류는 오류 카드와 토스트로 알린다', async () => {
      const { deliver, wrapper } = await openLogTab([submissionRecord()])

      deliver.recordsError(new Error('permission-denied'))
      await flushPromises()

      expect(wrapper.text()).toContain('기록 연결 오류')
      expect(toastMock).toHaveBeenCalledWith({
        title: '기록 연결이 끊겼어요. 화면을 새로고침해 주세요.',
        tone: 'danger',
      })
    })

    /**
     * 라운드 종료는 방을 waiting으로 되돌린다 — 그 직후가 호스트가 지난 라운드를 되짚어 볼
     * 유일한 시점이고, 대기실의 '지난 라운드 기록 보기'도 이 상태로 들어온다. 판정 탭은 playing
     * 게이트를 유지하지만(판정 쓰기가 막힌다), 읽기 전용인 기록은 게이트를 두지 않는다.
     */
    it('대기(waiting) 상태에서도 지난 라운드 기록을 열람할 수 있다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ status: 'waiting', round: null }))
      deliver.participants([assigned('u3', 'B')])
      await flushPromises()

      await wrapper.find('[data-value="log"]').trigger('click')
      deliver.records([submissionRecord({ round: 1 })])
      await flushPromises()

      expect(wrapper.text()).not.toContain('게임이 아직 시작되지 않았어요')
      expect(wrapper.find('button[data-record="r1"]').exists()).toBe(true)
    })

    /** 필터는 페이지가 들고 있어야 판정하러 다녀와도 좁혀 둔 조건이 살아 있다 */
    it('탭을 오갔다 돌아와도 상태 필터가 유지된다', async () => {
      const { wrapper } = await openLogTab([
        submissionRecord({ id: 'r1', status: 'approved' }),
        submissionRecord({ id: 'r2', status: 'rejected', targetTeam: null }),
      ])

      await wrapper.find('[data-value="rejected"]').trigger('click')
      expect(wrapper.find('button[data-record="r1"]').exists()).toBe(false)

      await wrapper.find('[data-value="ops"]').trigger('click')
      await wrapper.find('[data-value="log"]').trigger('click')

      expect(wrapper.find('button[data-record="r2"]').exists()).toBe(true)
      expect(wrapper.find('button[data-record="r1"]').exists()).toBe(false)
    })
  })

  /**
   * 라운드 종료 — 타이머가 0에 닿은 뒤 한 라운드를 닫고 대기실(재편성)로 넘기는 정규 경로.
   * 쓰기는 '게임 종료'와 같은 endGame이지만, 중단이 아니라 타임테이블대로의 다음 단계라
   * 확인을 묻지 않는다(판정이 남은 경우만 예외).
   */
  describe('라운드 종료', () => {
    /** 종료 상태 + 대기 킬샷 n건인 화면 */
    async function openEndedRound(pendingCount: number) {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: ended() }))
      await flushPromises()

      deliver.submissions(
        Array.from({ length: pendingCount }, (_unused, index) => ({
          id: `s${index}`,
          uid: 'u3',
          team: 'B',
          round: 2,
          photo: 'data:image/jpeg;base64,killshot',
          status: 'pending' as const,
          createdAtMs: Date.now(),
        })),
      )
      await flushPromises()
      return { deliver, wrapper }
    }

    it('판정 대기가 없으면 바로 종료하고 다음 라운드 배정을 안내한다', async () => {
      const { wrapper } = await openEndedRound(0)

      await findButton(wrapper, '라운드 종료')!.trigger('click')
      await flushPromises()

      expect(endGameMock).toHaveBeenCalledExactlyOnceWith('AB2C')
      expect(toastMock).toHaveBeenCalledWith({
        title: '라운드를 종료했어요. 대기실에서 다음 라운드를 배정해 주세요.',
        tone: 'success',
      })
    })

    /** 종료 후에는 rules가 지난 라운드 판정을 막아 영구히 판정할 수 없게 된다 */
    it('판정 대기가 남았으면 건수를 밝히고 확인을 받는다', async () => {
      const { wrapper } = await openEndedRound(2)

      await findButton(wrapper, '라운드 종료')!.trigger('click')
      await flushPromises()

      expect(document.body.textContent).toContain('판정하지 않은 킬샷이 있어요')
      expect(document.body.textContent).toContain('킬샷 2건이 남았어요')
      expect(endGameMock).not.toHaveBeenCalled()
    })

    /** 라벨이 약속한 대로 판정 탭까지 데려가야 한다 — 닫기만 하면 진행자가 탭을 손으로 찾는다 */
    it('먼저 판정하기를 고르면 종료하지 않고 판정 탭으로 데려간다', async () => {
      const { wrapper } = await openEndedRound(1)

      await findButton(wrapper, '라운드 종료')!.trigger('click')
      await flushPromises()

      const keep = [...document.body.querySelectorAll<HTMLElement>('button')].find(
        (button) => button.textContent?.trim() === '먼저 판정하기',
      )!
      keep.click()
      await flushPromises()

      expect(endGameMock).not.toHaveBeenCalled()
      expect(document.body.textContent).not.toContain('판정하지 않은 킬샷이 있어요')
      // 판정 탭으로 전환됐다 — 대기 큐 화면의 안내가 보인다
      expect(wrapper.text()).toContain('사진 속 완장의 팀을 확인해 판정해 주세요.')
    })

    it('확인하면 대기 건을 남겨 둔 채 라운드를 종료한다', async () => {
      const { wrapper } = await openEndedRound(1)

      await findButton(wrapper, '라운드 종료')!.trigger('click')
      await flushPromises()

      const confirm = [...document.body.querySelectorAll<HTMLElement>('button')].find(
        (button) => button.textContent?.trim() === '그대로 라운드 종료',
      )!
      confirm.click()
      await flushPromises()

      expect(endGameMock).toHaveBeenCalledExactlyOnceWith('AB2C')
    })

    /**
     * 큐 리스너가 죽으면 store가 stale 큐를 비운다 — 건수만 보면 "알 수 없음"이 "0건"으로 위장해
     * 확인 없이 종료되고, 남은 킬샷은 rules 때문에 영구히 판정할 수 없게 된다.
     */
    it('큐 연결이 끊긴 상태에서는 건수를 몰라도 확인을 받는다', async () => {
      const { deliver, wrapper } = await openEndedRound(0)

      deliver.submissionsError(new Error('permission-denied'))
      await flushPromises()

      await findButton(wrapper, '라운드 종료')!.trigger('click')
      await flushPromises()

      expect(document.body.textContent).toContain('대기 건수를 확인할 수 없어요')
      expect(document.body.textContent).not.toContain('0건이 남았어요')
      expect(endGameMock).not.toHaveBeenCalled()
    })

    /**
     * uncertain일 때 '먼저 판정하기'가 판정 탭으로 데려가도 거기엔 "판정 큐 연결 오류" 카드뿐이라
     * 막다른 길이었다. 재연결 수단이 없으므로 그 버튼을 감추고 닫기만 남겨, 닫아도 종료를
     * 부르지 않는지까지 확인한다(재리뷰 F-3).
     */
    it('큐 연결이 끊긴 상태에서는 먼저 판정하기 대신 닫기만 보이고, 닫아도 종료를 호출하지 않는다', async () => {
      const { deliver, wrapper } = await openEndedRound(0)

      deliver.submissionsError(new Error('permission-denied'))
      await flushPromises()

      await findButton(wrapper, '라운드 종료')!.trigger('click')
      await flushPromises()

      expect(document.body.textContent).toContain('대기 건수를 확인할 수 없어요')
      const buttonLabels = [...document.body.querySelectorAll<HTMLElement>('button')].map(
        (button) => button.textContent?.trim(),
      )
      expect(buttonLabels).not.toContain('먼저 판정하기')
      expect(buttonLabels).toContain('닫기')

      const close = [...document.body.querySelectorAll<HTMLElement>('button')].find(
        (button) => button.textContent?.trim() === '닫기',
      )!
      close.click()
      await flushPromises()

      expect(document.body.textContent).not.toContain('대기 건수를 확인할 수 없어요')
      expect(endGameMock).not.toHaveBeenCalled()
    })

    /** 열려 있는 동안 문구가 바뀌면 진행자가 읽고 판단한 근거와 확인 대상이 어긋난다 */
    it('다이얼로그가 열린 뒤 대기가 사라져도 건수는 열림 시점 값으로 고정된다', async () => {
      const { deliver, wrapper } = await openEndedRound(2)

      await findButton(wrapper, '라운드 종료')!.trigger('click')
      await flushPromises()
      expect(document.body.textContent).toContain('킬샷 2건이 남았어요')

      // 다른 기기가 남은 판정을 모두 끝낸 스냅샷
      deliver.submissions([])
      await flushPromises()

      expect(document.body.textContent).toContain('킬샷 2건이 남았어요')
      expect(document.body.textContent).not.toContain('킬샷 0건이 남았어요')
    })
  })

  /**
   * 라운드 종료로 waiting에 돌아간 방(assignmentRound>0)의 안내 카드 — 판정 큐 구독은 status와
   * 무관하게 차수 키로 유지되어 미판정 건이 배지에 계속 잡히는데, 본문이 "게임이 아직 시작되지
   * 않았어요"인 옛 카피는 이미 라운드를 치른 방에서는 사실과 다르다. 그 모순이 대기실의 재실행
   * 가드('그대로 다시 시작' 선택 유도)를 무력화하므로 assignmentRound로 분기해야 한다.
   */
  describe('라운드 종료 후 대기 안내', () => {
    it('운영 탭은 라운드 종료 카피를 보여주고 대기실로 버튼을 유지한다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ status: 'waiting', round: null }))
      await flushPromises()

      expect(wrapper.text()).toContain('라운드가 종료된 상태예요')
      expect(wrapper.text()).toContain('대기실에서 다음 라운드를 배정하고 게임을 시작해 주세요.')
      expect(wrapper.text()).not.toContain('게임이 아직 시작되지 않았어요')
      expect(findButton(wrapper, '대기실로')).toBeDefined()
    })

    it('판정 탭은 미판정 건수를 밝히고, 기록 탭 열기를 누르면 기록 탭으로 전환된다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ status: 'waiting', round: null }))
      deliver.submissions([
        {
          id: 's1',
          uid: 'u3',
          team: 'B',
          round: 2,
          photo: 'data:image/jpeg;base64,killshot',
          status: 'pending' as const,
          createdAtMs: Date.now(),
        },
      ])
      await flushPromises()

      await wrapper.find('[data-value="judge"]').trigger('click')

      expect(wrapper.text()).toContain('판정은 라운드 진행 중에만 할 수 있어요')
      expect(wrapper.text()).toContain('판정되지 않은 킬샷 1건은 기록 탭에서 확인할 수 있어요.')
      expect(wrapper.text()).not.toContain('게임이 아직 시작되지 않았어요')

      await findButton(wrapper, '기록 탭 열기')!.trigger('click')
      await flushPromises()

      // 기록 탭 첫 활성화 — 로그 구독이 시작되고 로딩 문구가 뜬다(판정 탭 안내는 사라진다)
      expect(wrapper.text()).toContain('기록을 불러오는 중…')
      expect(wrapper.text()).not.toContain('판정은 라운드 진행 중에만 할 수 있어요')
      expect(subscribeRecordsMock).toHaveBeenCalledTimes(1)
    })

    it('판정 탭은 미판정 건이 없으면 지난 기록 안내로 대체한다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ status: 'waiting', round: null }))
      await flushPromises()

      await wrapper.find('[data-value="judge"]').trigger('click')

      expect(wrapper.text()).toContain('지난 라운드의 기록은 기록 탭에서 확인할 수 있어요.')
      expect(wrapper.text()).not.toContain('판정되지 않은 킬샷')
    })
  })

  describe('판정 탭', () => {
    /** 판정 대기 킬샷 픽스처 — 제출자 u3(팀 B)가 방금 보낸 사진 */
    function pendingSubmission(overrides: Partial<Submission> = {}): Submission {
      return {
        id: 's1',
        uid: 'u3',
        team: 'B',
        round: 2,
        photo: 'data:image/jpeg;base64,killshot',
        status: 'pending',
        createdAtMs: Date.now(),
        ...overrides,
      }
    }

    /** 판정 탭을 열고 대기 킬샷 1건과 배정 명단(A팀 u1·u2 / B팀 u3)을 채운다 */
    async function openJudgeTab() {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      deliver.participants([assigned('u1', 'A'), assigned('u2', 'A'), assigned('u3', 'B')])
      deliver.submissions([pendingSubmission()])
      await flushPromises()
      await wrapper.find('[data-value="judge"]').trigger('click')
      return { deliver, wrapper }
    }

    function sheetButton(text: string) {
      return [...document.body.querySelectorAll<HTMLElement>('button')].find(
        (button) => button.textContent?.trim() === text,
      )
    }

    it('하단 판정 탭에 대기 건수 배지가 뜬다 — 다른 탭에서도 도착을 알 수 있다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      deliver.submissions([pendingSubmission()])
      await flushPromises()

      // 운영 탭에 머문 상태 그대로 탭 바에서 확인한다
      const judgeTab = wrapper.get('[data-value="judge"]')
      expect(judgeTab.find('.count-badge').exists()).toBe(true)
      expect(judgeTab.text()).toContain('1')

      deliver.submissions([])
      await flushPromises()
      expect(judgeTab.find('.count-badge').exists()).toBe(false)
    })

    it('대기 킬샷을 건수 배지·제출 팀·제출자와 함께 오래된 순으로 나열한다', async () => {
      const { wrapper } = await openJudgeTab()

      expect(wrapper.text()).toContain('대기 1건')
      expect(wrapper.text()).toContain('팀 B · 주황')
      expect(wrapper.text()).toContain('u3')
      const thumbnail = wrapper.find('button[data-submission="s1"] img')
      expect(thumbnail.attributes('src')).toBe('data:image/jpeg;base64,killshot')
    })

    it('대기 킬샷이 없으면 빈 상태 안내를 보여준다', async () => {
      const { deliver, wrapper } = await openJudgeTab()

      deliver.submissions([])
      await flushPromises()

      expect(wrapper.text()).toContain('대기 0건')
      expect(wrapper.text()).toContain('판정 대기 중인 킬샷이 없어요.')
    })

    /** 한 번도 배정된 적 없는 방(assignmentRound=0)만 이 카피를 쓴다 — 기본값(2)은 이미 배정을 치른 방이다 */
    it('시작 전(waiting) 방에서는 큐 대신 안내를 보여준다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ status: 'waiting', assignmentRound: 0 }))
      await flushPromises()

      await wrapper.find('[data-value="judge"]').trigger('click')

      expect(wrapper.text()).toContain('게임이 아직 시작되지 않았어요')
      expect(wrapper.text()).not.toContain('대기 0건')
    })

    it('킬샷을 골라 대상 팀을 선택하면 확정이 서버에 쓰인다', async () => {
      const { wrapper } = await openJudgeTab()

      await wrapper.find('button[data-submission="s1"]').trigger('click')
      await flushPromises()

      // 제출자 본인 팀(B)은 대상에서 비활성화된다
      const ownTeam = document.body.querySelector<HTMLButtonElement>('button[data-team="B"]')!
      expect(ownTeam.disabled).toBe(true)
      expect(document.body.textContent).toContain('제출 팀')

      // 대상 팀을 고르기 전에는 확정할 수 없다
      expect(sheetButton('판정 확정')!.hasAttribute('disabled')).toBe(true)

      document.body.querySelector<HTMLButtonElement>('button[data-team="A"]')!.click()
      await flushPromises()
      sheetButton('판정 확정')!.click()
      await flushPromises()

      expect(approveSubmissionMock).toHaveBeenCalledExactlyOnceWith('AB2C', 's1', {
        team: 'A',
        participantUid: 'u1',
      })
      expect(toastMock).toHaveBeenCalledWith({
        title: '팀 A 킬샷으로 판정했어요.',
        tone: 'success',
      })
    })

    it('반려는 사유 없이 상태만 쓴다', async () => {
      const { wrapper } = await openJudgeTab()

      await wrapper.find('button[data-submission="s1"]').trigger('click')
      await flushPromises()
      sheetButton('반려')!.click()
      await flushPromises()

      expect(rejectSubmissionMock).toHaveBeenCalledExactlyOnceWith('AB2C', 's1')
      expect(approveSubmissionMock).not.toHaveBeenCalled()
      expect(toastMock).toHaveBeenCalledWith({ title: '킬샷을 반려했어요.', tone: 'neutral' })
    })

    it('시트가 열린 킬샷이 다른 기기에서 먼저 판정되면 시트를 닫고 알린다', async () => {
      const { deliver, wrapper } = await openJudgeTab()

      await wrapper.find('button[data-submission="s1"]').trigger('click')
      await flushPromises()

      deliver.submissions([])
      await flushPromises()

      expect(toastMock).toHaveBeenCalledWith({ title: '이미 판정된 킬샷이에요.', tone: 'neutral' })
      expect(toastMock).not.toHaveBeenCalledWith({
        title: '판정을 처리하지 못했어요. 다시 시도해 주세요.',
        tone: 'danger',
      })
      expect(approveSubmissionMock).not.toHaveBeenCalled()
    })

    it('판정 요청 중 다른 기기가 먼저 처리하면 요청 실패 후 사라진 시트를 닫는다', async () => {
      const { deliver, wrapper } = await openJudgeTab()
      const request = deferred()
      void request.promise.catch(() => {})
      approveSubmissionMock.mockReturnValueOnce(request.promise)

      await wrapper.find('button[data-submission="s1"]').trigger('click')
      await flushPromises()
      document.body.querySelector<HTMLButtonElement>('button[data-team="A"]')!.click()
      await flushPromises()
      sheetButton('판정 확정')!.click()
      await flushPromises()

      deliver.submissions([])
      await flushPromises()
      getSubmissionStatusFromServerMock.mockResolvedValueOnce('approved')
      request.reject(new Error('already judged'))
      await flushPromises()

      expect(toastMock).toHaveBeenCalledWith({ title: '이미 판정된 킬샷이에요.', tone: 'neutral' })
      expect(document.body.textContent).not.toContain('잡힌 팀 선택')
    })

    it('큐 Listen 오류가 나면 stale 행 대신 지속 오류 상태를 표시한다', async () => {
      const { deliver, wrapper } = await openJudgeTab()
      expect(wrapper.find('button[data-submission="s1"]').exists()).toBe(true)

      deliver.submissionsError(new Error('permission-denied'))
      await flushPromises()

      expect(wrapper.text()).toContain('판정 큐 연결 오류')
      expect(wrapper.text()).toContain('연결이 복구되기 전에는 남아 있던 판정 항목을 사용할 수 없어요.')
      expect(wrapper.find('button[data-submission="s1"]').exists()).toBe(false)
    })

    it('판정 시트가 열린 중 큐 Listen 오류가 나도 선판정으로 오인하지 않는다', async () => {
      const { deliver, wrapper } = await openJudgeTab()

      await wrapper.find('button[data-submission="s1"]').trigger('click')
      await flushPromises()
      expect(document.body.textContent).toContain('잡힌 팀 선택')

      deliver.submissionsError(new Error('permission-denied'))
      await flushPromises()

      expect(wrapper.text()).toContain('판정 큐 연결 오류')
      expect(document.body.textContent).not.toContain('잡힌 팀 선택')
      expect(toastMock).not.toHaveBeenCalledWith({
        title: '이미 판정된 킬샷이에요.',
        tone: 'neutral',
      })
      expect(toastMock).toHaveBeenCalledWith({
        title: '판정 큐 연결이 끊겼어요. 화면을 새로고침해 주세요.',
        tone: 'danger',
      })
    })

    it('로컬 제거 뒤 판정이 거부되면 서버 pending을 확인하고 일반 오류로 유지한다', async () => {
      const { deliver, wrapper } = await openJudgeTab()
      const request = deferred()
      void request.promise.catch(() => {})
      approveSubmissionMock.mockReturnValueOnce(request.promise)

      await wrapper.find('button[data-submission="s1"]').trigger('click')
      await flushPromises()
      document.body.querySelector<HTMLButtonElement>('button[data-team="A"]')!.click()
      await flushPromises()
      sheetButton('판정 확정')!.click()
      await flushPromises()

      deliver.submissions([])
      await flushPromises()
      request.reject(new Error('permission denied'))
      await flushPromises()

      expect(toastMock).toHaveBeenCalledWith({
        title: '판정을 처리하지 못했어요. 다시 시도해 주세요.',
        tone: 'danger',
      })
      expect(toastMock).not.toHaveBeenCalledWith({
        title: '이미 판정된 킬샷이에요.',
        tone: 'neutral',
      })
      expect(document.body.textContent).toContain('잡힌 팀 선택')
      expect(getSubmissionStatusFromServerMock).toHaveBeenCalledWith('AB2C', 's1')
    })

    it('판정 실패 뒤 서버 상태 확인도 실패하면 선판정으로 단정하지 않는다', async () => {
      const { wrapper } = await openJudgeTab()
      approveSubmissionMock.mockRejectedValueOnce(new Error('permission denied'))
      getSubmissionStatusFromServerMock.mockRejectedValueOnce(new Error('offline'))

      await wrapper.find('button[data-submission="s1"]').trigger('click')
      await flushPromises()
      document.body.querySelector<HTMLButtonElement>('button[data-team="A"]')!.click()
      await flushPromises()
      sheetButton('판정 확정')!.click()
      await flushPromises()

      expect(toastMock).toHaveBeenCalledWith({
        title: '판정을 처리하지 못했어요. 다시 시도해 주세요.',
        tone: 'danger',
      })
      expect(toastMock).not.toHaveBeenCalledWith({
        title: '이미 판정된 킬샷이에요.',
        tone: 'neutral',
      })
      expect(document.body.textContent).toContain('잡힌 팀 선택')
    })
  })

  it('화면을 떠나면 구독을 해제한다', async () => {
    const deliver = captureSnapshotCallbacks()
    const wrapper = mountPage()
    deliver.room(hostRoom())
    await flushPromises()

    wrapper.unmount()

    expect(unsubscribeMock).toHaveBeenCalledTimes(4)
  })
})
