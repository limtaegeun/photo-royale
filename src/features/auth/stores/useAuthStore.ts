import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../api/firebase'

/**
 * 세션 유지 스토어. 스레드 결론대로 "세션 날아가면 게임이 터지는" 문제를 막기 위해
 * onAuthStateChanged로 새로고침·재방문 시에도 로그인 상태를 복원한다.
 */
export const useAuthStore = defineStore('auth', () => {
  // Firebase User는 메서드를 가진 클래스 인스턴스라 deep-reactive ref로 감싸면
  // Proxy 래핑으로 getIdToken()/delete() 등이 깨질 수 있다. shallowRef로 원본을 보존한다.
  const user = shallowRef<User | null>(null)
  /** 첫 onAuthStateChanged 콜백이 오기 전까지는 로그인 여부를 알 수 없다 */
  const initialized = ref(false)

  const isAuthenticated = computed(() => user.value !== null)

  /** 앱 부팅 시 1회 호출 — Firebase가 복원한 세션을 스토어에 반영한다 */
  function init() {
    onAuthStateChanged(auth, (nextUser) => {
      user.value = nextUser
      initialized.value = true
    })
  }

  return { user, initialized, isAuthenticated, init }
})
