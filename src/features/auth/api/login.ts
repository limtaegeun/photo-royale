import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from './firebase'
import type { LoginInput } from '../types'

/**
 * 이메일/비밀번호 로그인. 성공하면 Firebase가 세션을 만들고 onAuthStateChanged가
 * useAuthStore를 갱신하므로, 호출부는 화면 전환만 담당하면 된다.
 */
export async function login(input: LoginInput): Promise<void> {
  await signInWithEmailAndPassword(auth, input.email, input.password)
}
