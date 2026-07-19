import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * ?redirect= 값 검증 — 앱 내부 절대 경로만 허용한다.
 * 외부 URL('https://…')과 프로토콜 상대 경로('//evil.com')를 걸러 open redirect를 막는다.
 */
export function sanitizeRedirectPath(raw: unknown): string | null {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : null
}

/**
 * 인증 화면(login/signup)의 복귀 목적지 관리.
 * - ?redirect=: 가드가 보존한 원래 목적지(공유 대기실 URL 등 딥링크) — 인증 성공 시 그대로 복귀한다.
 * - ?code=: 공유 초대 코드 — redirect가 없으면 진입 화면이 자동 입장 판단을 이어간다.
 * 두 쿼리는 login↔signup 전환에도 유실되지 않도록 authQuery로 함께 들고 다닌다.
 */
export function useAuthRedirect() {
  const route = useRoute()
  const router = useRouter()

  const authQuery = computed(() => {
    const query: Record<string, string> = {}
    const code = route.query.code
    if (typeof code === 'string' && code !== '') query.code = code
    const redirect = sanitizeRedirectPath(route.query.redirect)
    if (redirect) query.redirect = redirect
    return Object.keys(query).length > 0 ? query : undefined
  })

  /** 인증 성공 후 복귀 — 뒤로가기로 인증 화면에 돌아오지 않도록 push가 아닌 replace를 쓴다 */
  function redirectAfterAuth() {
    const redirect = sanitizeRedirectPath(route.query.redirect)
    if (redirect) {
      router.replace(redirect)
      return
    }
    router.replace({ name: 'entry', query: authQuery.value })
  }

  return { authQuery, redirectAfterAuth }
}
