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

const deleteRoomMock = vi.fn<(code: string) => Promise<void>>()
const fetchRoomDeletionSummaryMock = vi.fn<(code: string) => Promise<unknown>>()
vi.mock('../api/roomDeletion', () => ({
  deleteRoom: (code: string) => deleteRoomMock(code),
  fetchRoomDeletionSummary: (code: string) => fetchRoomDeletionSummaryMock(code),
}))

const toastMock = vi.fn<(options: { title: string; tone?: string }) => void>()
vi.mock('@/shared/composables/useToast', () => ({
  useToast: () => ({ toast: toastMock }),
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

/** 포털로 body에 그려진 버튼 — 시트·모달은 Reka 포털이라 wrapper 밖에 있다 */
function findBodyButton(match: (button: HTMLButtonElement) => boolean) {
  return Array.from(document.body.querySelectorAll('button')).find(match)
}

async function openSheet(wrapper: ReturnType<typeof mount>) {
  await findButton(wrapper, '지난 방 모두 보기')!.trigger('click')
  await flushPromises()
}

describe('MyRoomList', () => {
  beforeEach(() => {
    authState.user = { uid: 'me' }
    fetchMyRoomsMock.mockReset()
    pushMock.mockReset()
    deleteRoomMock.mockReset()
    fetchRoomDeletionSummaryMock.mockReset()
    toastMock.mockReset()
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

  it('방이 1개여도 모두 보기 진입점을 보인다 — 방 삭제가 시트에만 있어서다(P09)', async () => {
    fetchMyRoomsMock.mockResolvedValue([ROOMS[0]!])
    const wrapper = mount(MyRoomList)
    await flushPromises()

    expect(findButton(wrapper, '지난 방 모두 보기 (1)')).toBeDefined()
  })

  it('시트의 방마다 삭제 버튼이 있고, 누르면 그 방의 확인 모달이 열린다', async () => {
    fetchMyRoomsMock.mockResolvedValue(ROOMS)
    fetchRoomDeletionSummaryMock.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(MyRoomList, { attachTo: document.body })
    await flushPromises()
    await openSheet(wrapper)

    const deleteButtons = Array.from(document.body.querySelectorAll('button[aria-label$=" 삭제"]'))
    expect(deleteButtons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'ROOM NEW2 삭제',
      'ROOM MID3 삭제',
      'ROOM OLD1 삭제',
    ])

    ;(deleteButtons[1] as HTMLButtonElement).click()
    await flushPromises()

    expect(fetchRoomDeletionSummaryMock).toHaveBeenCalledWith('MID3')
    expect(document.body.textContent).toContain('ROOM MID3 방을 삭제할까요?')
    // 삭제 버튼은 입장으로 새지 않는다
    expect(pushMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('삭제를 끝내면 목록에서 빼고 토스트로 알린다', async () => {
    fetchMyRoomsMock.mockResolvedValue(ROOMS)
    fetchRoomDeletionSummaryMock.mockResolvedValue({
      status: 'waiting',
      counts: { participants: 2, submissions: 5, rounds: 1, notices: 0, assets: 1 },
    })
    deleteRoomMock.mockResolvedValue()
    const wrapper = mount(MyRoomList, { attachTo: document.body })
    await flushPromises()
    await openSheet(wrapper)

    findBodyButton((b) => b.getAttribute('aria-label') === 'ROOM NEW2 삭제')!.click()
    await flushPromises()
    findBodyButton((b) => b.textContent?.trim() === '삭제하기')!.click()
    await flushPromises()

    expect(deleteRoomMock).toHaveBeenCalledWith('NEW2')
    expect(toastMock).toHaveBeenCalledWith({ title: 'ROOM NEW2 방을 삭제했어요.', tone: 'success' })
    // 다음으로 최근인 방이 돌아가기로 승격된다
    expect(wrapper.text()).toContain('ROOM MID3 대기실로 돌아가기')
    expect(findButton(wrapper, '지난 방 모두 보기 (2)')).toBeDefined()
    wrapper.unmount()
  })

  it('이미 없던 방은 모달을 닫을 때 목록에서 뺀다(토스트 없음)', async () => {
    fetchMyRoomsMock.mockResolvedValue(ROOMS)
    fetchRoomDeletionSummaryMock.mockResolvedValue(null)
    const wrapper = mount(MyRoomList, { attachTo: document.body })
    await flushPromises()
    await openSheet(wrapper)

    findBodyButton((b) => b.getAttribute('aria-label') === 'ROOM OLD1 삭제')!.click()
    await flushPromises()
    expect(document.body.textContent).toContain('이미 삭제된 방이에요.')

    findBodyButton((b) => b.textContent?.trim() === '그대로 두기')!.click()
    await flushPromises()

    expect(deleteRoomMock).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
    expect(findButton(wrapper, '지난 방 모두 보기 (2)')).toBeDefined()
    wrapper.unmount()
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
