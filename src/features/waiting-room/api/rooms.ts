import {
  collection,
  deleteField,
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
// 게임 모드는 game-mode 기능의 소유물이라 public API로만 가져온다(내부 파일 직접 import 금지)
import { DEFAULT_GAME_MODE, isGameModeId, type GameModeId } from '@/features/game-mode'

export type RoomStatus = 'waiting' | 'playing'

/**
 * 진행 중인 라운드 타이머의 서버 정본(rooms/{code}.round). 호스트 기기가 아니라 방 문서가
 * 정본이라 새로고침·기기 교체에도 복원되고, 향후 게스트 화면도 같은 데이터를 구독하면 된다.
 *
 * 남은 시간은 저장하지 않고 **앵커(startedAt) + 총량(durationMs)** 으로 표현한다:
 * 남은 ms = durationMs - (now - startedAt). 앵커가 서버 시각이라 호스트 기기의 시계 오차가
 * 참가자에게 전파되지 않는다(각 뷰어 본인 시계 오차만 남는 것은 알려진 한계).
 */
export interface RoundState {
  /** running: 카운트다운 중 / paused: 올스탑. 필드(round) 자체가 없으면 라운드 시작 전이다 */
  status: 'running' | 'paused'
  /** running 구간의 시작 시각(ms). serverTimestamp가 서버에 반영되기 전 스냅샷은 null */
  startedAtMs: number | null
  /** running 구간의 총량(ms) — 시작·재개·시간 반영 때마다 남은 시간으로 다시 앵커된다 */
  durationMs: number
  /** paused일 때만 존재하는 정지 순간의 남은 ms. running이면 null */
  pausedRemainingMs: number | null
}

export interface RoomInfo {
  hostUid: string
  status: RoomStatus
  /** 확정된 팀편성 차수(1차~3차). 0이면 아직 배정 전 — 배정 확정 시에만 1씩 증가한다 */
  assignmentRound: number
  /** 확정된 이번 라운드 게임 모드. 필드가 없으면(기존 방·배정 전) 일반전(normal) */
  gameMode: GameModeId
  /** 진행 중인 라운드 타이머. 필드가 없으면(라운드 시작 전) null */
  round: RoundState | null
}

export interface Participant {
  /** Firestore 문서 ID = 참가자 uid */
  id: string
  name: string
  /** 배정된 완장 알파벳(그룹 색은 완장에서 파생). 입장 시점엔 미배정(null) */
  team: string | null
  /**
   * 이 완장이 확정된 팀편성 차수. 0이면 한 번도 배정된 적 없다.
   *
   * team만으로는 "이번 라운드에 배정됐는가"를 알 수 없다 — 확정 배치는 멤버가 있는 팀만
   * 쓰므로, 직전 라운드에 배정됐다가 이번 라운드에 미배정 대기자로 내려간 참가자의 team은
   * 지워지지 않고 그대로 남는다(그리고 rules가 team을 null로 되돌리는 것을 허용하지 않는다).
   * 그래서 "확정된 차수"를 양수 마커로 함께 저장하고, 화면은 room.assignmentRound와
   * 같은지로 이번 라운드 배정 여부를 판정한다(isAssignedInRound).
   */
  assignedRound: number
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

/**
 * 이번 라운드(room.assignmentRound)에 실제로 배정된 참가자인지 판정한다 — 완장 표시·배정 카드
 * 노출의 단일 기준. team이 남아 있어도 확정 차수가 다르면 이번 라운드엔 미배정이다: 확정 배치는
 * 멤버가 있는 팀만 쓰므로, 직전 라운드에 배정됐다가 이번에 미배정 대기자로 내려간 참가자의 team은
 * 문서에 그대로 남는다(rules가 team을 null로 되돌리는 것도 허용하지 않는다). 배정 전(0차)에는
 * 어떤 참가자도 배정 상태가 아니다.
 */
export function isAssignedInRound(participant: Participant, assignmentRound: number): boolean {
  return (
    assignmentRound > 0 &&
    participant.team !== null &&
    participant.assignedRound === assignmentRound
  )
}

/**
 * 방 문서의 round 맵 → RoundState. 필드가 없거나 status가 알 수 없는 값이면 "라운드 시작 전"
 * (null)으로 수렴시킨다 — 화면은 시작 전과 손상된 값을 같게 다루면 되고, 호스트는 '라운드 시작'
 * 으로 언제든 정상 상태를 다시 쓸 수 있다.
 */
function toRoundState(raw: unknown): RoundState | null {
  if (raw === null || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  if (data.status !== 'running' && data.status !== 'paused') return null
  const startedAt = data.startedAt as Timestamp | null | undefined
  return {
    status: data.status,
    // serverTimestamp는 로컬 스냅샷에 즉시 반영되지 않는다(쓰기 직후 한 틱은 null)
    startedAtMs: startedAt?.toMillis() ?? null,
    durationMs: (data.durationMs as number | undefined) ?? 0,
    pausedRemainingMs: (data.pausedRemainingMs as number | undefined) ?? null,
  }
}

/** 방 문서 데이터 → RoomInfo. 단건 조회와 실시간 구독이 같은 매핑을 쓰도록 한 곳에 둔다 */
function toRoomInfo(data: Record<string, unknown>): RoomInfo {
  const gameMode = data.gameMode
  return {
    hostUid: data.hostUid as string,
    status: data.status as RoomStatus,
    assignmentRound: (data.assignmentRound as number | undefined) ?? 0,
    gameMode:
      typeof gameMode === 'string' && isGameModeId(gameMode) ? gameMode : DEFAULT_GAME_MODE,
    round: toRoundState(data.round ?? null),
  }
}

/** 존재하지 않는 초대 코드로 입장을 시도한 경우. 호출부가 안내 문구로 매핑한다. */
export class RoomNotFoundError extends Error {
  constructor(code: string) {
    super(`room not found: ${code}`)
    this.name = 'RoomNotFoundError'
  }
}

/**
 * 초대 코드 형식의 단일 소스 — firestore.rules의 roomCode.matches 패턴과 **문자열까지 동일**해야
 * 한다(rules는 클라 코드를 import할 수 없어 이중 정의이고, rooms.spec이 문자열 대조로 검증한다.
 * 변경 시 rules도 함께 갱신·배포할 것). 문자 집합은 혼동하기 쉬운 문자(0/O, 1/I/L)를 뺀
 * 대문자+숫자이고, 생성용 문자 목록·코드 길이는 아래에서 이 패턴으로부터 파생한다.
 */
export const ROOM_CODE_PATTERN = '^[A-HJKMNP-Z2-9]{4}$'

/** 패턴의 `[...]` 문자 클래스를 개별 문자로 전개한다 — 코드 생성이 인덱스로 뽑을 문자 목록 */
function expandPatternAlphabet(pattern: string): string {
  const charClass = pattern.match(/\[([^\]]+)\]/)![1]!
  const chars: string[] = []
  for (let i = 0; i < charClass.length; i++) {
    if (charClass[i + 1] === '-' && i + 2 < charClass.length) {
      for (let code = charClass.charCodeAt(i); code <= charClass.charCodeAt(i + 2); code++) {
        chars.push(String.fromCharCode(code))
      }
      i += 2
    } else {
      chars.push(charClass[i]!)
    }
  }
  return chars.join('')
}

/** 생성용 문자 집합(A~H,J,K,M,N,P~Z,2~9 = 31자) — ROOM_CODE_PATTERN에서 파생 */
const ROOM_CODE_ALPHABET = expandPatternAlphabet(ROOM_CODE_PATTERN)
export const ROOM_CODE_LENGTH = Number(ROOM_CODE_PATTERN.match(/\{(\d+)\}/)![1])
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
  return toRoomInfo(snapshot.data())
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
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'rooms', code),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange(null)
        return
      }
      onChange(toRoomInfo(snapshot.data()))
    },
    onError,
  )
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

/**
 * 게임 종료 — playing을 waiting으로 되돌리고 진행 중인 라운드를 지운다(호스트 전용).
 * 두 필드를 한 번에 써야 한다: 나눠 쓰면 "대기 중인데 라운드가 살아 있는" 중간 상태가
 * 참가자 화면에 잠깐 보이고, firestore.rules도 두 키를 함께 바꾸는 갈래만 허용한다.
 *
 * 배정 이력(assignmentRound·완장·짝꿍)은 그대로 둔다 — 대기실로 돌아가 다음 차수를 배정하면
 * 그 시점에 레디가 리셋되므로, 종료가 라운드 루프를 끊지 않고 한 바퀴를 닫아 준다.
 */
export async function endGame(code: string): Promise<void> {
  await updateDoc(doc(db, 'rooms', code), { status: 'waiting', round: deleteField() })
}

/** 참가자 명단 실시간 구독 — 입장 순서(joinedAt)로 정렬해 전달한다 */
export function subscribeToParticipants(
  code: string,
  onChange: (participants: Participant[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const participantsQuery = query(
    collection(db, 'rooms', code, 'participants'),
    orderBy('joinedAt', 'asc'),
  )
  return onSnapshot(
    participantsQuery,
    (snapshot) => {
      onChange(
        snapshot.docs.map((participantDoc) => {
          const data = participantDoc.data()
          return {
            id: participantDoc.id,
            name: data.nickname as string,
            team: (data.team as string | undefined) ?? null,
            assignedRound: (data.assignedRound as number | undefined) ?? 0,
            gender: (data.gender as Gender | undefined) ?? null,
            isXTeam: (data.isXTeam as boolean | undefined) ?? false,
            sameGenderStreak: (data.sameGenderStreak as number | undefined) ?? 0,
            previousPartnerIds: (data.previousPartnerIds as string[] | undefined) ?? [],
            isReady: data.isReady as boolean,
          }
        }),
      )
    },
    onError,
  )
}

/** 내 참가자 문서의 레디 확정 — 스냅샷 구독이 화면 상태를 갱신한다 */
export async function setReady(code: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'rooms', code, 'participants', uid), { isReady: true })
}
