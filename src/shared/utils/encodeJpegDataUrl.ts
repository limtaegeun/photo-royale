/**
 * Firestore 문서에 인라인 저장하는 이미지의 형식 — JPEG 데이터 URL 접두.
 * 킬샷 사진(submissions)과 행사장 지도(assets/venueMap)가 Storage 없이 이 형식으로 문서에 실리고,
 * firestore.rules가 두 갈래 모두 같은 접두를 정규식으로 검사한다.
 */
export const JPEG_DATA_URL_PREFIX = 'data:image/jpeg;base64,'

/** 인코딩 한 단계 — 긴 변을 maxEdge(px) 이하로 줄이고 quality(0~1)로 압축한다 */
export interface JpegEncodeStep {
  maxEdge: number
  quality: number
}

/** 투명 픽셀을 덮는 바탕색 — JPEG에는 알파가 없어 그대로 그리면 투명 배경 PNG가 검게 나온다 */
const JPEG_BACKGROUND_COLOR = '#ffffff'

/**
 * 이미지를 단계별로 줄여 가며 JPEG 데이터 URL로 인코딩한다 — 결과가 maxLength(문자 수) 안에 드는
 * 첫 단계를 돌려준다. Firestore 문서 한도(1MiB) 안에 이미지를 담아야 하는 기능(킬샷 제출·행사장 지도)이
 * 함께 쓴다. 이미지를 읽지 못하거나(손상·미지원 형식) 어떤 단계로도 상한을 못 맞추면 null —
 * rules가 거부할 값은 돌려주지 않는다.
 */
export async function encodeJpegDataUrl(
  source: Blob,
  steps: readonly JpegEncodeStep[],
  maxLength: number,
): Promise<string | null> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(source)
  } catch {
    return null
  }
  try {
    for (const step of steps) {
      const scale = Math.min(1, step.maxEdge / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) return null
      context.fillStyle = JPEG_BACKGROUND_COLOR
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', step.quality)
      // jsdom 등 JPEG 인코딩이 안 되는 환경은 다른 접두를 돌려준다
      if (dataUrl.startsWith(JPEG_DATA_URL_PREFIX) && dataUrl.length <= maxLength) return dataUrl
    }
    return null
  } finally {
    bitmap.close()
  }
}
