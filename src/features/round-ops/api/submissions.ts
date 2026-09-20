import {
  addDoc,
  collection,
  doc,
  getDocFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/shared/api/firebase'
import type { AbsorbKillEffect } from '@/features/game-mode'
import { addTallyToBatch } from '@/features/round-ledger'

/** 킬샷 데이터 URL 접두 — JPEG만 허용한다(firestore.rules의 matches 정규식과 같은 규칙) */
export const SUBMISSION_PHOTO_PREFIX = 'data:image/jpeg;base64,'

/**
 * 킬샷 데이터 URL 길이 상한(문자 수 ≒ 바이트). Firestore 문서 한도(1MiB)에서 나머지 필드
 * 여유를 남긴 값으로, firestore.rules의 `photo.size() <= 900000`과 **숫자까지 동일**해야 한다
 * (rules는 클라 코드를 import할 수 없어 이중 정의이고, submissions.spec이 대조 검증한다.
 * 변경 시 rules도 함께 갱신·배포할 것).
 */
export const SUBMISSION_PHOTO_MAX_LENGTH = 900000

/** pending: 판정 대기 → 호스트가 approved(확정) 또는 rejected(반려)로 한 번만 전이한다 */
export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

/** 서버에 저장된 판정 상태. null은 문서 부재이며 캐시 상태는 사용하지 않는다. */
export async function getSubmissionStatusFromServer(
  code: string,
  submissionId: string,
): Promise<SubmissionStatus | null> {
  const snapshot = await getDocFromServer(doc(db, 'rooms', code, 'submissions', submissionId))
  if (!snapshot.exists()) return null
  const status = snapshot.data().status
  return status === 'pending' || status === 'approved' || status === 'rejected' ? status : null
}

/** 참가자가 제출한 킬샷 한 건 — team/round는 완장이 라운드마다 바뀌므로 제출 시점 스냅샷이다 */
export interface Submission {
  /** Firestore 문서 ID */
  id: string
  /** 제출자 uid — 이름은 저장하지 않고 participants 문서(ID=uid)에서 조인한다 */
  uid: string
  /** 제출 시점의 제출자 완장(A~Z 1글자) */
  team: string
  /** 제출 시점의 팀편성 차수(= 라운드 번호) */
  round: number
  /** 다운스케일·압축된 JPEG 데이터 URL */
  photo: string
  status: SubmissionStatus
  /** serverTimestamp가 반영되기 전 스냅샷은 null */
  createdAtMs: number | null
}

/** 킬샷 제출에 필요한 입력 — uid/team/round는 rules가 참가자·방 문서와 대조해 위조를 막는다 */
export interface KillshotInput {
  uid: string
  team: string
  round: number
  photo: string
}

/** 판정 대상 팀과 그 팀이 현재 배정에 실제 존재함을 Rules에서 확인할 참가자 */
export interface SubmissionTarget {
  team: string
  participantUid: string
}

/**
 * 기록 탭이 보는 판정 이력 한 건 — 대기(pending)를 포함한 모든 상태를 담고,
 * 확정(approved)이면 잡힌 팀 완장(targetTeam)이 함께 남는다.
 */
export interface SubmissionRecord extends Submission {
  /** 확정 시 잡힌 팀 완장(A~Z 1글자) — 대기·반려는 null */
  targetTeam: string | null
  /** 확정 시 킬 배율 — 3이면 낙오 포착 킬(+30). 배율 필드가 없는 확정(배율 도입 전)은 1 */
  multiplier: KillMultiplier
  /** 판정 시각 — 대기 중이거나 serverTimestamp 반영 전이면 null */
  judgedAtMs: number | null
}

/**
 * 킬 배율(P07 M2) — 1은 일반 킬(+10), 3은 낙오 포착 킬(+30: 팀원과 2m 넘게 떨어진 사람을 찍은 킬,
 * 사진으로 거리를 판별할 수 없어 호스트가 판정 시트에서 정한다). rules가 이 두 값만 허용한다.
 */
export type KillMultiplier = 1 | 3

interface FirestoreTimestamp {
  toMillis: () => number
}

function isFirestoreTimestamp(value: unknown): value is FirestoreTimestamp {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof value.toMillis === 'function'
  )
}

function toPendingSubmission(id: string, data: Record<string, unknown>): Submission | null {
  if (
    typeof data.uid !== 'string' ||
    typeof data.team !== 'string' ||
    typeof data.round !== 'number' ||
    typeof data.photo !== 'string' ||
    data.status !== 'pending'
  ) {
    return null
  }

  return {
    id,
    uid: data.uid,
    team: data.team,
    round: data.round,
    photo: data.photo,
    status: data.status,
    createdAtMs: isFirestoreTimestamp(data.createdAt) ? data.createdAt.toMillis() : null,
  }
}

function toSubmissionRecord(id: string, data: Record<string, unknown>): SubmissionRecord | null {
  if (
    typeof data.uid !== 'string' ||
    typeof data.team !== 'string' ||
    typeof data.round !== 'number' ||
    typeof data.photo !== 'string' ||
    (data.status !== 'pending' && data.status !== 'approved' && data.status !== 'rejected')
  ) {
    return null
  }

  return {
    id,
    uid: data.uid,
    team: data.team,
    round: data.round,
    photo: data.photo,
    status: data.status,
    createdAtMs: isFirestoreTimestamp(data.createdAt) ? data.createdAt.toMillis() : null,
    targetTeam: data.status === 'approved' && typeof data.targetTeam === 'string' ? data.targetTeam : null,
    multiplier: data.status === 'approved' && data.multiplier === 3 ? 3 : 1,
    judgedAtMs: isFirestoreTimestamp(data.judgedAt) ? data.judgedAt.toMillis() : null,
  }
}

/**
 * 킬샷 제출 — rooms/{code}/submissions에 append한다. 판정 결과까지 한 문서에 남는
 * 이력이라 문서를 덮어쓰지 않고 매번 새 문서를 만든다(기록 탭이 이 컬렉션을 재료로 쓴다).
 */
export async function submitKillshot(code: string, input: KillshotInput): Promise<void> {
  await addDoc(collection(db, 'rooms', code, 'submissions'), {
    uid: input.uid,
    team: input.team,
    round: input.round,
    photo: input.photo,
    status: 'pending',
    createdAt: serverTimestamp(),
  })
}

/** 판정 대기 큐 스냅샷의 신선도 — fromCache는 서버가 아니라 로컬 캐시에서만 나온 데이터임을 뜻한다 */
export interface PendingQueueMeta {
  /** true면 이 스냅샷은 서버 확인 없이 로컬 캐시에서 나왔다(오프라인·음영지역) */
  fromCache: boolean
}

/**
 * 판정 대기 큐 실시간 구독 — 판정된 문서는 서버 필터로 제외한다(사진이 커서 전체 구독은
 * 판정이 쌓일수록 다운로드가 늘어난다). 정렬은 클라이언트에서 한다 — where + orderBy 조합은
 * 복합 인덱스가 필요해서 fetchMyRooms의 전례(클라 정렬로 인덱스 회피)를 답습한다.
 * 오래 기다린 제출부터 판정하도록 오래된 순(asc), 서버 시각 반영 전(null)은 맨 뒤에 둔다.
 *
 * `includeMetadataChanges: true`가 필요한 이유 — 이게 없으면 오프라인(음영지역)에서 캐시로
 * 서빙되던 스냅샷이 나중에 서버로 확인돼도 데이터가 같으면 onSnapshot이 다시 불리지 않는다.
 * 즉 "캐시에서만 나온 상태" 플래그가 영원히 안 지워질 수 있다. `snapshot.metadata.fromCache`가
 * 바로 그 플래그이고, 종료 확인이 큐의 "0건"을 서버가 확인해 준 0건인지 판단하는 근거다
 * (p06 §7 행사 전 필수 수정 2).
 */
export function subscribeToPendingSubmissions(
  code: string,
  round: number,
  onChange: (submissions: Submission[], meta: PendingQueueMeta) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const pendingQuery = query(
    collection(db, 'rooms', code, 'submissions'),
    where('status', '==', 'pending'),
    where('round', '==', round),
  )
  return onSnapshot(
    pendingQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      const submissions = snapshot.docs.flatMap((submissionDoc) => {
        const submission = toPendingSubmission(submissionDoc.id, submissionDoc.data())
        return submission === null ? [] : [submission]
      })
      submissions.sort(
        (a, b) =>
          (a.createdAtMs ?? Number.MAX_SAFE_INTEGER) - (b.createdAtMs ?? Number.MAX_SAFE_INTEGER),
      )
      onChange(submissions, { fromCache: snapshot.metadata.fromCache })
    },
    onError,
  )
}

/**
 * 기록 탭 구독 건수 상한 — 킬샷 사진이 data URL로 인라인 저장되어 무제한 구독은 모바일
 * 메모리·다운로드 과금 위험이 크다. 5라운드×20명 규모를 여유 있게 덮는 최근 200건으로 제한한다.
 */
export const RECORD_LOG_LIMIT = 200

/**
 * 판정 이력 전체 실시간 구독 — 기록 탭 전용. pending 큐와 달리 서버 필터 없이 전 라운드·
 * 전 상태를 받는다. 사진(data URL)이 커서 이 구독은 무겁다 — 화면이 항상 열지 않고
 * 기록 탭이 처음 활성화될 때 한 번만 게으르게 시작한다(스토어가 보장).
 * 서버에서는 createdAt 내림차순으로 최근 RECORD_LOG_LIMIT건만 받는다(무제한 구독의 모바일
 * 메모리·과금 위험 완화) — orderBy가 단일 필드라 복합 인덱스가 필요 없다. 화면이 원하는
 * 정렬(라운드 내림차순)은 여전히 클라이언트에서 한다(pending 큐와 같은 이유: 복합 인덱스 회피).
 * 기록은 로그라 최신이 위다 — 라운드 내림차순, 라운드 안에서는 최신 제출부터.
 * 서버 시각 반영 전(null)은 방금 제출된 것이므로 맨 앞에 둔다.
 */
export function subscribeToSubmissionLog(
  code: string,
  onChange: (records: SubmissionRecord[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const logQuery = query(
    collection(db, 'rooms', code, 'submissions'),
    orderBy('createdAt', 'desc'),
    limit(RECORD_LOG_LIMIT),
  )
  return onSnapshot(
    logQuery,
    (snapshot) => {
      const records = snapshot.docs.flatMap((submissionDoc) => {
        const record = toSubmissionRecord(submissionDoc.id, submissionDoc.data())
        return record === null ? [] : [record]
      })
      records.sort(
        (a, b) =>
          b.round - a.round ||
          (b.createdAtMs ?? Number.MAX_SAFE_INTEGER) - (a.createdAtMs ?? Number.MAX_SAFE_INTEGER),
      )
      onChange(records)
    },
    onError,
  )
}

/**
 * 내 킬샷 구독(게스트) — 이번 라운드에 내가 올린 제출만. 판정 결과 알림(D-3)의 근거다.
 * uid·round 두 등호 필터라 복합 인덱스 없이 단일 필드 인덱스 병합으로 실행된다. 사진이 실려 무겁지만
 * 한 사람의 한 라운드 제출은 몇 건이라 콕핏이 상시 구독해도 된다. rules read는 참가자 본인에게 열려 있다.
 */
export function subscribeToMySubmissions(
  code: string,
  uid: string,
  round: number,
  onChange: (records: SubmissionRecord[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const myQuery = query(
    collection(db, 'rooms', code, 'submissions'),
    where('uid', '==', uid),
    where('round', '==', round),
  )
  return onSnapshot(
    myQuery,
    (snapshot) => {
      const records = snapshot.docs.flatMap((submissionDoc) => {
        const record = toSubmissionRecord(submissionDoc.id, submissionDoc.data())
        return record === null ? [] : [record]
      })
      records.sort(
        (a, b) =>
          (a.createdAtMs ?? Number.MAX_SAFE_INTEGER) - (b.createdAtMs ?? Number.MAX_SAFE_INTEGER),
      )
      onChange(records)
    },
    onError,
  )
}

/** 판정 확정과 함께 올릴 라운드 원장 집계 — 원장 문서가 있는 라운드에서만 넘긴다 */
export interface ApprovalTally {
  /** 원장 문서 ID = 킬샷의 round */
  roundNo: number
  /** 공격 완장 = 킬샷의 team */
  attackerTeam: string
  /** 피격 팀이 이 라운드의 X 겸직 팀(왕)인지 — 원장 kingKills(왕잡기 왕 사냥) 근거. 생략 = false */
  kingTarget?: boolean
  /**
   * 편입 모드(꼬리잡기, P07 §4.2)의 킬 효과 — 킬 시점의 사냥 팀 소속(credits)과 이 킬로 아웃된 팀의
   * 꼬리 합류(tails)를 원장에 같이 남긴다. 편입이 없는 모드는 생략(원장에 두 키를 쓰지 않는다)
   */
  absorb?: AbsorbKillEffect
}

/**
 * 판정 확정 — 사진 속 완장이 어느 팀(=그룹은 완장에서 파생)인지와 킬 배율을 기록한다. tally가
 * 있으면 라운드 원장의 집계 increment(배율 3이면 tripleKills)를 같은 writeBatch에 얹어 원자
 * 커밋한다 — 판정만 남고 집계가 빠지거나 그 반대가 되지 않는다. 원장 문서가 없는 라운드(도입 전
 * 배정)는 tally 없이 부른다: 없는 문서에 update를 얹으면 배치 전체가 실패해 판정까지 막힌다.
 */
export async function approveSubmission(
  code: string,
  submissionId: string,
  target: SubmissionTarget,
  tally?: ApprovalTally,
  multiplier: KillMultiplier = 1,
): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, 'rooms', code, 'submissions', submissionId), {
    status: 'approved',
    targetTeam: target.team,
    targetParticipantUid: target.participantUid,
    multiplier,
    judgedAt: serverTimestamp(),
  })
  if (tally !== undefined) {
    addTallyToBatch(
      batch,
      code,
      tally.roundNo,
      tally.attackerTeam,
      target.team,
      multiplier,
      tally.kingTarget ?? false,
      tally.absorb,
    )
  }
  await batch.commit()
}

/** 반려 — 사유는 남기지 않는다(확정 스펙). rules가 pending → rejected 단방향만 허용한다 */
export async function rejectSubmission(code: string, submissionId: string): Promise<void> {
  await updateDoc(doc(db, 'rooms', code, 'submissions', submissionId), {
    status: 'rejected',
    judgedAt: serverTimestamp(),
  })
}
