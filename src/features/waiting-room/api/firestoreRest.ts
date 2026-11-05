import { auth, db } from '@/shared/api/firebase'

/**
 * Firestore REST 요청 — SDK로 할 수 없는 읽기에 쓴다. 웹 SDK에는 필드 선택이 없고, SDK의 읽기는 구독과 한
 * 연결을 나눠 써서 큰 문서가 공지·게임 종료 같은 작은 변경을 뒤에 세운다. 권한은 SDK와 같은 rules가 로그인
 * 토큰으로 판정한다.
 *
 * @param documentPath documents/ 아래 경로. 쿼리 문자열이나 :runQuery 같은 동작을 붙일 수 있다
 */
export async function fetchFirestoreRest(
  documentPath: string,
  init: RequestInit = {},
): Promise<Response> {
  const user = auth.currentUser
  if (user === null) throw new Error('Firestore REST 요청에는 로그인이 필요하다')
  const token = await user.getIdToken()
  const projectId = db.app.options.projectId
  return fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`,
    { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } },
  )
}
