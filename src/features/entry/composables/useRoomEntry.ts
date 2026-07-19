import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/features/auth'
import { createRoom, normalizeRoomCode, roomExists } from '@/features/waiting-room'

/**
 * 입장 화면의 방 생성·초대 코드 입장 플로우 — 제출 중 상태와 실패 → 안내 문구 매핑을
 * 담당한다(auth의 useLogin/useSignup과 같은 계층). 화면 전환까지 여기서 처리하므로
 * 컴포넌트는 입력값과 표현만 남는다.
 */
export function useRoomEntry() {
  const router = useRouter()
  const authStore = useAuthStore()

  const isSubmitting = ref(false)
  const actionError = ref<string | null>(null)

  /** 방 생성 후 곧바로 그 방의 대기실로 이동한다(호스트 플로우) */
  async function createAndEnter() {
    const uid = authStore.user?.uid
    if (!uid || isSubmitting.value) return
    isSubmitting.value = true
    actionError.value = null
    try {
      const code = await createRoom(uid)
      router.push({ name: 'waiting-room', params: { roomCode: code } })
    } catch {
      actionError.value = '방을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'
    } finally {
      isSubmitting.value = false
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
    isSubmitting.value = true
    actionError.value = null
    try {
      // 대기실로 넘어가기 전에 코드 오타를 이 화면에서 걸러 빠른 피드백을 준다
      if (!(await roomExists(code))) {
        actionError.value = '해당 초대 코드의 방을 찾을 수 없어요.'
        return
      }
      router.push({ name: 'waiting-room', params: { roomCode: code } })
    } catch {
      actionError.value = '입장에 실패했어요. 잠시 후 다시 시도해 주세요.'
    } finally {
      isSubmitting.value = false
    }
  }

  return { isSubmitting, actionError, createAndEnter, joinWithCode }
}
