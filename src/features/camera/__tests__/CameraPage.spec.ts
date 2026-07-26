import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import type { RoomInfo, RoundState } from '@/features/waiting-room'

const replaceMock = vi.fn<(to: unknown) => void>()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { roomCode: 'ab2c' } }),
  useRouter: () => ({ replace: replaceMock, push: vi.fn<() => void>() }),
}))

vi.mock('@/features/auth', () => ({
  useAuthStore: () => ({ user: { uid: 'player1' } }),
}))

const unsubscribeNoticeMock = vi.fn<() => void>()
const subscribeNoticeMock =
  vi.fn<
    (
      code: string,
      onChange: (notice: { id: string; text: string; createdAtMs: number | null } | null) => void,
      onError?: (error: Error) => void,
    ) => () => void
  >()

vi.mock('@/features/round-ops', async () => {
  const { computed } = await import('vue')
  return {
    subscribeToLatestNotice: (
      code: string,
      onChange: (notice: { id: string; text: string; createdAtMs: number | null } | null) => void,
      onError?: (error: Error) => void,
    ) => subscribeNoticeMock(code, onChange, onError),
    useRoundTimer: () => ({
      formatted: computed(() => '20:00'),
      displayState: computed(() => 'running'),
    }),
  }
})

const toastMock = vi.fn<(options: { title: string; tone?: string }) => number>()
vi.mock('@/shared/composables/useToast', () => ({
  useToast: () => ({ toast: toastMock, dismissAll: vi.fn<() => void>() }),
}))

const unsubscribeRoomMock = vi.fn<() => void>()
const subscribeRoomMock =
  vi.fn<
    (
      code: string,
      onChange: (room: RoomInfo | null) => void,
      onError?: (error: Error) => void,
    ) => () => void
  >()
const unsubscribeParticipantsMock = vi.fn<() => void>()
const subscribeParticipantsMock =
  vi.fn<
    (
      code: string,
      onChange: (participants: unknown[]) => void,
      onError?: (error: Error) => void,
    ) => () => void
  >()

vi.mock('@/features/waiting-room', () => {
  return {
    normalizeRoomCode: (code: string) => code.trim().toUpperCase(),
    isAssignedInRound: (
      participant: { team: string | null; assignedRound: number },
      assignmentRound: number,
    ) =>
      assignmentRound > 0 &&
      participant.team !== null &&
      participant.assignedRound === assignmentRound,
    subscribeToRoom: (
      code: string,
      onChange: (room: RoomInfo | null) => void,
      onError?: (error: Error) => void,
    ) => subscribeRoomMock(code, onChange, onError),
    subscribeToParticipants: (
      code: string,
      onChange: (participants: unknown[]) => void,
      onError?: (error: Error) => void,
    ) => subscribeParticipantsMock(code, onChange, onError),
  }
})

import CameraPage from '../CameraPage.vue'

/** 콕핏이 머물러야 하는 상태 — 진행 중인 방 + 시작된 라운드 */
const RUNNING_ROUND: RoundState = {
  status: 'running',
  startedAtMs: Date.now(),
  durationMs: 1_200_000,
  pausedRemainingMs: null,
}
function playingRoom(overrides: Partial<RoomInfo> = {}): RoomInfo {
  return {
    hostUid: 'host9',
    status: 'playing',
    assignmentRound: 1,
    gameMode: 'normal',
    round: RUNNING_ROUND,
    ...overrides,
  }
}

/** 방 스냅샷을 흉내 낼 수 있도록 구독 콜백을 붙잡는다 */
function captureRoomSnapshot() {
  let deliver: (room: RoomInfo | null) => void = () => {}
  subscribeRoomMock.mockImplementation((_code, onChange) => {
    deliver = onChange
    return unsubscribeRoomMock
  })
  return (room: RoomInfo | null) => deliver(room)
}

// jsdom에는 URL.createObjectURL/revokeObjectURL이 없어 직접 스텁한다
const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:preview')
const revokeObjectURL = vi.fn<(url: string) => void>()
Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })

function createFakeStream() {
  const tracks = [
    {
      stop: vi.fn<() => void>(),
      addEventListener: vi.fn<(event: string, handler: () => void) => void>(),
    },
  ]
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks,
  } as unknown as MediaStream
}

function stubGetUserMedia(impl: (constraints: MediaStreamConstraints) => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>(impl),
    },
    configurable: true,
  })
}

// jsdom은 canvas 2d 컨텍스트/toBlob을 구현하지 않으므로 프로토타입을 스텁한다
function stubCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage:
      vi.fn<(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) => void>(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['frame'], { type: 'image/jpeg' })),
  )
}

/** 뷰파인더가 켜진 상태의 페이지를 만들고 비디오 해상도 메타데이터까지 채운다 */
async function mountWithActiveCamera() {
  stubGetUserMedia(() => Promise.resolve(createFakeStream()))
  const wrapper = mount(CameraPage)
  await flushPromises()

  const video = wrapper.find('video').element
  Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true })
  Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true })
  return wrapper
}

function findButtonByText(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((button) => button.text() === text)
}

function findShutter(wrapper: VueWrapper) {
  return wrapper.find('button[aria-label="킬샷 촬영"]')
}

beforeEach(() => {
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  replaceMock.mockReset()
  toastMock.mockReset()
  unsubscribeRoomMock.mockReset()
  subscribeRoomMock.mockReset().mockReturnValue(unsubscribeRoomMock)
  unsubscribeParticipantsMock.mockReset()
  subscribeParticipantsMock.mockReset().mockReturnValue(unsubscribeParticipantsMock)
  unsubscribeNoticeMock.mockReset()
  subscribeNoticeMock.mockReset().mockImplementation((_code, onChange) => {
    onChange(null)
    return unsubscribeNoticeMock
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

/**
 * 콕핏은 방에 매여 있다 — 호스트가 게임을 종료하면 스스로 나와야 한다. 구독이 없으면
 * 플레이어가 카메라 화면에 갇히므로, 나가는 조건을 상태별로 고정해 둔다.
 */
describe('CameraPage 방 구독', () => {
  it('경로의 방 코드를 정규화해 구독하고 언마운트 시 해제한다', async () => {
    captureRoomSnapshot()
    stubGetUserMedia(() => Promise.resolve(createFakeStream()))
    const wrapper = mount(CameraPage)
    await flushPromises()

    expect(subscribeRoomMock).toHaveBeenCalledWith(
      'AB2C',
      expect.any(Function),
      expect.any(Function),
    )

    wrapper.unmount()
    expect(unsubscribeRoomMock).toHaveBeenCalledTimes(1)
    expect(unsubscribeParticipantsMock).toHaveBeenCalledTimes(1)
    expect(unsubscribeNoticeMock).toHaveBeenCalledTimes(1)
  })

  it('실시간 구독이 실패하면 한 번만 안내하고 입장 화면으로 돌아간다', async () => {
    let failRoom: (error: Error) => void = () => {}
    let failParticipants: (error: Error) => void = () => {}
    let failNotice: (error: Error) => void = () => {}
    subscribeRoomMock.mockImplementation((_code, _onChange, onError) => {
      failRoom = onError ?? failRoom
      return unsubscribeRoomMock
    })
    subscribeParticipantsMock.mockImplementation((_code, _onChange, onError) => {
      failParticipants = onError ?? failParticipants
      return unsubscribeParticipantsMock
    })
    subscribeNoticeMock.mockImplementation((_code, _onChange, onError) => {
      failNotice = onError ?? failNotice
      return unsubscribeNoticeMock
    })
    stubGetUserMedia(() => Promise.resolve(createFakeStream()))
    mount(CameraPage)
    await flushPromises()

    failRoom(new Error('permission-denied'))
    failParticipants(new Error('permission-denied'))
    failNotice(new Error('permission-denied'))

    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock).toHaveBeenCalledWith({
      title: '게임 정보를 불러올 수 없어요. 다시 입장해주세요.',
      tone: 'danger',
    })
    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith({ name: 'entry' })
  })

  it('진행 중인 라운드가 있으면 콕핏에 머문다', async () => {
    const deliver = captureRoomSnapshot()
    stubGetUserMedia(() => Promise.resolve(createFakeStream()))
    mount(CameraPage)
    await flushPromises()

    deliver(playingRoom())
    await flushPromises()

    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('게임이 종료되면(waiting) 대기실로 돌아간다', async () => {
    const deliver = captureRoomSnapshot()
    stubGetUserMedia(() => Promise.resolve(createFakeStream()))
    mount(CameraPage)
    await flushPromises()

    deliver(playingRoom())
    deliver({ ...playingRoom(), status: 'waiting', round: null })
    await flushPromises()

    expect(replaceMock).toHaveBeenCalledWith({
      name: 'waiting-room',
      params: { roomCode: 'AB2C' },
    })
  })

  it('라운드만 사라져도 대기실로 돌아간다', async () => {
    const deliver = captureRoomSnapshot()
    stubGetUserMedia(() => Promise.resolve(createFakeStream()))
    mount(CameraPage)
    await flushPromises()

    deliver(playingRoom({ round: null }))
    await flushPromises()

    expect(replaceMock).toHaveBeenCalledWith({
      name: 'waiting-room',
      params: { roomCode: 'AB2C' },
    })
  })

  it('방이 사라지면 안내 후 입장 화면으로 보낸다', async () => {
    const deliver = captureRoomSnapshot()
    stubGetUserMedia(() => Promise.resolve(createFakeStream()))
    mount(CameraPage)
    await flushPromises()

    deliver(null)
    await flushPromises()

    expect(toastMock).toHaveBeenCalledWith({ title: '방을 찾을 수 없어요.', tone: 'danger' })
    expect(replaceMock).toHaveBeenCalledWith({ name: 'entry' })
  })
})

describe('CameraPage', () => {
  it('마운트 시 카메라를 켜고 비디오에 스트림을 연결한다', async () => {
    const stream = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))

    const wrapper = mount(CameraPage)
    await flushPromises()

    const video = wrapper.find('video')
    expect(video.isVisible()).toBe(true)
    expect(video.element.srcObject).toBe(stream)
  })

  it('스트림이 활성화되면 킬샷 셔터를 보여준다', async () => {
    const wrapper = await mountWithActiveCamera()

    expect(findShutter(wrapper).exists()).toBe(true)
  })

  it('목표·남은 시간·팀 편성과 준비 중 슬롯을 HUD에 표시한다', async () => {
    subscribeParticipantsMock.mockImplementation((_code, onChange) => {
      onChange([
        {
          id: 'player1',
          name: '민우',
          team: 'A',
          assignedRound: 1,
          gender: 'male',
          isXTeam: false,
          sameGenderStreak: 0,
          previousPartnerIds: [],
          isReady: true,
        },
        {
          id: 'player2',
          name: '하린',
          team: 'A',
          assignedRound: 1,
          gender: 'female',
          isXTeam: false,
          sameGenderStreak: 0,
          previousPartnerIds: [],
          isReady: true,
        },
        {
          id: 'player3',
          name: '도윤',
          team: 'B',
          assignedRound: 1,
          gender: 'male',
          isXTeam: false,
          sameGenderStreak: 0,
          previousPartnerIds: [],
          isReady: true,
        },
      ])
      return unsubscribeParticipantsMock
    })
    const deliverRoom = captureRoomSnapshot()
    const wrapper = await mountWithActiveCamera()
    deliverRoom(playingRoom())
    await flushPromises()

    expect(wrapper.text()).toContain('상대 완장 알파벳을 찍어 제출하세요.')
    expect(wrapper.text()).toContain('20:00')
    expect(wrapper.text()).toContain('팀 A · 하린')
    expect(wrapper.text()).toContain('2팀 생존')
    expect(wrapper.text()).toContain('아이템')
    expect(wrapper.text()).toContain('지도')
    expect(wrapper.text()).toContain('기록')
  })

  it('넘치는 공지만 애니메이션하고 펼치면 전체 내용을 줄바꿈한다', async () => {
    const longNotice = 'https://example.com/' + 'a'.repeat(80)
    subscribeNoticeMock.mockImplementation((_code, onChange) => {
      onChange({ id: 'notice-1', text: longNotice, createdAtMs: null })
      return unsubscribeNoticeMock
    })
    const wrapper = await mountWithActiveCamera()
    const noticeButton = wrapper.find('button[aria-controls="cockpit-notice"]')
    const notice = wrapper.find('#cockpit-notice')

    expect(noticeButton.attributes('aria-expanded')).toBe('false')
    expect(notice.text()).toBe(longNotice)
    Object.defineProperty(notice.element, 'scrollWidth', { configurable: true, value: 600 })
    Object.defineProperty(notice.element.parentElement!, 'clientWidth', {
      configurable: true,
      value: 240,
    })
    window.dispatchEvent(new Event('resize'))
    await flushPromises()

    expect(notice.classes()).toContain('notice-marquee')
    expect(notice.attributes('style')).toContain('--notice-marquee-offset: -360px')
    expect(notice.attributes('style')).toContain('--notice-marquee-duration: 19s')
    expect(noticeButton.find('svg').classes()).toContain('shrink-0')
    expect(noticeButton.find('svg').classes()).toContain('ml-auto')
    expect(noticeButton.classes()).toContain('notice-button')

    await noticeButton.trigger('click')
    await flushPromises()
    expect(noticeButton.attributes('aria-expanded')).toBe('true')
    expect(notice.classes()).toContain('wrap-anywhere')
    expect(notice.classes()).toContain('whitespace-pre-wrap')
    expect(notice.classes()).not.toContain('notice-marquee')
    expect(noticeButton.find('span.flex.w-full').classes()).toContain('items-start')

    await noticeButton.trigger('click')
    await flushPromises()
    expect(noticeButton.attributes('aria-expanded')).toBe('false')
    expect(notice.classes()).toContain('notice-marquee-resumed')
    expect(notice.classes()).not.toContain('notice-marquee')

    await notice.trigger('animationiteration')
    expect(notice.classes()).toContain('notice-marquee')
    expect(notice.classes()).not.toContain('notice-marquee-resumed')
  })

  it('가용 폭을 넘지 않는 공지는 애니메이션 없이 그대로 표시한다', async () => {
    subscribeNoticeMock.mockImplementation((_code, onChange) => {
      onChange({ id: 'notice-short', text: '곧 시작합니다.', createdAtMs: null })
      return unsubscribeNoticeMock
    })
    const wrapper = await mountWithActiveCamera()
    const notice = wrapper.find('#cockpit-notice')
    Object.defineProperty(notice.element, 'scrollWidth', { configurable: true, value: 100 })
    Object.defineProperty(notice.element.parentElement!, 'clientWidth', {
      configurable: true,
      value: 240,
    })
    window.dispatchEvent(new Event('resize'))
    await flushPromises()

    expect(notice.text()).toBe('곧 시작합니다.')
    expect(notice.classes()).not.toContain('notice-marquee')
    expect(notice.attributes('style')).toBeUndefined()
  })

  it('HUD 버튼에 공용 패딩 옵션을 사용하고 셔터 전용 variant를 적용한다', async () => {
    const wrapper = await mountWithActiveCamera()
    const noticeButton = wrapper.find('button[aria-controls="cockpit-notice"]')
    const shutter = findShutter(wrapper)
    const slots = wrapper.findAll('button[data-variant="hud"][disabled]')

    expect(noticeButton.attributes('data-padding')).toBe('compact')
    expect(shutter.attributes('data-variant')).toBe('shutter')
    expect(shutter.attributes('data-padding')).toBe('none')
    expect(slots).toHaveLength(4)
    expect(slots.every((slot) => slot.attributes('data-padding') === 'none')).toBe(true)
  })

  it('촬영 버튼을 누르면 현재 프레임을 캡처해 미리보기를 보여준다', async () => {
    stubCanvas()
    const wrapper = await mountWithActiveCamera()

    await findShutter(wrapper).trigger('click')
    await flushPromises()

    const preview = wrapper.find('img')
    expect(preview.exists()).toBe(true)
    expect(preview.attributes('src')).toBe('blob:preview')
    expect(findShutter(wrapper).exists()).toBe(false)
    expect(wrapper.text()).toContain('킬샷 확인')
    expect(wrapper.text()).toContain('제출 준비 중')
  })

  it('다시 찍기를 누르면 미리보기를 닫고 뷰파인더로 돌아간다', async () => {
    stubCanvas()
    const wrapper = await mountWithActiveCamera()
    await findShutter(wrapper).trigger('click')
    await flushPromises()

    await findButtonByText(wrapper, '다시 찍기')!.trigger('click')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(findShutter(wrapper).exists()).toBe(true)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })

  it('권한 거부 시 안내 문구와 다시 시도 버튼을 보여준다', async () => {
    stubGetUserMedia(() => Promise.reject(new DOMException('denied', 'NotAllowedError')))

    const wrapper = mount(CameraPage)
    await flushPromises()

    expect(wrapper.find('video').isVisible()).toBe(false)
    expect(wrapper.text()).toContain('카메라 권한이 거부되었습니다')
    expect(wrapper.find('button').text()).toBe('다시 시도')
  })

  it('다시 시도 버튼을 누르면 카메라 켜기를 재시도한다', async () => {
    stubGetUserMedia(() => Promise.reject(new DOMException('denied', 'NotAllowedError')))
    const wrapper = mount(CameraPage)
    await flushPromises()

    const stream = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('video').isVisible()).toBe(true)
    expect(wrapper.find('video').element.srcObject).toBe(stream)
  })

  it('언마운트 시 스트림 트랙을 정지한다', async () => {
    const stream = createFakeStream()
    stubGetUserMedia(() => Promise.resolve(stream))

    const wrapper = mount(CameraPage)
    await flushPromises()
    wrapper.unmount()

    stream.getTracks().forEach((track) => expect(track.stop).toHaveBeenCalledOnce())
  })
})
