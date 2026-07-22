import { createRouter, createWebHistory } from 'vue-router'
import { CameraPage } from '@/features/camera'
import { EntryPage } from '@/features/entry'
import { WaitingRoomPage } from '@/features/waiting-room'
import { LoginPage, SignupPage, authGuard } from '@/features/auth'
import { ProfilePage } from '@/features/profile'

declare module 'vue-router' {
  interface RouteMeta {
    /** 앱 셸 공용 헤더(AppHeader) 숨김 — 카메라 콕핏 등 풀스크린 화면에 지정한다 */
    hideAppHeader?: boolean
    /** AppHeader에 표시할 페이지 타이틀 — 페이지의 h1은 AppHeader가 담당한다 */
    appHeaderTitle?: string
    /** AppHeader 타이틀 아래 한 줄 설명 */
    appHeaderDescription?: string
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
      meta: {
        appHeaderTitle: '포토로얄',
        appHeaderDescription: '카메라로 즐기는 실시간 팀 서바이벌',
      },
    },
    {
      // 초대 코드가 곧 방 문서 ID — 새로고침·딥링크에도 같은 방으로 재입장한다
      path: '/waiting-room/:roomCode',
      name: 'waiting-room',
      component: WaitingRoomPage,
      meta: {
        requiresAuth: true,
        appHeaderTitle: '대기실',
        appHeaderDescription: '준비 전 안전 수칙을 확인합니다',
      },
    },
    {
      // 풀스크린 카메라 콕핏 — 앱 셸 공용 헤더를 숨긴다
      path: '/camera',
      name: 'camera',
      component: CameraPage,
      meta: { hideAppHeader: true },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginPage,
      meta: {
        guestOnly: true,
        appHeaderTitle: '로그인',
        appHeaderDescription: '다시 만나서 반가워요.',
      },
    },
    {
      path: '/signup',
      name: 'signup',
      component: SignupPage,
      meta: {
        guestOnly: true,
        appHeaderTitle: '회원가입',
        appHeaderDescription: '한 번에 입력하면 바로 시작해요.',
      },
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfilePage,
      meta: {
        requiresAuth: true,
        appHeaderTitle: '프로필',
        appHeaderDescription: '계정 정보를 관리해요.',
      },
    },
  ],
})

router.beforeEach(authGuard)

export default router
