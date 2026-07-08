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

  // 첫 인증 상태가 확정될 때까지 라우트 가드 등이 기다릴 수 있도록 promise로 보관한다.
  let readyPromise: Promise<void> | null = null

  /** 앱 부팅 시 1회 호출 — Firebase가 복원한 세션을 스토어에 반영한다. 중복 호출은 무시된다. */
  function init() {
    if (readyPromise) return readyPromise
    readyPromise = new Promise<void>((resolve) => {
      onAuthStateChanged(auth, (nextUser) => {
        user.value = nextUser
        if (!initialized.value) {
          initialized.value = true
          resolve()
        }
      })
    })
    return readyPromise
  }

  /** 첫 onAuthStateChanged 콜백으로 인증 상태가 확정될 때까지 기다린다(가드에서 사용) */
  function whenReady() {
    return init()
  }

  return { user, initialized, isAuthenticated, init, whenReady }
})
