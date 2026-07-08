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

  try {
    await updateProfile(user, { displayName: input.nickname })

    await setDoc(doc(db, 'users', user.uid), {
      email: input.email,
      nickname: input.nickname,
      gender: input.gender,
      createdAt: serverTimestamp(),
    })
  } catch (error) {
    // 계정 생성 이후 단계가 실패하면 프로필 없는 orphan 계정이 남아, 같은 이메일 재시도가
    // email-already-in-use로 영구 차단된다. 방금 만든 계정을 되돌려 재시도를 열어준다.
    // (삭제 자체가 실패해도 원래 에러를 던져 호출부가 실패로 처리하게 한다.)
    await user.delete().catch(() => {})
    throw error
  }

  return {
    uid: user.uid,
    email: input.email,
    nickname: input.nickname,
    gender: input.gender,
  }
}
