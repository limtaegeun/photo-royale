import { readonly, ref } from 'vue'
import {
  SUBMISSION_PHOTO_MAX_LENGTH,
  newSubmissionId,
  submissionExists,
  submitKillshot,
} from '@/features/round-ops'
import { encodeJpegDataUrl } from '@/shared/utils/encodeJpegDataUrl'
import type { CapturedPhoto } from './usePhotoCapture'

/**
 * 압축 재시도 단계 — 앞 단계 결과가 상한(SUBMISSION_PHOTO_MAX_LENGTH)을 넘으면 더 작게·
 * 더 낮은 품질로 다시 인코딩한다. 첫 단계(1280px·0.7)면 통상 100~300KB라 한 번에 통과한다.
 */
const COMPRESSION_STEPS = [
  { maxEdge: 1280, quality: 0.7 },
  { maxEdge: 960, quality: 0.55 },
  { maxEdge: 640, quality: 0.4 },
] as const

/**
 * 이만큼 기다려도 서버가 제출을 확인해 주지 않으면 "연결이 불안정하다"고 알린다 — 대기실 준비 완료의
 * 기다림(READY_WRITE_TIMEOUT_MS)과 같은 값이다. Firestore 쓰기는 끊긴 동안 실패하지 않고 매달려
 * 있다가 연결되면 이어서 보내므로, 안내만 하고 쓰기는 그대로 둔다.
 */
export const SUBMIT_SLOW_MS = 8000

/**
 * 보내는 중인 킬샷을 담아 두는 자리 — 끊긴 채 앱·탭을 닫으면 메모리에 매달린 쓰기가 같이 사라져,
 * 다시 열어도 그 킬샷은 서버에 없고 참가자는 사라진 줄 몰랐다(10/28 최종 QA D4). 보내기 직전에
 * 여기 적고 서버가 확인하면 지운다. 남아 있으면 콕핏이 다시 열릴 때 확인 화면으로 되살린다.
 */
const PENDING_KILLSHOT_KEY = 'pr:pending-killshot'

export interface KillshotSubmitInput {
  roomCode: string
  uid: string
  team: string
  round: number
  photo: CapturedPhoto
  /** 되살린 킬샷을 다시 보낼 때 — 처음 보낼 때 정한 문서 id를 그대로 쓴다(두 장 방지) */
  submissionId?: string
}

interface PendingKillshot {
  roomCode: string
  uid: string
  team: string
  round: number
  submissionId: string
  /** 압축한 JPEG 데이터 URL — 제출하려던 그 사진 */
  photo: string
  width: number
  height: number
}

/** 다시 연 콕핏에서 남은 킬샷을 확인한 결과 */
export type PendingKillshotResume =
  | { status: 'none' }
  /** 닫기 전에 서버에 도착해 있었다 */
  | { status: 'landed' }
  /** 지난 차수의 킬샷이라 더는 낼 수 없다 */
  | { status: 'expired' }
  /** 확인 화면으로 되살릴 사진 */
  | { status: 'restored'; blob: Blob; width: number; height: number; submissionId: string }

function savePending(pending: PendingKillshot): void {
  try {
    localStorage.setItem(PENDING_KILLSHOT_KEY, JSON.stringify(pending))
  } catch {
    // 저장 공간이 없거나 막힌 환경 — 이 탭이 열려 있는 동안의 제출은 그대로 된다
  }
}

function loadPending(): PendingKillshot | null {
  try {
    const raw = localStorage.getItem(PENDING_KILLSHOT_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<PendingKillshot>
    if (
      typeof parsed.roomCode !== 'string' ||
      typeof parsed.uid !== 'string' ||
      typeof parsed.team !== 'string' ||
      typeof parsed.round !== 'number' ||
      typeof parsed.submissionId !== 'string' ||
      typeof parsed.photo !== 'string'
    ) {
      return null
    }
    return {
      ...(parsed as PendingKillshot),
      width: typeof parsed.width === 'number' ? parsed.width : 0,
      height: typeof parsed.height === 'number' ? parsed.height : 0,
    }
  } catch {
    return null
  }
}

/** 남은 킬샷을 지운다 — 서버가 확인했거나, 참가자가 버렸거나, 더는 낼 수 없을 때 */
export function discardPendingKillshot(): void {
  try {
    localStorage.removeItem(PENDING_KILLSHOT_KEY)
  } catch {
    // 지우지 못해도 다음에 열 때 서버 확인으로 걸러진다
  }
}

/** JPEG 데이터 URL → Blob. 형식이 어긋나면 null */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:image/jpeg;base64,') || comma === -1) return null
  try {
    const binary = atob(dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
    return new Blob([bytes], { type: 'image/jpeg' })
  } catch {
    return null
  }
}

/**
 * 킬샷 제출 — 캡처 원본(스트림 해상도 그대로)을 Firestore 문서에 인라인 저장할 수 있게
 * 다운스케일·압축한 JPEG 데이터 URL로 인코딩한 뒤 제출한다. Storage 없이 문서 한도(1MiB)
 * 안에서 동작하는 것이 전제라, 어떤 단계로도 상한을 못 맞추면 제출하지 않고 실패를 돌려준다.
 */
export function useKillshotSubmit() {
  const isSubmitting = ref(false)
  /** 보낸 지 SUBMIT_SLOW_MS가 지나도 서버 확인이 없다 — 확인 화면이 연결 불안정을 알린다 */
  const isSlow = ref(false)

  /** 성공 여부를 돌려준다(화면이 미리보기를 닫고 토스트를 띄우는 판단에 쓴다) */
  async function submit(input: KillshotSubmitInput): Promise<boolean> {
    if (isSubmitting.value) return false
    isSubmitting.value = true
    isSlow.value = false
    const slowTimer = setTimeout(() => {
      isSlow.value = true
    }, SUBMIT_SLOW_MS)
    let submissionId: string | null = null
    try {
      const dataUrl = await encodeJpegDataUrl(
        input.photo.blob,
        COMPRESSION_STEPS,
        SUBMISSION_PHOTO_MAX_LENGTH,
      )
      if (dataUrl === null) return false
      submissionId = input.submissionId ?? newSubmissionId(input.roomCode)
      savePending({
        roomCode: input.roomCode,
        uid: input.uid,
        team: input.team,
        round: input.round,
        submissionId,
        photo: dataUrl,
        width: input.photo.width,
        height: input.photo.height,
      })
      await submitKillshot(
        input.roomCode,
        { uid: input.uid, team: input.team, round: input.round, photo: dataUrl },
        submissionId,
      )
      discardPendingKillshot()
      return true
    } catch {
      // 같은 id가 이미 서버에 있으면 성공이다 — 되살린 킬샷을 다시 보냈는데 먼저 보낸 쪽이 늦게 도착해
      // 두 번째가 덮어쓰기로 거부된 경우다(참가자는 update 권한이 없다)
      if (submissionId !== null) {
        const landed = await submissionExists(input.roomCode, submissionId).catch(() => false)
        if (landed) {
          discardPendingKillshot()
          return true
        }
      }
      // 거부(마감 이후 도착·권한)는 다시 열어도 낼 수 없다 — 사진은 화면에 남아 다시 시도할 수 있다
      discardPendingKillshot()
      return false
    } finally {
      clearTimeout(slowTimer)
      isSubmitting.value = false
      isSlow.value = false
    }
  }

  /**
   * 콕핏을 다시 열었을 때 보내지 못하고 남은 킬샷을 확인한다. 같은 방·같은 사람의 것만 본다 —
   * 다른 방이나 다른 계정의 것은 건드리지 않고 그대로 둔다.
   */
  async function resumePending(
    roomCode: string,
    uid: string,
    round: number,
  ): Promise<PendingKillshotResume> {
    const pending = loadPending()
    if (pending === null || pending.roomCode !== roomCode || pending.uid !== uid) {
      return { status: 'none' }
    }
    if (pending.round !== round) {
      discardPendingKillshot()
      return { status: 'expired' }
    }
    const landed = await submissionExists(roomCode, pending.submissionId).catch(() => false)
    if (landed) {
      discardPendingKillshot()
      return { status: 'landed' }
    }
    const blob = dataUrlToBlob(pending.photo)
    if (blob === null) {
      discardPendingKillshot()
      return { status: 'none' }
    }
    return {
      status: 'restored',
      blob,
      width: pending.width,
      height: pending.height,
      submissionId: pending.submissionId,
    }
  }

  return {
    isSubmitting: readonly(isSubmitting),
    isSlow: readonly(isSlow),
    submit,
    resumePending,
  }
}
