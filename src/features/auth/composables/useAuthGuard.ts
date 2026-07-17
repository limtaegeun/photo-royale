import type { RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from '../stores/useAuthStore'

declare module 'vue-router' {
  interface RouteMeta {
    /** 인증된 사용자만 접근 가능. 미인증이면 login으로 보낸다. */
    requiresAuth?: boolean
    /** 미인증 사용자 전용(로그인·회원가입). 이미 인증됐으면 진입(entry)으로 막는다. */
    guestOnly?: boolean
  }
}

/**
 * 라우트 가드: 미인증 시 login으로, 인증 시 guestOnly(login/signup) 접근을 차단한다.
 * requiresAuth에 걸리는 미인증은 대부분 세션이 끊긴 기존 사용자라 signup이 아닌 login으로 보낸다.
 * 첫 인증 상태가 확정되기 전에는 판단할 수 없으므로 whenReady()로 기다린 뒤 결정한다.
 */
export async function authGuard(to: RouteLocationNormalized) {
  const authStore = useAuthStore()
  await authStore.whenReady()

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return { name: 'login' }
  }

  if (to.meta.guestOnly && authStore.isLoggedIn) {
    // 공유 초대 코드(?code=) 등 쿼리를 보존해, 진입 화면이 자동 입장 판단을 이어가게 한다
    return { name: 'entry', query: to.query }
  }
}
