import { encodeJpegDataUrl, type JpegEncodeStep } from '@/shared/utils/encodeJpegDataUrl'
import { VENUE_MAP_IMAGE_MAX_LENGTH } from './api/venueMap'

/**
 * 지도 압축 단계(P08 §2.2) — 긴 변 2000px부터 시도한다. 폰에서 손가락으로 키워 지도 글씨를 읽을 수 있는
 * 크기를 먼저 쓰고, 문서 상한을 넘는 복잡한 이미지만 더 줄인다.
 */
const VENUE_MAP_ENCODE_STEPS: readonly JpegEncodeStep[] = [
  { maxEdge: 2000, quality: 0.8 },
  { maxEdge: 1600, quality: 0.7 },
  { maxEdge: 1280, quality: 0.6 },
]

/**
 * 진행자가 고른 지도 파일을 Firestore 문서에 실을 수 있는 JPEG 데이터 URL로 줄인다.
 * 이미지가 아니거나 브라우저가 읽지 못하는 형식이면 null.
 */
export function encodeVenueMapImage(file: Blob): Promise<string | null> {
  return encodeJpegDataUrl(file, VENUE_MAP_ENCODE_STEPS, VENUE_MAP_IMAGE_MAX_LENGTH)
}
