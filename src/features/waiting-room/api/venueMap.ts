import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/shared/api/firebase'
import { JPEG_DATA_URL_PREFIX } from '@/shared/utils/encodeJpegDataUrl'
import { fetchFirestoreRest } from './firestoreRest'

/**
 * 행사장 지도 이미지 길이 상한(문자 수 ≒ 바이트, P08 §2.2). Firestore 문서 한도(1MiB)에서 다른 필드
 * 여유를 남긴 값으로, firestore.rules assets 갈래의 `image.size() <= 1000000`과 **숫자까지 동일**해야
 * 한다(rules는 클라 코드를 import할 수 없어 이중 정의이고, venueMap.spec이 대조 검증한다.
 * 변경 시 rules도 함께 갱신·배포할 것).
 */
export const VENUE_MAP_IMAGE_MAX_LENGTH = 1000000

/**
 * 방마다 한 장인 지도 문서 — 방 문서와 따로 둔다. 방 문서는 참가자 전원이 계속 구독하므로, 거기에
 * 1MB 가까운 이미지를 실으면 방이 바뀔 때(배정·시작·라운드 운영)마다 전원에게 지도가 다시 내려간다.
 */
function venueMapDoc(code: string) {
  return doc(db, 'rooms', code, 'assets', 'venueMap')
}

/** 지도 판 확인을 기다리는 시간(ms) — 응답이 수십 바이트라 길게 기다릴 이유가 없다 */
const VENUE_MAP_VERSION_TIMEOUT_MS = 10_000
/** 지도 내려받기를 기다리는 시간(ms) — 1MB를 300kbps로 받아도 30초 안쪽이다 */
const VENUE_MAP_DOWNLOAD_TIMEOUT_MS = 60_000

function venueMapRestPath(code: string): string {
  return `rooms/${code}/assets/venueMap`
}

/** REST 문서 응답에서 쓰는 필드만 — 값은 타입 이름 아래에 온다 */
interface VenueMapRestDocument {
  fields?: {
    image?: { stringValue?: string }
    updatedAt?: { timestampValue?: string }
  }
}

/** 받아 온 지도 — version이 바뀌면 지도가 바뀐 것이다 */
export interface VenueMap {
  /** JPEG 데이터 URL. 형식이 다르면 null */
  image: string | null
  version: string | null
}

/**
 * 지도의 판(갱신 시각)만 읽는다. 문서가 없으면(등록 전) null이다. 지도가 바뀌었는지 보려고 1MB를 내려받지 않도록
 * 필드를 하나만 달라고 한다. 웹 SDK에는 필드 선택이 없어 REST로 읽는다. 단건 조회는 등록 전인 방에서 확인할 때마다
 * 404가 콘솔 오류로 남아 목록으로 읽는다(assets에는 지도 문서뿐이다).
 */
export async function fetchVenueMapVersion(code: string): Promise<string | null> {
  const response = await fetchFirestoreRest(`rooms/${code}/assets?mask.fieldPaths=updatedAt`, {
    signal: AbortSignal.timeout(VENUE_MAP_VERSION_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`행사장 지도 판을 읽지 못했다 (${response.status})`)
  const list = (await response.json()) as { documents?: (VenueMapRestDocument & { name: string })[] }
  const venueMap = list.documents?.find((document) => document.name.endsWith('/assets/venueMap'))
  return venueMap?.fields?.updatedAt?.timestampValue ?? null
}

/**
 * 지도를 내려받는다. 문서가 없으면(등록 전) null이다. 구독으로 받지 않는 이유: 모든 구독이 한 연결을 나눠 써서,
 * 약 1MB인 이 문서가 내려오는 동안 공지·배정·게임 종료가 뒤에 선다(1Mbps 폰에서 배정 반영이 0.9초에서 15초로 늘었다).
 * 읽기는 rules가 호스트와 그 방 참가자에게만 연다.
 */
export async function fetchVenueMap(code: string): Promise<VenueMap | null> {
  const response = await fetchFirestoreRest(venueMapRestPath(code), {
    // 같은 망을 쓰는 구독 응답을 앞세운다
    priority: 'low',
    signal: AbortSignal.timeout(VENUE_MAP_DOWNLOAD_TIMEOUT_MS),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`행사장 지도를 읽지 못했다 (${response.status})`)
  const document = (await response.json()) as VenueMapRestDocument
  const image = document.fields?.image?.stringValue
  return {
    image: image?.startsWith(JPEG_DATA_URL_PREFIX) ? image : null,
    version: document.fields?.updatedAt?.timestampValue ?? null,
  }
}

/**
 * 행사장 지도 저장(호스트 전용) — 브라우저에서 줄인 JPEG 데이터 URL을 통째로 덮어쓴다.
 * 권한(호스트 본인)·형식(JPEG 접두·길이 상한)은 firestore.rules가 검증한다. 방 상태(대기·게임 중)와 무관하다.
 */
export async function saveVenueMapImage(code: string, image: string): Promise<void> {
  await setDoc(venueMapDoc(code), { image, updatedAt: serverTimestamp() })
}
