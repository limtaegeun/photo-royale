import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { RoomSummary } from '../api/rooms'

const authState = { user: null as { uid: string } | null }
vi.mock('@/features/auth', () => ({
  useAuthStore: () => ({
    get user() {
      return authState.user
    },
  }),
}))

const fetchMyRoomsMock = vi.fn<(hostUid: string) => Promise<RoomSummary[]>>()
vi.mock('../api/rooms', () => ({
  fetchMyRooms: (hostUid: string) => fetchMyRoomsMock(hostUid),
}))

const pushMock = vi.fn<() => void>()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import MyRoomList from '../components/MyRoomList.vue'

// fetchMyRooms 계약대로 최신순
const ROOMS: RoomSummary[] = [
  { code: 'NEW2', createdAt: null, status: 'waiting' },
  { code: 'MID3', createdAt: new Date('2026-07-15T10:00:00Z'), status: 'waiting' },
  { code: 'OLD1', createdAt: new Date('2026-07-14T10:00:00Z'), status: 'waiting' },
]

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(text))
}

describe('MyRoomList', () => {
  beforeEach(() => {
    authState.user = { uid: 'me' }
    fetchMyRoomsMock.mockReset()
    pushMock.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('랜딩에는 가장 최근 방 1개만 돌아가기로 보여준다', async () => {
    fetchMyRoomsMock.mockResolvedValue(ROOMS)
    const wrapper = mount(MyRoomList)
    await flushPromises()

    expect(fetchMyRoomsMock).toHaveBeenCalledWith('me')
    expect(wrapper.text()).toContain('ROOM NEW2 대기실로 돌아가기')
    expect(wrapper.text()).not.toContain('OLD1')
    expect(wrapper.text()).not.toContain('MID3')
  })

  it('돌아가기 행을 누르면 해당 방 대기실로 push 이동한다', async () => {
    fetchMyRoomsMock.mockResolvedValue(ROOMS)
    const wrapper = mount(MyRoomList)
    await flushPromises()

    await findButton(wrapper, '대기실로 돌아가기')!.trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'waiting-room', params: { roomCode: 'NEW2' } })
  })

  it('지난 방 모두 보기를 누르면 시트에 전체 목록이 열리고 항목 탭으로 입장한다', async () => {
    fetchMyRoomsMock.mockResolvedValue(ROOMS)
    const wrapper = mount(MyRoomList)
    await flushPromises()

    const trigger = findButton(wrapper, '지난 방 모두 보기 (3)')
    expect(trigger).toBeDefined()

    await trigger!.trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('내가 만든 방')
    expect(document.body.textContent).toContain('OLD1')
    expect(document.body.textContent).toContain('MID3')
    // serverTimestamp 반영 전인 방은 '방금'으로 표시
    expect(document.body.textContent).toContain('ROOM NEW2 · 방금')

    const sheetButtons = Array.from(document.body.querySelectorAll('button'))
    const oldRoomButton = sheetButtons.find((b) => b.textContent?.includes('OLD1'))
    oldRoomButton!.click()
    await flushPromises()

    expect(pushMock).toHaveBeenCalledWith({ name: 'waiting-room', params: { roomCode: 'OLD1' } })
  })

  it('방이 1개뿐이면 모두 보기 진입점을 렌더하지 않는다', async () => {
    fetchMyRoomsMock.mockResolvedValue([ROOMS[0]!])
    const wrapper = mount(MyRoomList)
    await flushPromises()

    expect(findButton(wrapper, '지난 방 모두 보기')).toBeUndefined()
  })

  it('만든 방이 없으면 섹션을 렌더하지 않는다', async () => {
    fetchMyRoomsMock.mockResolvedValue([])
    const wrapper = mount(MyRoomList)
    await flushPromises()

    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('목록 로드에 실패해도 화면을 막지 않고 섹션을 숨긴다', async () => {
    fetchMyRoomsMock.mockRejectedValue(new Error('permission denied'))
    const wrapper = mount(MyRoomList)
    await flushPromises()

    expect(wrapper.find('section').exists()).toBe(false)
  })
})
