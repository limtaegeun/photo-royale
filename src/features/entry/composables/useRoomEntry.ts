import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/features/auth'
import { createRoom, normalizeRoomCode, roomExists } from '@/features/waiting-room'
import { restartFirestoreNetwork } from '@/shared/api/firestoreConnection'
import { TimeoutError, withTimeout } from '@/shared/utils/withTimeout'

/** 방 만들기·코드 확인을 기다리는 시간(ms) — 연결이 멎으면 버튼 스피너가 끝나지 않는다 */
const ROOM_ENTRY_TIMEOUT_MS = 10_000

/** 시간 초과면 연결이 멎었다는 뜻이다 — 다음 시도가 같은 연결에 묶이지 않게 새로 열어 둔다 */
function recoverConnection(error: unknown) {
  if (error instanceof TimeoutError) void restartFirestoreNetwork().catch(() => {})
}

/**
 * 입장 화면의 방 생성·초대 코드 입장 플로우 — 제출 중 상태와 실패 → 안내 문구 매핑을
 * 담당한다(auth의 useLogin/useSignup과 같은 계층). 화면 전환까지 여기서 처리하므로
 * 컴포넌트는 입력값과 표현만 남는다.
 */
export function useRoomEntry() {
  const router = useRouter()
  const authStore = useAuthStore()

  /**
   * 진행 중인 액션 — 두 CTA가 제출 상태를 공유하므로, 누른 버튼에만 스피너를 띄울 수 있게
   * boolean이 아니라 액션 종류로 들고 있는다.
   */
  const pendingAction = ref<'create' | 'join' | null>(null)
  const isSubmitting = computed(() => pendingAction.value !== null)
  const actionError = ref<string | null>(null)

  /** 방 생성 후 곧바로 그 방의 대기실로 이동한다(호스트 플로우) */
  async function createAndEnter() {
    const uid = authStore.user?.uid
    if (!uid || isSubmitting.value) return
    pendingAction.value = 'create'
    actionError.value = null
    try {
      const code = await withTimeout(createRoom(uid), ROOM_ENTRY_TIMEOUT_MS)
      router.push({ name: 'waiting-room', params: { roomCode: code } })
    } catch (error) {
      recoverConnection(error)
      actionError.value = '방을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'
    } finally {
      pendingAction.value = null
    }
  }

  /** 초대 코드 검증 후 대기실로 이동한다(게스트 플로우) */
  async function joinWithCode(rawCode: string) {
    if (isSubmitting.value) return
    const code = normalizeRoomCode(rawCode)
    // 버튼을 비활성화하는 대신 제출 시점에 이유를 알려준다
    if (code === '') {
      actionError.value = '초대 코드를 입력해 주세요.'
      return
    }
    pendingAction.value = 'join'
    actionError.value = null
    try {
      // 대기실로 넘어가기 전에 코드 오타를 이 화면에서 걸러 빠른 피드백을 준다
      if (!(await withTimeout(roomExists(code), ROOM_ENTRY_TIMEOUT_MS))) {
        actionError.value = '해당 초대 코드의 방을 찾을 수 없어요.'
        return
      }
      router.push({ name: 'waiting-room', params: { roomCode: code } })
    } catch (error) {
      recoverConnection(error)
      actionError.value = '입장에 실패했어요. 잠시 후 다시 시도해 주세요.'
    } finally {
      pendingAction.value = null
    }
  }

  return { pendingAction, isSubmitting, actionError, createAndEnter, joinWithCode }
}
