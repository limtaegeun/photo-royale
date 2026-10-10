import { readonly, ref } from 'vue'
import { SUBMISSION_PHOTO_MAX_LENGTH, submitKillshot } from '@/features/round-ops'
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

export interface KillshotSubmitInput {
  roomCode: string
  uid: string
  team: string
  round: number
  photo: CapturedPhoto
}

/**
 * 킬샷 제출 — 캡처 원본(스트림 해상도 그대로)을 Firestore 문서에 인라인 저장할 수 있게
 * 다운스케일·압축한 JPEG 데이터 URL로 인코딩한 뒤 제출한다. Storage 없이 문서 한도(1MiB)
 * 안에서 동작하는 것이 전제라, 어떤 단계로도 상한을 못 맞추면 제출하지 않고 실패를 돌려준다.
 */
export function useKillshotSubmit() {
  const isSubmitting = ref(false)

  /** 성공 여부를 돌려준다(화면이 미리보기를 닫고 토스트를 띄우는 판단에 쓴다) */
  async function submit(input: KillshotSubmitInput): Promise<boolean> {
    if (isSubmitting.value) return false
    isSubmitting.value = true
    try {
      const dataUrl = await encodeJpegDataUrl(
        input.photo.blob,
        COMPRESSION_STEPS,
        SUBMISSION_PHOTO_MAX_LENGTH,
      )
      if (dataUrl === null) return false
      await submitKillshot(input.roomCode, {
        uid: input.uid,
        team: input.team,
        round: input.round,
        photo: dataUrl,
      })
      return true
    } catch {
      return false
    } finally {
      isSubmitting.value = false
    }
  }

  return { isSubmitting: readonly(isSubmitting), submit }
}
