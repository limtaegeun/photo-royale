import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore'
import { db } from '@/shared/api/firebase'
import { JPEG_DATA_URL_PREFIX } from '@/shared/utils/encodeJpegDataUrl'

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

/**
 * 행사장 지도 실시간 구독 — 등록된 지도(JPEG 데이터 URL)를 전달하고, 없으면 null.
 * 진행자가 게임 중에 지도를 바꾸면 새 지도가 바로 온다. 읽기는 rules가 호스트와 그 방 참가자에게만 연다.
 */
export function subscribeToVenueMapImage(
  code: string,
  onChange: (image: string | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    venueMapDoc(code),
    (snapshot) => {
      const image: unknown = snapshot.data()?.image
      onChange(typeof image === 'string' && image.startsWith(JPEG_DATA_URL_PREFIX) ? image : null)
    },
    onError,
  )
}

/**
 * 행사장 지도 저장(호스트 전용) — 브라우저에서 줄인 JPEG 데이터 URL을 통째로 덮어쓴다.
 * 권한(호스트 본인)·형식(JPEG 접두·길이 상한)은 firestore.rules가 검증한다. 방 상태(대기·게임 중)와 무관하다.
 */
export async function saveVenueMapImage(code: string, image: string): Promise<void> {
  await setDoc(venueMapDoc(code), { image, updatedAt: serverTimestamp() })
}
