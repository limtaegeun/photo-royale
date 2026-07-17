import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

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
export const db = getFirestore(firebaseApp)
