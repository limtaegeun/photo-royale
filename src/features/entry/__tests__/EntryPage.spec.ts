import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import EntryPage from '../EntryPage.vue'

// 테스트마다 로그인/비로그인 상태를 바꿀 수 있도록 getter로 참조한다
const authState = { user: null as { uid: string; displayName: string } | null }
vi.mock('@/features/auth', () => ({
  useAuthStore: () => ({
    get user() {
      return authState.user
    },
    get isLoggedIn() {
      return authState.user !== null
    },
  }),
}))

const createRoomMock = vi.fn<(hostUid: string) => Promise<string>>()
const roomExistsMock = vi.fn<(code: string) => Promise<boolean>>()
vi.mock('@/features/waiting-room', () => ({
  ROOM_CODE_LENGTH: 4,
  createRoom: (hostUid: string) => createRoomMock(hostUid),
  roomExists: (code: string) => roomExistsMock(code),
  normalizeRoomCode: (rawCode: string) => rawCode.trim().toUpperCase(),
  // 내부 데이터 로딩까지 검증하는 건 MyRoomList.spec의 몫 — 여기선 배치만 본다
  MyRoomList: { name: 'MyRoomList', template: '<div data-testid="my-room-list" />' },
}))

const pushMock = vi.fn<() => void>()
const replaceMock = vi.fn<() => void>()
const routeState = { query: {} as Record<string, string> }
vi.mock('vue-router', () => ({
  useRoute: () => ({
    get query() {
      return routeState.query
    },
  }),
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}))

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

describe('EntryPage', () => {
  beforeEach(() => {
    authState.user = { uid: 'me', displayName: '오리' }
    routeState.query = {}
    createRoomMock.mockReset()
    roomExistsMock.mockReset()
    pushMock.mockReset()
    replaceMock.mockReset()
  })

  it('로그인한 사용자의 닉네임(displayName)으로 인사를 렌더한다', () => {
    const wrapper = mount(EntryPage)

    expect(wrapper.text()).toContain('오리님, 준비됐나요?')
  })

  it('로그인 상태면 방 만들기·초대 코드 입장을 렌더하고 로그인·회원가입 버튼은 없다', () => {
    const wrapper = mount(EntryPage)

    expect(findButton(wrapper, '새로운 방 만들기')).toBeDefined()
    expect(findButton(wrapper, '입장하기')).toBeDefined()
    expect(wrapper.find('input').attributes('placeholder')).toBe('초대 코드를 입력해주세요')
    expect(findButton(wrapper, '로그인')).toBeUndefined()
    expect(findButton(wrapper, '계정 만들기')).toBeUndefined()
  })

  it('비로그인이면 로그인·회원가입 CTA만 렌더하고 방 만들기/코드 입력/인사는 없다', () => {
    authState.user = null
    const wrapper = mount(EntryPage)

    expect(findButton(wrapper, '로그인')).toBeDefined()
    expect(findButton(wrapper, '계정 만들기')).toBeDefined()
    expect(findButton(wrapper, '새로운 방 만들기')).toBeUndefined()
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('준비됐나요?')
  })

  it('내가 만든 방 목록은 로그인 상태에서만 렌더한다', () => {
    const loggedIn = mount(EntryPage)
    expect(loggedIn.find('[data-testid="my-room-list"]').exists()).toBe(true)

    authState.user = null
    const loggedOut = mount(EntryPage)
    expect(loggedOut.find('[data-testid="my-room-list"]').exists()).toBe(false)
  })

  it('방 만들기를 누르면 내 uid로 방을 만들고 대기실로 push 이동한다', async () => {
    createRoomMock.mockResolvedValue('AB2C')
    const wrapper = mount(EntryPage)

    await findButton(wrapper, '새로운 방 만들기')!.trigger('click')
    await flushPromises()

    expect(createRoomMock).toHaveBeenCalledWith('me')
    expect(pushMock).toHaveBeenCalledWith({ name: 'waiting-room', params: { roomCode: 'AB2C' } })
  })

  it('초대 코드를 정규화해 방 존재를 확인하고 대기실로 push 이동한다', async () => {
    roomExistsMock.mockResolvedValue(true)
    const wrapper = mount(EntryPage)

    await wrapper.find('input').setValue(' ab2c ')
    await findButton(wrapper, '입장하기')!.trigger('click')
    await flushPromises()

    expect(roomExistsMock).toHaveBeenCalledWith('AB2C')
    expect(pushMock).toHaveBeenCalledWith({ name: 'waiting-room', params: { roomCode: 'AB2C' } })
  })

  it('초대 코드가 비어 있으면 입장하기는 활성 상태로 두고 제출 시 안내 문구를 보여준다', async () => {
    const wrapper = mount(EntryPage)

    const enterButton = findButton(wrapper, '입장하기')!
    expect(enterButton.attributes('disabled')).toBeUndefined()

    await enterButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('초대 코드를 입력해 주세요.')
    expect(roomExistsMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('없는 초대 코드면 안내 문구를 보여주고 이동하지 않는다', async () => {
    roomExistsMock.mockResolvedValue(false)
    const wrapper = mount(EntryPage)

    await wrapper.find('input').setValue('ZZZZ')
    await findButton(wrapper, '입장하기')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('해당 초대 코드의 방을 찾을 수 없어요.')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('공유 링크(?code=)로 온 로그인 사용자는 마운트 즉시 대기실로 replace 이동한다', () => {
    routeState.query = { code: 'ab2c' }
    mount(EntryPage)

    expect(replaceMock).toHaveBeenCalledWith({
      name: 'waiting-room',
      params: { roomCode: 'AB2C' },
    })
  })

  it('공유 링크로 온 비로그인 사용자의 로그인·회원가입 CTA는 code 쿼리를 들고 간다', async () => {
    authState.user = null
    routeState.query = { code: 'ab2c' }
    const wrapper = mount(EntryPage)

    expect(replaceMock).not.toHaveBeenCalled()

    await findButton(wrapper, '로그인')!.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'login', query: { code: 'AB2C' } })

    await findButton(wrapper, '계정 만들기')!.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'signup', query: { code: 'AB2C' } })
  })

  it('공유 코드가 없으면 로그인·회원가입 CTA는 쿼리 없이 이동한다', async () => {
    authState.user = null
    const wrapper = mount(EntryPage)

    await findButton(wrapper, '로그인')!.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'login', query: undefined })
  })
})
