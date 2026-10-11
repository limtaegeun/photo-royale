import { encodeBitmapAsJpegDataUrl, type JpegEncodeStep } from '@/shared/utils/encodeJpegDataUrl'
import { VENUE_MAP_IMAGE_MAX_LENGTH } from './api/venueMap'
import { loadHeicDecoder } from './heicDecoder'

/**
 * 지도 압축 단계(P08 §2.2) — 긴 변 2000px를 먼저 지키고 품질부터 낮춰 본다. 폰에서 손가락으로 키워 지도 글씨를
 * 읽으려면 크기가 품질보다 중요하다. 그래도 문서 상한을 넘는 복잡한 이미지만 1600·1280px로 줄인다.
 * 사파리(아이폰 브라우저 전부)는 같은 품질 값에서 JPEG가 크롬보다 2~2.7배 커서, 단계마다 크기와 품질을 함께
 * 내리면 아이폰에서 올린 지도만 1280px까지 내려갔다(2026-10-11 실측 — 같은 지도 사진이 크롬은 2000px).
 */
const VENUE_MAP_ENCODE_STEPS: readonly JpegEncodeStep[] = [
  { maxEdge: 2000, quality: 0.8 },
  { maxEdge: 2000, quality: 0.6 },
  { maxEdge: 2000, quality: 0.5 },
  { maxEdge: 1600, quality: 0.6 },
  { maxEdge: 1600, quality: 0.5 },
  { maxEdge: 1280, quality: 0.6 },
  { maxEdge: 1280, quality: 0.5 },
]

/**
 * HEVC로 압축한 HEIF 사진의 브랜드 — 아이폰 HEIC, 삼성 '고효율 사진' 등. ftyp 상자의 주·호환 브랜드 어디에든 있으면
 * HEIC로 본다. mif1·msf1 같은 일반 브랜드만 있는 파일(AVIF 등)은 넣지 않는다 — 해독기가 못 푸는데 내려받게 된다.
 */
const HEVC_HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs'])

/** ftyp 상자를 읽는 범위 — 브랜드가 여럿인 아이폰 HEIC도 앞 수십 바이트에 다 들어 있다 */
const FTYP_READ_BYTES = 64

/**
 * 파일 머리의 ftyp 상자로 HEIC인지 본다 — 확장자·MIME은 기기와 브라우저마다 달라(빈 값, image/heif 등) 내용으로 판정한다.
 */
async function isHevcHeif(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, FTYP_READ_BYTES).arrayBuffer())
  const fourCC = (offset: number) => String.fromCharCode(...head.subarray(offset, offset + 4))
  if (head.length < 16 || fourCC(4) !== 'ftyp') return false
  const boxSize = Math.min(head.length, new DataView(head.buffer).getUint32(0))
  // 8: 주 브랜드 · 12: 부 버전(브랜드 아님) · 16부터: 호환 브랜드
  for (let offset = 8; offset + 4 <= boxSize; offset += 4) {
    if (offset !== 12 && HEVC_HEIF_BRANDS.has(fourCC(offset))) return true
  }
  return false
}

/**
 * 고른 사진을 비트맵으로 읽는다. 브라우저가 읽는 형식(JPEG·PNG·WebP, 사파리는 HEIC까지)은 그대로 읽는다.
 * 크롬(안드로이드·PC)처럼 HEIC를 못 읽는 브라우저에서만 heic-to(libheif)를 내려받아 푼다 — 해독기(압축 약 0.8MB)는
 * HEIC를 고른 그때 처음 받는다. 해독기는 HEIF의 회전 정보를 적용해 세로 사진도 바로 세워 준다.
 * 이미지가 아니거나 둘 다 못 읽으면 null.
 */
async function decodeVenueMapPhoto(file: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file)
  } catch {
    // 이 브라우저가 못 여는 형식 — HEIC면 아래에서 해독기로 다시 읽는다
  }
  if (!(await isHevcHeif(file))) return null
  try {
    const { heicTo } = await loadHeicDecoder()
    return await heicTo({ blob: file, type: 'bitmap' })
  } catch {
    // 해독기를 못 받았거나(오프라인) 못 푸는 파일 — 다음에 고르면 해독기를 다시 받는다
    return null
  }
}

/**
 * 진행자가 고른 지도 파일을 Firestore 문서에 실을 수 있는 JPEG 데이터 URL로 줄인다.
 * 이미지가 아니거나 읽지 못하는 형식이면 null.
 */
export async function encodeVenueMapImage(file: Blob): Promise<string | null> {
  const bitmap = await decodeVenueMapPhoto(file)
  if (bitmap === null) return null
  try {
    return encodeBitmapAsJpegDataUrl(bitmap, VENUE_MAP_ENCODE_STEPS, VENUE_MAP_IMAGE_MAX_LENGTH)
  } finally {
    bitmap.close()
  }
}
