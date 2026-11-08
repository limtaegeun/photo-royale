import {
  collection,
  deleteField,
  doc,
  getCountFromServer,
  getDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/shared/api/firebase'
import { fetchFirestoreRest } from './firestoreRest'
import type { RoomStatus } from './rooms'

/**
 * 방 삭제(P09, docs/plans/p09-room-delete.md) — 진행자가 지난 방과 그 아래 쌓인 것을 전부 지운다.
 *
 * Firestore는 문서를 지워도 하위 컬렉션을 지우지 않고, 서버 함수(Spark 요금제라 없다)도 없어서
 * 하위 문서를 진행자 기기가 하나씩 지운다. 하위 문서가 남으면 킬샷 사진이 그대로 남고, 같은 코드로
 * 만든 새 방이 옛 참가자·킬샷·원장을 물려받는다.
 */

/**
 * 방 아래 하위 컬렉션 — 삭제가 지우는 대상의 단일 목록. 확인 모달은 이 중 사람이 알아볼 다섯 가지만 보인다
 * (킬샷 과열의 열 문서(P19)는 참가자마다 하나씩 생기는 내부 기록이라 세기만 하고 보이지 않는다).
 */
export const ROOM_CHILD_COLLECTIONS = [
  'participants',
  'submissions',
  'rounds',
  'notices',
  'assets',
  'killshotCooldowns',
] as const
export type RoomChildCollection = (typeof ROOM_CHILD_COLLECTIONS)[number]

/** Firestore writeBatch 한 번에 담을 수 있는 쓰기 상한 */
const DELETE_BATCH_LIMIT = 500

/** 확인 모달이 보여 줄 "지워질 것" — 방이 이미 없으면 요약 자체가 null이다 */
export interface RoomDeletionSummary {
  status: RoomStatus
  counts: Record<RoomChildCollection, number>
}

/**
 * 지워질 것의 개수 — 문서를 내려받지 않는 집계(getCountFromServer)로 센다. 킬샷 사진·지도는
 * 문서 하나가 수백 KB라 개수를 보려고 내려받으면 확인 모달이 그만큼 늦게 뜬다.
 */
export async function fetchRoomDeletionSummary(code: string): Promise<RoomDeletionSummary | null> {
  const roomSnapshot = await getDoc(doc(db, 'rooms', code))
  if (!roomSnapshot.exists()) return null
  const countEntries = await Promise.all(
    ROOM_CHILD_COLLECTIONS.map(async (name) => {
      const snapshot = await getCountFromServer(collection(db, 'rooms', code, name))
      return [name, snapshot.data().count] as const
    }),
  )
  return {
    status: roomSnapshot.data().status as RoomStatus,
    counts: Object.fromEntries(countEntries) as Record<RoomChildCollection, number>,
  }
}

/**
 * 하위 컬렉션의 문서 ID만 받는다 — 웹 SDK에는 필드 선택(projection)이 없어 getDocs로 읽으면
 * 킬샷 사진(문서당 최대 900,000자)·지도(1,000,000자)를 전부 내려받는다. Firestore REST runQuery는
 * `select: __name__`으로 이름만 돌려주므로 행사 한 번치 킬샷이 쌓인 방도 목록이 수 KB다.
 * 권한은 SDK와 같은 rules가 진행자 토큰으로 판정한다.
 */
async function listChildDocumentIds(code: string, name: RoomChildCollection): Promise<string[]> {
  const response = await fetchFirestoreRest(`rooms/${code}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: name }],
        select: { fields: [{ fieldPath: '__name__' }] },
      },
    }),
  })
  if (!response.ok) throw new Error(`${name} 목록을 읽지 못했다 (${response.status})`)
  // 결과가 없으면 문서 없이 readTime만 든 행 하나가 온다
  const rows = (await response.json()) as Array<{ document?: { name: string } }>
  // 문서 이름은 projects/…/documents/rooms/{코드}/{컬렉션}/{ID} — 마지막 조각이 ID다
  return rows.flatMap((row) => {
    const name = row.document?.name
    return name === undefined ? [] : [name.slice(name.lastIndexOf('/') + 1)]
  })
}

/** ID 목록을 상한 단위 배치로 나눠 지운다. lastWrite가 있으면 마지막 배치에 함께 싣는다 */
async function deleteInBatches(
  code: string,
  name: RoomChildCollection,
  ids: string[],
  lastWrite?: (batch: ReturnType<typeof writeBatch>) => void,
): Promise<void> {
  const chunkSize = lastWrite === undefined ? DELETE_BATCH_LIMIT : DELETE_BATCH_LIMIT - 1
  let start = 0
  do {
    const batch = writeBatch(db)
    const chunk = ids.slice(start, start + chunkSize)
    for (const id of chunk) batch.delete(doc(db, 'rooms', code, name, id))
    start += chunkSize
    const isLast = start >= ids.length
    if (isLast) lastWrite?.(batch)
    if (chunk.length > 0 || (isLast && lastWrite !== undefined)) await batch.commit()
  } while (start < ids.length)
}

/**
 * 방 삭제 — 세 단계다(docs/plans/p09-room-delete.md §2 결정 5).
 *
 * 1. 방을 닫는다 — 대기로 되돌리고 진행 중인 라운드를 지우며 삭제 표식(deleting)을 단다. 진행 중인
 *    방이면 게임 종료와 같은 전이라 참가자 화면이 대기실로 돌아온다. 표식이 달린 방에는 새 참가자가
 *    들어올 수 없고, 하위 문서 삭제 rules가 이 표식을 요구한다.
 * 2. 킬샷·라운드 원장·공지·지도·과열 기록을 지운다.
 * 3. 참가자와 방 문서를 한 배치로 지운다 — 방 문서가 마지막이어야 중간에 실패해도 진행자 목록에
 *    남아 다시 이어 지울 수 있다. 참가자만 먼저 사라지면 대기실 참가자가 "내보냈어요" 화면을 거치므로
 *    방 문서와 함께 지워 곧바로 "방을 찾을 수 없어요"로 보낸다.
 *
 * 다시 불러도 안전하다 — 닫기는 이미 닫힌 방에서 바뀌는 키가 없고, 지운 문서는 목록에 다시 나오지 않는다.
 */
export async function deleteRoom(code: string): Promise<void> {
  const roomRef = doc(db, 'rooms', code)
  await updateDoc(roomRef, { status: 'waiting', round: deleteField(), deleting: true })

  for (const name of ['submissions', 'rounds', 'notices', 'assets', 'killshotCooldowns'] as const) {
    await deleteInBatches(code, name, await listChildDocumentIds(code, name))
  }

  const participantIds = await listChildDocumentIds(code, 'participants')
  await deleteInBatches(code, 'participants', participantIds, (batch) => batch.delete(roomRef))
}
