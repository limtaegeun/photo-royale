import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
import type { SignupInput, UserProfile } from '../types'

/**
 * 사전 검사를 통과했지만 트랜잭션 시점에 닉네임이 이미 예약된 경우(동시 가입 레이스).
 * useSignup이 이 에러를 닉네임 필드 에러로 매핑한다.
 */
export class NicknameTakenError extends Error {
  constructor() {
    super('nickname already taken')
    this.name = 'NicknameTakenError'
  }
}

/**
 * 닉네임 유니크 비교용 키. 화면에 같아 보이는 값이 서로 다른 키가 되지 않도록
 * trim → 유니코드 NFC 정규화(macOS 한글 NFD 입력 대응) → 소문자화한다.
 * firestore.rules가 users.nicknameKey와 이 키의 일치를 강제하므로, 정규화 규칙을
 * 바꾸면 rules와 기존 nicknames 문서도 함께 손봐야 한다.
 */
export function toNicknameKey(nickname: string): string {
  return nickname.trim().normalize('NFC').toLowerCase()
}

/**
 * 닉네임 가용성 사전 검사. nicknames/{key} 인덱스 문서 단건 get이라 미인증 상태에서
 * 호출해도 노출되는 정보가 uid뿐이다(users 컬렉션을 공개로 열 필요가 없다).
 * UX용 빠른 피드백이 목적이고, 실제 유니크 보장은 signup()의 트랜잭션 +
 * firestore.rules가 담당한다.
 */
export async function isNicknameTaken(nickname: string): Promise<boolean> {
  const snapshot = await getDoc(doc(db, 'nicknames', toNicknameKey(nickname)))
  return snapshot.exists()
}

/**
 * 1단계 회원가입: 이메일/비번으로 Auth 계정 생성 → 닉네임을 displayName에 반영 →
 * 트랜잭션으로 nicknames/{key} 예약과 users/{uid} 문서 생성을 원자적으로 수행한다.
 * 키가 이미 예약돼 있으면 NicknameTakenError를 던진다(사전 검사 이후의 레이스).
 * firestore.rules가 두 문서의 상호 참조(getAfter)를 검사하므로 반드시 같은
 * 트랜잭션에서 함께 써야 한다.
 */
export async function signup(input: SignupInput): Promise<UserProfile> {
  const { user } = await createUserWithEmailAndPassword(auth, input.email, input.password)

  try {
    await updateProfile(user, { displayName: input.nickname })

    const nicknameKey = toNicknameKey(input.nickname)
    await runTransaction(db, async (transaction) => {
      const nicknameRef = doc(db, 'nicknames', nicknameKey)
      const reservation = await transaction.get(nicknameRef)
      if (reservation.exists()) throw new NicknameTakenError()

      transaction.set(nicknameRef, { uid: user.uid })
      transaction.set(doc(db, 'users', user.uid), {
        email: input.email,
        nickname: input.nickname,
        nicknameKey,
        gender: input.gender,
        createdAt: serverTimestamp(),
      })
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
