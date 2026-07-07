/** 성별 — 1단계 가입 폼에서 남/여만 받는다 */
export type Gender = 'male' | 'female'

/** 회원가입 단일 폼이 제출하는 입력값 */
export interface SignupInput {
  email: string
  password: string
  nickname: string
  gender: Gender
}

/** 가입 성공 후 앱이 쓰는 프로필 (Firestore users 문서 + Auth 조합) */
export interface UserProfile {
  uid: string
  email: string
  nickname: string
  gender: Gender
}
