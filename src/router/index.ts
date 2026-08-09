import { createRouter, createWebHistory } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { CameraPage } from '@/features/camera'
import { EntryPage } from '@/features/entry'
import { RoundOpsPage } from '@/features/round-ops'
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
    /** AppHeader 좌측 이탈 링크의 목적지 — 지정한 화면에만 뒤로가기 수단이 생긴다 */
    appHeaderBackTo?: RouteLocationRaw
    /** AppHeader 좌측 이탈 링크의 접근성 라벨 */
    appHeaderBackLabel?: string
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
      // 호스트(진행자)의 게임 진행 화면 — 게스트가 가는 카메라 콕핏과 갈라지는 지점이다.
      // 방 코드를 경로에 두어 새로고침·딥링크에도 같은 방의 운영을 이어간다
      path: '/round-ops/:roomCode',
      name: 'round-ops',
      component: RoundOpsPage,
      meta: {
        requiresAuth: true,
        appHeaderTitle: '라운드 운영',
        appHeaderDescription: '올스탑과 시간을 즉시 제어합니다',
      },
    },
    {
      // 풀스크린 카메라 콕핏 — 앱 셸 공용 헤더를 숨긴다.
      // 방 코드를 경로에 두어 새로고침·딥링크에도 어느 방의 콕핏인지 유지한다(대기실·운영과 같은 규칙).
      // 콕핏이 라운드 타이머·공지를 수신하려면 방 코드가 필요하므로 화면보다 경로가 먼저 준비된다.
      path: '/camera/:roomCode',
      name: 'camera',
      component: CameraPage,
      // 콕핏이 방 문서를 구독하므로(게임 종료 시 스스로 나가기 위해) 인증이 전제다
      meta: { hideAppHeader: true, requiresAuth: true },
    },
    {
      // 방 코드 없는 구 경로 — 매칭되는 라우트가 없어 빈 화면이 되는 대신 입장 화면으로 돌려보낸다
      path: '/camera',
      redirect: { name: 'entry' },
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
        // 헤더 아이콘으로만 들어오는 잎 화면 — 되돌아갈 링크가 없으면 브라우저 뒤로가기 외에
        // 이탈 수단이 없다. 진입 경로가 화면마다 달라 히스토리 대신 랜딩으로 고정한다
        appHeaderBackTo: { name: 'entry' },
        appHeaderBackLabel: '홈으로',
      },
    },
  ],
})

router.beforeEach(authGuard)

export default router
