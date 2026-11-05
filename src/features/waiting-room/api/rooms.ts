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
  writeBatch,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/shared/api/firebase'
import { createRoundAnchorObserver } from '../serverClock'
import type { Gender } from '@/features/auth'
// 게임 모드는 game-mode 기능의 소유물이라 public API로만 가져온다(내부 파일 직접 import 금지)
import { DEFAULT_GAME_MODE, isGameModeId, type GameModeId } from '@/features/game-mode'
import {
  addRoundResultToBatch,
  addSnapshotRemovalToBatch,
  type RoundSettlement,
} from '@/features/round-ledger'

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
  /**
   * 확정된 팀편성 차수. 0이면 아직 배정 전 — 배정 확정 시에만 바뀐다. 다음 차수 배정은 1씩
   * 올리고, 게임을 시작하지 않은 차수를 다시 짜는 확정(P10)은 그대로 둔다.
   */
  assignmentRound: number
  /**
   * 마지막으로 게임을 시작한 차수(P10). 0이면 시작한 적 없다. 게임 시작이 그때의 assignmentRound를
   * 같이 쓴다 — 이 값이 지금 차수와 같으면 그 차수는 이미 뛰었으니 다시 짤 수 없고 다음 차수를
   * 배정해야 한다. 필드를 모르는 옛 앱이 시작한 차수는 기록이 없다.
   */
  playedRound: number
  /** 확정된 이번 라운드 게임 모드. 필드가 없으면(기존 방·배정 전) 일반전(normal) */
  gameMode: GameModeId
  /**
   * 차수 → 확정 모드 이력. 키는 팀편성 차수 문자열(Firestore 맵 키는 문자열만 된다).
   * gameMode는 확정마다 덮어써지므로 이 맵만이 과거 라운드가 무슨 모드였는지 알려 준다.
   * 이력을 남기기 전에 확정된 기존 방은 필드가 없어 빈 객체다.
   */
  roundModes: Record<string, GameModeId>
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
   * 이 완장이 확정된 팀편성 차수. 0이면 배정된 적 없거나, 게임 전 같은 차수 재배정에서 빠져
   * 배정이 풀렸다(P10 — 그때는 team도 함께 지워진다).
   *
   * team만으로는 "이번 라운드에 배정됐는가"를 알 수 없다 — 확정 배치는 멤버가 있는 팀만
   * 쓰므로, 직전 라운드에 배정됐다가 이번 라운드에 미배정 대기자로 내려간 참가자의 team은
   * 지워지지 않고 그대로 남는다(다음 차수 확정은 미배정자 문서를 쓰지 않는다).
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
  /**
   * assignedRound 차수를 확정하기 직전의 이월값(P10). 게임 전에 같은 차수를 다시 짤 때 이 값에서
   * 다시 계산해야 뛰지도 않은 편성이 짝꿍 이력·연속 비혼성 횟수에 쌓이지 않는다. 필드를 모르는
   * 옛 앱이 확정했거나 배정된 적 없으면 null이다.
   */
  carryoverBase: CarryoverBase | null
  /**
   * 배정 확정이 이 문서를 한 번이라도 썼는가 — 배정과 배정 풀기(P10) 모두 sameGenderStreak를 쓰고
   * 지우지 않으며, 입장 문서에는 이 키가 없다. 보드에 오르려면 전원 준비(안전 수칙 동의)를 거치거나
   * 이미 보드에 오른 적이 있어야 하므로, true면 안전 수칙에 동의한 적이 있는 사람이다.
   */
  hasBeenAssigned: boolean
  isReady: boolean
}

/** 배정 확정 직전의 이월값 — Participant.carryoverBase 참조 */
export interface CarryoverBase {
  sameGenderStreak: number
  previousPartnerIds: string[]
}

/**
 * 이번 라운드(room.assignmentRound)에 실제로 배정된 참가자인지 판정한다 — 완장 표시·배정 카드
 * 노출의 단일 기준. team이 남아 있어도 확정 차수가 다르면 이번 라운드엔 미배정이다: 확정 배치는
 * 멤버가 있는 팀만 쓰므로, 직전 라운드에 배정됐다가 이번에 미배정 대기자로 내려간 참가자의 team은
 * 문서에 그대로 남는다(다음 차수 확정은 미배정자 문서를 쓰지 않는다). 배정 전(0차)에는
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

/**
 * 방 문서의 roundModes 맵 → 차수 문자열 → 모드 레코드. 필드가 없던 기존 방은 빈 객체이고,
 * 값이 유효한 모드 id가 아닌 엔트리는 **그 엔트리만** 버린다 — 한 차수가 오염돼도 나머지 라운드
 * 이력은 계속 읽혀야 하기 때문이다(gameMode 단건은 기본값으로 수렴시키지만, 이력은 대체할
 * 기본값이 없으므로 "모르는 차수"로 두고 라벨을 생략하는 쪽이 안전하다).
 */
function toRoundModes(raw: unknown): Record<string, GameModeId> {
  if (raw === null || typeof raw !== 'object') return {}
  const roundModes: Record<string, GameModeId> = {}
  for (const [round, mode] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof mode === 'string' && isGameModeId(mode)) roundModes[round] = mode
  }
  return roundModes
}

/** 방 문서 데이터 → RoomInfo. 단건 조회와 실시간 구독이 같은 매핑을 쓰도록 한 곳에 둔다 */
function toRoomInfo(data: Record<string, unknown>): RoomInfo {
  const gameMode = data.gameMode
  return {
    hostUid: data.hostUid as string,
    status: data.status as RoomStatus,
    assignmentRound: (data.assignmentRound as number | undefined) ?? 0,
    playedRound: (data.playedRound as number | undefined) ?? 0,
    gameMode:
      typeof gameMode === 'string' && isGameModeId(gameMode) ? gameMode : DEFAULT_GAME_MODE,
    roundModes: toRoundModes(data.roundModes ?? null),
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
 * 코드는 대문자로 생성되므로 소문자 입력도 같은 방을 가리켜야 한다. 가운데 공백(`QG E5`)과
 * 한글 자판의 전각 문자(`ＱＧＥ５`)도 같은 방을 가리키게 NFKC 로 반각으로 바꾸고 공백을 모두 뺀다
 * (11/01 QA 탐색 EX-04 — 앞뒤 공백·소문자만 정리해 '방을 찾을 수 없어요'로 끝났다).
 */
export function normalizeRoomCode(rawCode: string): string {
  return rawCode.normalize('NFKC').replace(/\s+/g, '').toUpperCase()
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
 * 실시간으로 반영하게 한다. 서버가 확인한 문서 부재면 null을 전달한다.
 */
export function subscribeToRoom(
  code: string,
  onChange: (room: RoomInfo | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  // 방 문서를 구독하는 모든 화면이 이 경로를 지난다 — 서버 시각 보정을 여기서 한 번만 채운다.
  // 관측자는 구독마다 새로 만든다: '첫 스냅샷은 샘플이 아니다'가 구독 단위 판정이라, 방을
  // 갈아탄 새 구독이 이전 이력을 이어 쓰면 진행 중이던 라운드의 과거 앵커를 샘플로 잡는다
  const observeRoundAnchor = createRoundAnchorObserver()
  /** 마지막으로 전달한 방 — 메타데이터만 바뀐 스냅샷을 걸러 화면이 받는 횟수를 그대로 둔다 */
  let lastRoomJson: string | null = null
  return onSnapshot(
    doc(db, 'rooms', code),
    // 캐시의 '문서 없음'을 무시하므로, 나중에 서버가 같은 '없음'을 확인해 줄 때도 스냅샷을 받아야 한다.
    // 이 옵션이 없으면 데이터가 같은 그 확인은 오지 않아, 정말 지워진 방을 영영 모른다.
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!snapshot.exists()) {
        // 첫 응답 전에 연결이 끊기면 SDK는 빈 캐시를 '문서 없음'으로 알린다. 이것을 방 삭제로 읽으면 신호가
        // 약할 때 콕핏을 새로고침한 참가자가 '방을 찾을 수 없어요'로 첫 화면에 쫓겨나 돌아오지 못한다.
        // 서버가 확인한 부재만 방이 사라진 것으로 전달한다.
        if (snapshot.metadata.fromCache) return
        lastRoomJson = null
        onChange(null)
        return
      }
      const room = toRoomInfo(snapshot.data())
      const roomJson = JSON.stringify(room)
      if (roomJson === lastRoomJson) return
      lastRoomJson = roomJson
      observeRoundAnchor(room.round?.startedAtMs ?? null, snapshot.metadata.fromCache)
      onChange(room)
    },
    onError,
  )
}

/** 라운드 기본 길이(20분) — 게임 시작이 거는 카운트다운의 총량. 운영 화면의 시작 전 미리보기도 이 값이다 */
export const ROUND_DURATION_DEFAULT_MS = 20 * 60 * 1000

/**
 * 게임 시작 — 방을 playing으로 전이하고 **같은 순간 라운드 타이머(기본 20분)도 건다.**
 * 진행자가 대기실 '게임 시작'과 운영 화면 '라운드 시작'을 연달아 눌러야 하던 것을 한 번으로 합쳤다.
 * 시작 전 인원 확인·공지는 대기실에서 끝난다 — 게임 시작은 전원이 준비를 마쳐야 눌린다.
 * 호스트 여부 검증은 firestore.rules가 하고, 각 참가자 화면 전환은 subscribeToRoom 스냅샷이 한다.
 *
 * 이 차수로 게임을 시작했다는 기록(playedRound)을 status와 같이 쓴다(P10) — 대기실이 이 기록으로 '팀 다시
 * 배정'(같은 차수)과 '다음 차수 배정'을 가르고, rules도 같은 기록으로 뛴 차수의 재배정을 막는다.
 *
 * 한 문서를 **두 번 나눠 쓴다.** rules의 게임 시작 갈래(①)는 status·playedRound만, 라운드 갈래(③)는
 * 방이 playing일 때 round만 허용하므로, rules를 바꾸지 않고 두 갈래를 차례로 탄다(배포 순서가 자유롭다).
 * 첫 쓰기의 서버 응답을 기다리지 않고 연달아 내보내는 이유:
 * - SDK는 한 클라이언트의 쓰기를 보낸 순서대로 서버에 적용한다 — 라운드 쓰기가 심사받을 때 방은
 *   이미 playing이다. 게임 시작이 거부되면 라운드 쓰기도(방이 아직 waiting이라) 함께 거부된다.
 * - 로컬 스냅샷에는 두 쓰기가 한꺼번에 반영된다 — 응답을 기다렸다 이으면 진행자는 그 사이 운영
 *   화면에서 '시작 전' 상태와 '라운드 시작' 버튼을 잠깐 본다.
 *
 * 라운드 쓰기만 실패하면 방은 '게임은 시작했는데 라운드는 시작 전'으로 남는다. 그 상태의 운영
 * 화면에는 '라운드 시작' 버튼이 그대로 있어 진행자가 다시 걸 수 있다(게스트는 그동안 대기실에 머문다).
 *
 * @param round 지금 확정된 팀편성 차수(room.assignmentRound) — rules가 같은 값인지 대조한다
 */
export async function startGame(code: string, round: number): Promise<void> {
  await Promise.all([
    updateDoc(doc(db, 'rooms', code), { status: 'playing', playedRound: round }),
    startRound(code),
  ])
}

/**
 * 라운드 시작 — 기본 20분 카운트다운을 건다(rules ③ 갈래: 방이 playing일 때 round만).
 * 게임 시작이 함께 부르고, 그 쓰기만 실패했을 때 운영 화면의 '라운드 시작'이 다시 부른다.
 *
 * 쓰는 모양은 round-ops writeRound(정지·재개·시간 반영)의 running과 같아야 한다 — startedAt은
 * 서버 시각이고 running에는 pausedRemainingMs가 없다(rules isValidRound).
 */
export async function startRound(code: string): Promise<void> {
  await updateDoc(doc(db, 'rooms', code), {
    round: {
      status: 'running',
      startedAt: serverTimestamp(),
      durationMs: ROUND_DURATION_DEFAULT_MS,
    },
  })
}

/**
 * 게임 종료 — playing을 waiting으로 되돌리고 진행 중인 라운드를 지운다(호스트 전용).
 * 두 필드를 한 번에 써야 한다: 나눠 쓰면 "대기 중인데 라운드가 살아 있는" 중간 상태가
 * 참가자 화면에 잠깐 보이고, firestore.rules도 두 키를 함께 바꾸는 갈래만 허용한다.
 *
 * 배정 이력(assignmentRound·완장·짝꿍)은 그대로 둔다 — 대기실로 돌아가 다음 차수를 배정하면
 * 그 시점에 레디가 리셋되므로, 종료가 라운드 루프를 끊지 않고 한 바퀴를 닫아 준다.
 */
export async function endGame(code: string, settlement?: RoundLedgerSettlement): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, 'rooms', code), { status: 'waiting', round: deleteField() })
  // 점수 정산(P07) — 라운드 원장의 result는 종료와 같은 배치여야 한다(rules가 커밋 후 방 상태
  // waiting을 요구한다). 원장 문서가 없는 라운드(도입 전 배정)는 정산 없이 종료만 한다.
  if (settlement !== undefined) {
    addRoundResultToBatch(batch, code, settlement.roundNo, settlement.result)
  }
  await batch.commit()
}

/** 종료와 함께 원장에 쓸 이번 라운드 정산 — 호출부(라운드 운영)가 settleRound로 만든다 */
export interface RoundLedgerSettlement {
  roundNo: number
  result: RoundSettlement
}

/**
 * 참가자 문서의 base* 두 키 → 배정 직전 이월값. 둘 중 하나라도 없으면(옛 앱 확정·배정 전·배정이
 * 풀린 참가자) null이다 — 반쪽 값으로 다시 계산하면 이력이 섞인다.
 */
function toCarryoverBase(data: Record<string, unknown>): CarryoverBase | null {
  const streak = data.baseSameGenderStreak
  const partnerIds = data.basePreviousPartnerIds
  if (typeof streak !== 'number' || !Array.isArray(partnerIds)) return null
  return { sameGenderStreak: streak, previousPartnerIds: partnerIds as string[] }
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
            carryoverBase: toCarryoverBase(data),
            hasBeenAssigned: typeof data.sameGenderStreak === 'number',
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

/**
 * 강퇴(호스트 전용) — 참가자 문서를 삭제한다. firestore.rules가 "방 호스트 + 방이 대기
 * 중(waiting)"일 때만 허용하므로 권한·시점 검증은 서버가 담당한다. 삭제는 멱등이라(이미
 * 없는 문서 삭제도 성공) 다른 기기와 겹쳐 눌러도 안전하다. 내보낸 참가자의 화면 전환은
 * 본인 기기의 명단 구독(subscribeToParticipants)이 감지한다 — 별도 알림 채널이 없다.
 *
 * 배정 확정 뒤·게임 시작 전에 내보내면 그 차수 편성 스냅샷에서도 같은 배치로 뺀다(snapshotRemoval,
 * 2026-10-09 리허설 문제 8). 빼지 않으면 내보낸 사람이 그 라운드 점수를 받고 남은 짝꿍이 2인 팀으로
 * 정산된다. 배치라 문서 삭제와 스냅샷 빼기는 함께 되거나 함께 안 된다.
 */
export async function kickParticipant(
  code: string,
  uid: string,
  snapshotRemoval?: KickSnapshotRemoval,
): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'rooms', code, 'participants', uid))
  if (snapshotRemoval !== undefined) {
    addSnapshotRemovalToBatch(batch, code, snapshotRemoval.roundNo, snapshotRemoval.armband, uid)
  }
  await batch.commit()
}

/** 강퇴와 함께 편성 스냅샷에서 뺄 자리 — 호출부(대기실)가 원장이 있고 정산 전일 때만 만든다 */
export interface KickSnapshotRemoval {
  roundNo: number
  armband: string
}
