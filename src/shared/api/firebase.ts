import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'

/**
 * Firebase 클라이언트 초기화 — auth와 waiting-room 등 여러 기능이 공유하는 단일 인스턴스.
 * (auth 기능 내부에 있다가 두 번째 기능이 import하는 시점에 shared로 승격했다)
 *
 * Firebase 웹 config는 빌드 시 노출되는 공개 식별자이므로 시크릿은 아니지만,
 * 프로젝트 전환(dev/prod)을 위해 env(VITE_ 접두사)로 주입한다. 실제 값은
 * .env.local 에 채운다(.env.example 참조). 값이 비면 런타임에서 인증이 실패한다.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
/**
 * 실시간 전송은 long polling으로 고정한다. 기본값(스트리밍)에서는 Safari(iOS 포함)가 서버가 이미 보낸 응답을
 * 다음 바이트가 올 때까지 페이지에 넘기지 않아, 읽기와 스냅샷이 다음 서버 신호(약 30초 간격)까지 멈췄다.
 * 2026-11-05 4인 현장 시험에서 일부 폰만 대기실 입장이 오래 걸리고 공지와 게임 종료가 늦게 반영된 원인이다.
 * SDK의 자동 감지는 첫 응답만 보고 '문제없음'으로 판정해서 이 경우를 잡지 못한다.
 * Safari와 다른 브라우저를 나누지 않는다. iOS의 인앱 브라우저와 크롬도 같은 엔진이라 UA로 가리기 어렵고,
 * long polling의 지연은 재 보니 스트리밍과 차이가 없었다(docs/plans/p16-realtime-sync.md).
 */
export const db = initializeFirestore(firebaseApp, { experimentalForceLongPolling: true })
