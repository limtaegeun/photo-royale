import { createRouter, createWebHistory } from 'vue-router'
import { EntryPage } from '@/features/entry'
import { LoginPage, SignupPage, authGuard } from '@/features/auth'
import { ProfilePage } from '@/features/profile'

declare module 'vue-router' {
  interface RouteMeta {
    /** 앱 셸 공용 헤더(AppHeader) 숨김 — 카메라 콕핏 등 풀스크린 화면에 지정한다 */
    hideAppHeader?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      // 공개 랜딩 — 비로그인도 열람 가능. 인증이 필요한 건 게임 입장 이후 플로우(로비 등)다.
      path: '/',
      name: 'entry',
      component: EntryPage,
    },
    {
      path: '/login',
      name: 'login',
      component: LoginPage,
      meta: { guestOnly: true },
    },
    {
      path: '/signup',
      name: 'signup',
      component: SignupPage,
      meta: { guestOnly: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfilePage,
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach(authGuard)

export default router
