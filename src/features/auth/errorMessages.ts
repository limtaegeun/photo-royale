import { FirebaseError } from 'firebase/app'

/** 네트워크 문제 안내 — Auth(auth/network-request-failed)와 Firestore(unavailable)가 공유한다 */
export const NETWORK_ERROR_MESSAGE = '네트워크 연결을 확인하고 다시 시도해주세요.'

/** 회원가입·로그인이 함께 겪는 Firebase 에러 — 각 플로우의 메시지 맵이 spread로 포함한다 */
export const COMMON_AUTH_ERROR_MESSAGE: Record<string, string> = {
  'auth/network-request-failed': NETWORK_ERROR_MESSAGE,
  'auth/too-many-requests': '잠시 후 다시 시도해주세요.',
}

/** Firebase 에러 코드를 맵에서 찾아 사용자용 한글 메시지로 바꾼다. 없는 코드는 fallback. */
export function toAuthErrorMessage(
  error: unknown,
  messages: Record<string, string>,
  fallback: string,
): string {
  if (error instanceof FirebaseError) {
    return messages[error.code] ?? fallback
  }
  return fallback
}
