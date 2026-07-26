import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Participant, RoomInfo, RoundState } from '@/features/waiting-room'
import type { Notice } from '../api/notices'
import type { Submission } from '../api/submissions'

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
  }
})

const toastMock = vi.fn<(options: { title: string; tone?: string }) => number>()
vi.mock('@/shared/composables/useToast', () => ({
  useToast: () => ({ toast: toastMock, dismissAll: vi.fn<() => void>() }),
}))

const replaceMock = vi.fn<(to: unknown) => void>()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { roomCode: 'ab2c' }, fullPath: '/round-ops/ab2c' }),
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
  return {
    room: (room: RoomInfo | null) => deliverRoom(room),
    participants: (participants: Participant[]) => deliverParticipants(participants),
    notice: (notice: Notice | null) => deliverNotice(notice),
    submissions: (submissions: Submission[]) => deliverSubmissions(submissions),
    submissionsError: (error: Error) => failSubmissions(error),
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

    it('남은 시간이 0이면 종료로 표시하고 다시 시작할 수 있게 한다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ round: ended() }))
      await flushPromises()

      expect(wrapper.text()).toContain('00:00')
      expect(wrapper.text()).toContain('종료')
      expect(findButton(wrapper, '라운드 시작')).toBeDefined()
      expect(wrapper.text()).not.toContain('시간 조정')
    })

    it('아직 시작되지 않은 방에서는 컨트롤 대신 안내를 보여준다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()

      deliver.room(hostRoom({ status: 'waiting' }))
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

      deliver.room(hostRoom({ status: 'waiting', round: null }))
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
    it('기록 탭은 준비 중 안내로 대체되고 운영 컨트롤을 숨긴다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ round: running() }))
      await flushPromises()

      await wrapper.find('[data-value="log"]').trigger('click')

      expect(wrapper.text()).toContain('기록 화면 준비 중')
      expect(findButton(wrapper, '일시정지')).toBeUndefined()

      await wrapper.find('[data-value="ops"]').trigger('click')
      expect(findButton(wrapper, '일시정지')).toBeDefined()
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

    it('시작 전(waiting) 방에서는 큐 대신 안내를 보여준다', async () => {
      const deliver = captureSnapshotCallbacks()
      const wrapper = mountPage()
      deliver.room(hostRoom({ status: 'waiting' }))
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
