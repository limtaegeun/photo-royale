import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/shared/api/firebase'
import type { Gender } from '../types'

/**
 * 내 프로필(users/{uid})의 성별 조회 — 대기실 참가 등록 시 참가자 문서에 실린다.
 * firestore.rules상 users 문서는 본인만 get 가능하므로 반드시 본인 uid로 호출한다.
 * 문서가 없거나 값이 비정상이면 null(호출부는 성별 없이 진행한다).
 */
export async function fetchMyGender(uid: string): Promise<Gender | null> {
  const snapshot = await getDoc(doc(db, 'users', uid))
  if (!snapshot.exists()) return null
  const gender = snapshot.data().gender
  return gender === 'male' || gender === 'female' ? gender : null
}
