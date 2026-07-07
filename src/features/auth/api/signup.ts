import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
import type { SignupInput, UserProfile } from '../types'

/**
 * 1단계 회원가입: 이메일/비번으로 Auth 계정 생성 → 닉네임을 displayName에 반영 →
 * 닉네임·성별을 Firestore users/{uid} 문서에 저장. 세 단계가 모두 성공해야 가입 완료로 본다.
 */
export async function signup(input: SignupInput): Promise<UserProfile> {
  const { user } = await createUserWithEmailAndPassword(auth, input.email, input.password)

  await updateProfile(user, { displayName: input.nickname })

  await setDoc(doc(db, 'users', user.uid), {
    email: input.email,
    nickname: input.nickname,
    gender: input.gender,
    createdAt: serverTimestamp(),
  })

  return {
    uid: user.uid,
    email: input.email,
    nickname: input.nickname,
    gender: input.gender,
  }
}
