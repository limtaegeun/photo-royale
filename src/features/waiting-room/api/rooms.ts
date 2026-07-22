import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/shared/api/firebase'
import type { Gender } from '@/features/auth'

export type RoomStatus = 'waiting' | 'playing'

export interface RoomInfo {
  hostUid: string
  status: RoomStatus
  /** 확정된 팀편성 차수(1차~3차). 0이면 아직 배정 전 — 배정 확정 시에만 1씩 증가한다 */
  assignmentRound: number
}

export interface Participant {
  /** Firestore 문서 ID = 참가자 uid */
  id: string
  name: string
  /** 배정된 완장 알파벳(그룹 색은 완장에서 파생). 입장 시점엔 미배정(null) */
  team: string | null
  /** 가입 시 확정된 성별 — 명단 표기용. 프로필 조회 실패 등으로 없을 수 있다(null) */
  gender: Gender | null
  /** X 모듈 — 이 팀이 특수 완장 X를 겸하는지(기존 팀 소속 유지 겸직) */
  isXTeam: boolean
  /** 연속 비혼성 배정 횟수 — 배정 확정 시에만 갱신된다(이월 우선권) */
  sameGenderStreak: number
  /** 이번 세션 누적 짝꿍 이력 — 재짝꿍 회피용, 확정 시에만 갱신 */
  previousPartnerIds: string[]
  isReady: boolean
}

/** 존재하지 않는 초대 코드로 입장을 시도한 경우. 호출부가 안내 문구로 매핑한다. */
export class RoomNotFoundError extends Error {
  constructor(code: string) {
    super(`room not found: ${code}`)
    this.name = 'RoomNotFoundError'
  }
}

/** 초대 코드 문자 집합 — 혼동하기 쉬운 문자(0/O, 1/I/L)를 뺀 대문자+숫자 */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 4
/** 코드 충돌 시 새 코드로 재시도하는 상한 — 31^4(≈92만) 공간이라 사실상 도달하지 않는다 */
const CREATE_ROOM_MAX_ATTEMPTS = 5

/**
 * 사용자가 입력한 초대 코드를 문서 ID와 같은 형태로 정규화한다.
 * 코드는 대문자로 생성되므로 소문자 입력도 같은 방을 가리켜야 한다.
 */
export function normalizeRoomCode(rawCode: string): string {
  return rawCode.trim().toUpperCase()
}

function generateRoomCode(): string {
  const randomValues = crypto.getRandomValues(new Uint32Array(ROOM_CODE_LENGTH))
  return Array.from(randomValues, (value) => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length])
    .join('')
}

/**
 * 방 생성 — rooms/{code} 문서를 만들고 초대 코드를 반환한다.
 * 코드가 곧 문서 ID라 유니크가 필요하므로, 트랜잭션으로 존재 검사와 생성을 원자적으로
 * 수행하고 충돌 시 새 코드로 재시도한다. 호스트도 대기실 진입 시 joinRoom으로 참가한다.
 */
export async function createRoom(hostUid: string): Promise<string> {
  for (let attempt = 0; attempt < CREATE_ROOM_MAX_ATTEMPTS; attempt++) {
    const code = generateRoomCode()
    const created = await runTransaction(db, async (transaction) => {
      const roomRef = doc(db, 'rooms', code)
      const existing = await transaction.get(roomRef)
      if (existing.exists()) return false

      transaction.set(roomRef, {
        hostUid,
        status: 'waiting',
        createdAt: serverTimestamp(),
      })
      return true
    })
    if (created) return code
  }
  throw new Error(`room code collision after ${CREATE_ROOM_MAX_ATTEMPTS} attempts`)
}

export interface RoomSummary {
  /** 초대 코드 = 방 문서 ID */
  code: string
  /** serverTimestamp 반영 전(방금 생성한 방)의 스냅샷은 null일 수 있다 */
  createdAt: Date | null
  status: string
}

/**
 * 내가 만든 방 목록 — 최신순. firestore.rules가 hostUid == 본인 조건의 쿼리만 list를
 * 허용하므로 이 where 절이 곧 권한 조건이다. where + orderBy 복합 인덱스를 요구하지
 * 않도록 정렬은 클라이언트에서 한다(내가 만든 방은 소수다).
 */
export async function fetchMyRooms(hostUid: string): Promise<RoomSummary[]> {
  const snapshot = await getDocs(
    query(collection(db, 'rooms'), where('hostUid', '==', hostUid)),
  )
  const rooms = snapshot.docs.map((roomDoc) => {
    const data = roomDoc.data()
    return {
      code: roomDoc.id,
      createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? null,
      status: data.status as string,
    }
  })
  // createdAt이 null(서버 타임스탬프 반영 전)이면 방금 만든 방이므로 맨 앞에 온다
  return rooms.sort(
    (a, b) =>
      (b.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
      (a.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER),
  )
}

/** 초대 코드 유효성 사전 검사 — 입장 화면이 이동 전에 빠른 피드백을 주는 용도 */
export async function roomExists(code: string): Promise<boolean> {
  const snapshot = await getDoc(doc(db, 'rooms', code))
  return snapshot.exists()
}

/**
 * 방 단건 조회 — 대기실 입장 시 호스트(진행자)와 게스트(플레이어)를 가르는 데 쓴다.
 * 방이 없으면 null.
 */
export async function getRoom(code: string): Promise<RoomInfo | null> {
  const snapshot = await getDoc(doc(db, 'rooms', code))
  if (!snapshot.exists()) return null
  const data = snapshot.data()
  return {
    hostUid: data.hostUid as string,
    status: data.status as RoomStatus,
    assignmentRound: (data.assignmentRound as number | undefined) ?? 0,
  }
}

/**
 * 대기실 참가 — rooms/{code}/participants/{uid} 문서를 만든다.
 * 새로고침·재입장 시 기존 문서(레디 상태 포함)를 보존해야 하므로 멱등이다.
 * 방이 없으면 RoomNotFoundError를 던진다.
 */
export async function joinRoom(
  code: string,
  member: { uid: string; nickname: string; gender: Gender | null },
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(doc(db, 'rooms', code))
    if (!roomSnapshot.exists()) throw new RoomNotFoundError(code)

    const participantRef = doc(db, 'rooms', code, 'participants', member.uid)
    const participantSnapshot = await transaction.get(participantRef)
    if (participantSnapshot.exists()) return

    transaction.set(participantRef, {
      nickname: member.nickname,
      // 성별을 모르는 경우(프로필 조회 실패) 필드 자체를 생략한다 — rules도 optional로 검증
      ...(member.gender === null ? {} : { gender: member.gender }),
      isReady: false,
      joinedAt: serverTimestamp(),
    })
  })
}

/**
 * 방 문서 실시간 구독 — 호스트 판별(hostUid)과 게임 시작(status 전이)을 화면이
 * 실시간으로 반영하게 한다. 문서가 사라지면 null을 전달한다.
 */
export function subscribeToRoom(
  code: string,
  onChange: (room: RoomInfo | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'rooms', code), (snapshot) => {
    if (!snapshot.exists()) {
      onChange(null)
      return
    }
    const data = snapshot.data()
    onChange({
      hostUid: data.hostUid as string,
      status: data.status as RoomStatus,
      assignmentRound: (data.assignmentRound as number | undefined) ?? 0,
    })
  })
}

/**
 * 게임 시작 — 방 status를 playing으로 전이한다. firestore.rules가 호스트 본인의
 * waiting → playing 전이만 허용하므로, 호스트 여부 검증은 서버가 담당한다.
 * 각 참가자 화면 전환은 subscribeToRoom 스냅샷이 트리거한다.
 * (UI 연결은 팀 배정 플로우 확정 후 — 현재 호스트 CTA는 배정 시작까지만 노출한다)
 */
export async function startGame(code: string): Promise<void> {
  await updateDoc(doc(db, 'rooms', code), { status: 'playing' })
}

/** 참가자 명단 실시간 구독 — 입장 순서(joinedAt)로 정렬해 전달한다 */
export function subscribeToParticipants(
  code: string,
  onChange: (participants: Participant[]) => void,
): Unsubscribe {
  const participantsQuery = query(
    collection(db, 'rooms', code, 'participants'),
    orderBy('joinedAt', 'asc'),
  )
  return onSnapshot(participantsQuery, (snapshot) => {
    onChange(
      snapshot.docs.map((participantDoc) => {
        const data = participantDoc.data()
        return {
          id: participantDoc.id,
          name: data.nickname as string,
          team: (data.team as string | undefined) ?? null,
          gender: (data.gender as Gender | undefined) ?? null,
          isXTeam: (data.isXTeam as boolean | undefined) ?? false,
          sameGenderStreak: (data.sameGenderStreak as number | undefined) ?? 0,
          previousPartnerIds: (data.previousPartnerIds as string[] | undefined) ?? [],
          isReady: data.isReady as boolean,
        }
      }),
    )
  })
}

/** 내 참가자 문서의 레디 확정 — 스냅샷 구독이 화면 상태를 갱신한다 */
export async function setReady(code: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'rooms', code, 'participants', uid), { isReady: true })
}
