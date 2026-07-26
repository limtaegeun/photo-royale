import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/shared/api/firebase'

/**
 * 공지 본문 길이 상한. firestore.rules의 `text.size() <= 100`과 **숫자까지 동일**해야 한다
 * (rules는 클라 코드를 import할 수 없어 이중 정의이고, notices.spec이 대조 검증한다.
 * 변경 시 rules도 함께 갱신·배포할 것).
 */
export const NOTICE_TEXT_MAX_LENGTH = 100

/** 호스트가 보낸 공지 한 건 — 서브컬렉션에 append만 되고 수정·삭제는 없다(히스토리) */
export interface Notice {
  /** Firestore 문서 ID */
  id: string
  text: string
  /** serverTimestamp가 반영되기 전 스냅샷은 null */
  createdAtMs: number | null
}

/**
 * 공지 전송 — rooms/{code}/notices에 append한다. 이력을 남기려고 문서를 덮어쓰지 않고
 * 매번 새 문서를 만든다(기록 탭이 이 컬렉션을 그대로 재료로 쓴다).
 */
export async function sendNotice(code: string, text: string): Promise<void> {
  await addDoc(collection(db, 'rooms', code, 'notices'), {
    text: text.trim(),
    createdAt: serverTimestamp(),
  })
}

/**
 * 최근 공지 1건 실시간 구독 — 운영 탭은 "마지막으로 무엇을 보냈는지"만 필요하다.
 * 전체 이력은 후속(기록 탭)에서 같은 컬렉션을 더 넓게 구독하면 된다.
 */
export function subscribeToLatestNotice(
  code: string,
  onChange: (notice: Notice | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const latestQuery = query(
    collection(db, 'rooms', code, 'notices'),
    orderBy('createdAt', 'desc'),
    limit(1),
  )
  return onSnapshot(
    latestQuery,
    (snapshot) => {
      const latest = snapshot.docs[0]
      if (latest === undefined) {
        onChange(null)
        return
      }
      const data = latest.data()
      onChange({
        id: latest.id,
        text: data.text as string,
        createdAtMs: (data.createdAt as Timestamp | null | undefined)?.toMillis() ?? null,
      })
    },
    onError,
  )
}
