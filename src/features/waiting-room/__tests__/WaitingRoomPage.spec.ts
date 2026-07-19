import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import type { Participant, RoomInfo } from '../api/rooms'

const authState = { user: null as { uid: string; displayName: string } | null }
const fetchMyGenderMock = vi.fn<(uid: string) => Promise<'male' | 'female' | null>>()
vi.mock('@/features/auth', () => ({
  useAuthStore: () => ({
    get user() {
      return authState.user
    },
  }),
  fetchMyGender: (uid: string) => fetchMyGenderMock(uid),
}))

const getRoomMock = vi.fn<(code: string) => Promise<RoomInfo | null>>()
const joinRoomMock =
  vi.fn<(code: string, member: { uid: string; nickname: string }) => Promise<void>>()
const setReadyMock = vi.fn<(code: string, uid: string) => Promise<void>>()
const unsubscribeParticipantsMock = vi.fn<() => void>()
const unsubscribeRoomMock = vi.fn<() => void>()
const subscribeParticipantsMock =
  vi.fn<(code: string, onChange: (participants: Participant[]) => void) => () => void>()
const subscribeRoomMock =
  vi.fn<(code: string, onChange: (room: RoomInfo | null) => void) => () => void>()

vi.mock('../api/rooms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/rooms')>()
  return {
    normalizeRoomCode: actual.normalizeRoomCode,
    RoomNotFoundError: actual.RoomNotFoundError,
    getRoom: (code: string) => getRoomMock(code),
    joinRoom: (code: string, member: { uid: string; nickname: string }) =>
      joinRoomMock(code, member),
    setReady: (code: string, uid: string) => setReadyMock(code, uid),
    subscribeToParticipants: (code: string, onChange: (participants: Participant[]) => void) =>
      subscribeParticipantsMock(code, onChange),
    subscribeToRoom: (code: string, onChange: (room: RoomInfo | null) => void) =>
      subscribeRoomMock(code, onChange),
  }
})

const toastMock = vi.fn<(options: { title: string; tone?: string }) => number>()
vi.mock('@/shared/composables/useToast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

const replaceMock = vi.fn<() => void>()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { roomCode: 'ab2c' } }),
  useRouter: () => ({ replace: replaceMock, push: vi.fn<() => void>() }),
}))

import { RoomNotFoundError } from '../api/rooms'
import WaitingRoomPage from '../WaitingRoomPage.vue'
import PlayerChip from '../components/PlayerChip.vue'

/** 구독 콜백들을 붙잡아 테스트가 스냅샷 도착을 흉내 낼 수 있게 한다 */
function captureSnapshotCallbacks() {
  let deliverParticipants: (participants: Participant[]) => void = () => {}
  let deliverRoom: (room: RoomInfo | null) => void = () => {}
  subscribeParticipantsMock.mockImplementation((_code, onChange) => {
    deliverParticipants = onChange
    return unsubscribeParticipantsMock
  })
  subscribeRoomMock.mockImplementation((_code, onChange) => {
    deliverRoom = onChange
    return unsubscribeRoomMock
  })
  return {
    participants: (participants: Participant[]) => deliverParticipants(participants),
    room: (room: RoomInfo | null) => deliverRoom(room),
  }
}

function mountPage() {
  return mount(WaitingRoomPage, {
    global: { plugins: [createPinia()] },
  })
}

function findButton(wrapper: ReturnType<typeof mountPage>, text: string) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

const GUEST_ROOM: RoomInfo = { hostUid: 'host9', status: 'waiting' }
const MY_ROOM: RoomInfo = { hostUid: 'me', status: 'waiting' }

const ROSTER: Participant[] = [
  { id: 'me', name: '오리', team: null, gender: 'male', isReady: false },
  { id: 'u2', name: '하린', team: 'red', gender: 'female', isReady: true },
  { id: 'u3', name: '도윤', team: null, gender: 'male', isReady: true },
]

describe('WaitingRoomPage', () => {
  beforeEach(() => {
    authState.user = { uid: 'me', displayName: '오리' }
    fetchMyGenderMock.mockReset().mockResolvedValue('male')
    getRoomMock.mockReset().mockResolvedValue(GUEST_ROOM)
    joinRoomMock.mockReset().mockResolvedValue(undefined)
    setReadyMock.mockReset().mockResolvedValue(undefined)
    subscribeParticipantsMock.mockReset().mockReturnValue(unsubscribeParticipantsMock)
    subscribeRoomMock.mockReset().mockReturnValue(unsubscribeRoomMock)
    unsubscribeParticipantsMock.mockReset()
    unsubscribeRoomMock.mockReset()
    replaceMock.mockReset()
    toastMock.mockReset()
  })

  it('라우트의 초대 코드를 정규화해 입장하고 룸 카드와 명단을 렌더한다', async () => {
    const deliver = captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()

    expect(joinRoomMock).toHaveBeenCalledWith('AB2C', {
      uid: 'me',
      nickname: '오리',
      gender: 'male',
    })
    expect(wrapper.text()).toContain('ROOM AB2C')
    expect(wrapper.text()).toContain('대기 중')

    deliver.participants(ROSTER)
    await flushPromises()

    expect(wrapper.findAllComponents(PlayerChip)).toHaveLength(3)
    expect(wrapper.text()).toContain('참가자 3명 · 준비 2명')
    expect(wrapper.text()).toContain('3명 입장 · 2명 레디')
  })

  it('참가자가 없으면 명단 대신 초대 안내 문구를 보여준다', async () => {
    const deliver = captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()
    deliver.participants([])
    await flushPromises()

    expect(wrapper.findAllComponents(PlayerChip)).toHaveLength(0)
    expect(wrapper.text()).toContain('아직 입장한 참가자가 없어요. 초대 링크를 공유해 보세요.')
  })

  it('초대 링크 복사 버튼은 ?code= 링크를 클립보드에 복사하고 토스트를 띄운다', async () => {
    const writeTextMock = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    })
    captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()

    await findButton(wrapper, '초대 링크 복사')!.trigger('click')
    await flushPromises()

    expect(writeTextMock).toHaveBeenCalledWith(`${window.location.origin}/?code=AB2C`)
    expect(toastMock).toHaveBeenCalledWith({ title: '초대 링크를 복사했어요.', tone: 'success' })
  })

  it('입장 처리가 끝나기 전에는 로딩 상태를 보여준다', async () => {
    getRoomMock.mockReturnValue(new Promise(() => {}))
    const wrapper = mountPage()

    expect(wrapper.text()).toContain('대기실에 입장하는 중')
    expect(wrapper.findAllComponents(PlayerChip)).toHaveLength(0)
  })

  it('방이 없으면 안내 문구와 입장 화면으로 버튼을 보여준다', async () => {
    getRoomMock.mockResolvedValue(null)
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('방을 찾을 수 없어요')

    await findButton(wrapper, '입장 화면으로')!.trigger('click')
    expect(replaceMock).toHaveBeenCalledWith({ name: 'entry' })
  })

  it('입장 도중 방이 사라진 레이스도 방 없음 안내로 수렴한다', async () => {
    joinRoomMock.mockRejectedValue(new RoomNotFoundError('사라진 방'))
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('방을 찾을 수 없어요')
  })

  it('게스트는 안전 수칙 동의 CTA를 보고 팀 배정 시작 버튼은 없다', async () => {
    const deliver = captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()
    deliver.participants(ROSTER)
    await flushPromises()

    expect(findButton(wrapper, '확인하고 준비 완료')).toBeDefined()
    expect(findButton(wrapper, '팀 배정 시작')).toBeUndefined()
    expect(wrapper.text()).toContain('아래 확인 버튼을 누르면 안전 수칙과 개인 책임에 동의합니다.')
  })

  it('CTA 클릭 시 레디를 요청하고 스냅샷 갱신으로 버튼이 비활성화된다', async () => {
    const deliver = captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()
    deliver.participants(ROSTER)
    await flushPromises()

    const cta = findButton(wrapper, '확인하고 준비 완료')!
    await cta.trigger('click')
    await flushPromises()

    expect(setReadyMock).toHaveBeenCalledExactlyOnceWith('AB2C', 'me')

    deliver.participants([{ ...ROSTER[0]!, isReady: true }, ...ROSTER.slice(1)])
    await flushPromises()

    expect(wrapper.text()).toContain('참가자 3명 · 준비 3명')
    expect(cta.text()).toBe('준비 완료')
    expect(cta.attributes('disabled')).toBeDefined()
  })

  it('호스트(진행자)는 팀 배정 시작 버튼만 보고, 준비 CTA·동의 안내문·명단의 자신이 없다', async () => {
    const deliver = captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue(MY_ROOM)
    const wrapper = mountPage()
    await flushPromises()
    // 진행자 모델 이전에 남은 호스트('me') 참가자 문서가 있어도 명단에서 걸러진다
    deliver.participants(ROSTER)
    await flushPromises()

    expect(joinRoomMock).not.toHaveBeenCalled()
    expect(findButton(wrapper, '팀 배정 시작')).toBeDefined()
    expect(findButton(wrapper, '확인하고 준비 완료')).toBeUndefined()
    expect(findButton(wrapper, '게임 시작')).toBeUndefined()
    expect(wrapper.text()).not.toContain('아래 확인 버튼을 누르면')
    expect(wrapper.findAllComponents(PlayerChip)).toHaveLength(2)
    expect(wrapper.text()).toContain('참가자 2명 · 준비 2명')
    expect(wrapper.text()).not.toContain('오리')
  })

  it('방 status가 playing이 되면 카메라 화면으로 replace 이동한다', async () => {
    const deliver = captureSnapshotCallbacks()
    mountPage()
    await flushPromises()

    deliver.room({ hostUid: 'host9', status: 'playing' })
    await flushPromises()

    expect(replaceMock).toHaveBeenCalledWith({ name: 'camera' })
  })

  it('화면을 떠나면 방·명단 구독을 해제한다', async () => {
    captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()

    wrapper.unmount()

    expect(unsubscribeParticipantsMock).toHaveBeenCalledTimes(1)
    expect(unsubscribeRoomMock).toHaveBeenCalledTimes(1)
  })
})
