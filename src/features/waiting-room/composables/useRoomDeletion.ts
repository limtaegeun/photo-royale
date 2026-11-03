import { ref } from 'vue'
import { deleteRoom, fetchRoomDeletionSummary, type RoomDeletionSummary } from '../api/roomDeletion'

/**
 * 확인 모달이 "지워질 것"을 읽는 상태.
 * loading: 개수를 세는 중 / ready: 개수를 읽었다 / missing: 방이 이미 없다 / error: 읽지 못했다
 */
export type RoomDeletionSummaryState = 'idle' | 'loading' | 'ready' | 'missing' | 'error'

export const ROOM_DELETE_ERROR_MESSAGE = '방을 삭제하지 못했어요. 다시 시도해 주세요.'

/**
 * 방 삭제 확인 흐름(P09) — 개수 읽기와 삭제의 로딩·실패 상태를 한곳에서 든다.
 * 개수를 읽기 전에는 삭제를 막는다: 무엇이 지워지는지 보여 준 뒤에만 지운다는 것이 이 모달의 약속이다.
 */
export function useRoomDeletion() {
  const summary = ref<RoomDeletionSummary | null>(null)
  const summaryState = ref<RoomDeletionSummaryState>('idle')
  const isDeleting = ref(false)
  const deleteError = ref<string | null>(null)

  // 모달을 닫고 다른 방을 바로 열면 앞 방의 늦은 응답이 뒤 방의 개수를 덮는다 — 세대로 버린다
  let generation = 0

  async function loadSummary(code: string): Promise<void> {
    const current = ++generation
    summary.value = null
    summaryState.value = 'loading'
    deleteError.value = null
    try {
      const next = await fetchRoomDeletionSummary(code)
      if (current !== generation) return
      summary.value = next
      summaryState.value = next === null ? 'missing' : 'ready'
    } catch {
      if (current === generation) summaryState.value = 'error'
    }
  }

  /** 삭제 — 성공하면 true. 실패하면 문구를 남기고 false(이미 지운 것은 그대로, 다시 누르면 이어서 지운다) */
  async function removeRoom(code: string): Promise<boolean> {
    if (isDeleting.value || summaryState.value !== 'ready') return false
    isDeleting.value = true
    deleteError.value = null
    try {
      await deleteRoom(code)
      return true
    } catch {
      deleteError.value = ROOM_DELETE_ERROR_MESSAGE
      return false
    } finally {
      isDeleting.value = false
    }
  }

  return { summary, summaryState, isDeleting, deleteError, loadSummary, removeRoom }
}
