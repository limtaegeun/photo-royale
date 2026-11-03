import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { RoomDeletionSummary } from '../api/roomDeletion'

const deleteRoomMock = vi.fn<(code: string) => Promise<void>>()
const fetchRoomDeletionSummaryMock = vi.fn<(code: string) => Promise<RoomDeletionSummary | null>>()
vi.mock('../api/roomDeletion', () => ({
  deleteRoom: (code: string) => deleteRoomMock(code),
  fetchRoomDeletionSummary: (code: string) => fetchRoomDeletionSummaryMock(code),
}))

import RoomDeleteDialog from '../components/RoomDeleteDialog.vue'

const SUMMARY: RoomDeletionSummary = {
  status: 'waiting',
  counts: { participants: 12, submissions: 34, rounds: 3, notices: 2, assets: 1 },
}

function bodyButton(label: string) {
  return Array.from(document.body.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === label,
  )!
}

function mountOpen(roomCode = 'AB2C') {
  return mount(RoomDeleteDialog, {
    props: { roomCode, open: true },
    attachTo: document.body,
  })
}

describe('RoomDeleteDialog', () => {
  beforeEach(() => {
    deleteRoomMock.mockReset()
    fetchRoomDeletionSummaryMock.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('열리면 지울 내용을 세는 동안 삭제를 막는다', async () => {
    fetchRoomDeletionSummaryMock.mockReturnValue(new Promise(() => {}))
    const wrapper = mountOpen()
    await flushPromises()

    expect(document.body.textContent).toContain('ROOM AB2C 방을 삭제할까요?')
    expect(document.body.textContent).toContain('아래 내용이 모두 지워지고 되돌릴 수 없어요.')
    expect(document.body.textContent).toContain('지울 내용을 확인하고 있어요…')
    expect(bodyButton('삭제하기').disabled).toBe(true)
    wrapper.unmount()
  })

  it('지워질 것의 개수를 항목마다 보여 준다', async () => {
    fetchRoomDeletionSummaryMock.mockResolvedValue(SUMMARY)
    const wrapper = mountOpen()
    await flushPromises()

    const rows = Array.from(document.body.querySelectorAll('ul[aria-label="지워질 내용"] li')).map(
      (li) => li.textContent?.replace(/\s+/g, ''),
    )
    expect(rows).toEqual(['참가자12명', '킬샷사진34장', '라운드기록3개', '공지2개', '행사장지도1장'])
    expect(bodyButton('삭제하기').disabled).toBe(false)
    // 대기 중인 방에는 진행 중 경고가 없다
    expect(document.body.textContent).not.toContain('게임이 진행 중인 방이에요.')
    wrapper.unmount()
  })

  it('진행 중인 방이면 게임이 바로 끝난다고 경고한다', async () => {
    fetchRoomDeletionSummaryMock.mockResolvedValue({ ...SUMMARY, status: 'playing' })
    const wrapper = mountOpen()
    await flushPromises()

    expect(document.body.textContent).toContain(
      '게임이 진행 중인 방이에요. 삭제하면 참가자 화면에서도 게임이 바로 끝나요.',
    )
    wrapper.unmount()
  })

  it('삭제하기를 누르면 지우고, 끝나면 닫으며 deleted를 알린다', async () => {
    fetchRoomDeletionSummaryMock.mockResolvedValue(SUMMARY)
    let finish: () => void = () => {}
    deleteRoomMock.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const wrapper = mountOpen()
    await flushPromises()

    bodyButton('삭제하기').click()
    await flushPromises()
    // 지우는 동안에는 모달을 열어 두고 그대로 두기를 막는다
    expect(deleteRoomMock).toHaveBeenCalledWith('AB2C')
    expect(bodyButton('그대로 두기').disabled).toBe(true)
    expect(wrapper.emitted('deleted')).toBeUndefined()

    finish()
    await flushPromises()

    expect(wrapper.emitted('update:open')?.slice(-1)[0]).toEqual([false])
    expect(wrapper.emitted('deleted')).toEqual([['AB2C']])
    wrapper.unmount()
  })

  it('삭제에 실패하면 모달을 열어 둔 채 문구를 보이고 다시 누를 수 있다', async () => {
    fetchRoomDeletionSummaryMock.mockResolvedValue(SUMMARY)
    deleteRoomMock.mockRejectedValueOnce(new Error('permission-denied'))
    const wrapper = mountOpen()
    await flushPromises()

    bodyButton('삭제하기').click()
    await flushPromises()

    expect(document.body.textContent).toContain('방을 삭제하지 못했어요. 다시 시도해 주세요.')
    expect(wrapper.emitted('deleted')).toBeUndefined()
    expect(bodyButton('삭제하기').disabled).toBe(false)

    deleteRoomMock.mockResolvedValueOnce()
    bodyButton('삭제하기').click()
    await flushPromises()

    expect(deleteRoomMock).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('deleted')).toEqual([['AB2C']])
    wrapper.unmount()
  })

  it('개수를 읽지 못하면 삭제를 막고 다시 시도하라고 안내한다', async () => {
    fetchRoomDeletionSummaryMock.mockRejectedValue(new Error('unavailable'))
    const wrapper = mountOpen()
    await flushPromises()

    expect(document.body.textContent).toContain(
      '지울 내용을 불러오지 못했어요. 창을 닫고 다시 시도해 주세요.',
    )
    expect(bodyButton('삭제하기').disabled).toBe(true)
    wrapper.unmount()
  })

  it('이미 없는 방이면 안내하고 gone을 알린다', async () => {
    fetchRoomDeletionSummaryMock.mockResolvedValue(null)
    const wrapper = mountOpen()
    await flushPromises()

    expect(document.body.textContent).toContain('이미 삭제된 방이에요.')
    expect(bodyButton('삭제하기').disabled).toBe(true)
    expect(wrapper.emitted('gone')).toEqual([['AB2C']])
    wrapper.unmount()
  })

  it('다른 방으로 바로 다시 열면 앞 방의 늦은 개수가 덮지 않는다', async () => {
    let resolveFirst: (summary: RoomDeletionSummary) => void = () => {}
    fetchRoomDeletionSummaryMock
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ ...SUMMARY, counts: { ...SUMMARY.counts, participants: 1 } })
    const wrapper = mountOpen('AB2C')
    await flushPromises()

    await wrapper.setProps({ roomCode: 'QED4' })
    await flushPromises()
    resolveFirst(SUMMARY)
    await flushPromises()

    expect(document.body.textContent).toContain('ROOM QED4 방을 삭제할까요?')
    expect(document.body.textContent?.replace(/\s+/g, '')).toContain('참가자1명')
    wrapper.unmount()
  })
})
