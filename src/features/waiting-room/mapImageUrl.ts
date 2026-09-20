/**
 * 행사장 지도 이미지 URL(P08 §2.2 단계 1) — 운영자가 방 문서 `mapImageUrl`에 붙이는 값의 클라 측 검증.
 * 서버(firestore.rules rooms update 5번 갈래)는 "https://로 시작하는 8~2048자 문자열"만 받는다.
 * 여기서는 그보다 조금 더 엄격하게 **URL로 파싱되는지**까지 본다 — 캡션이 host를 뽑아 보여주고,
 * 콕핏이 <img src>로 그대로 쓰기 때문이다.
 */

/** rules의 `mapImageUrl.size() <= 2048`과 같아야 한다(rooms.spec이 대조 검증) */
export const MAP_IMAGE_URL_MAX_LENGTH = 2048

/**
 * 입력 문자열 → https URL. 비어 있거나, URL로 파싱되지 않거나, https가 아니면 null.
 * 길이 상한은 여기서 보지 않는다 — 호출부가 상한 초과와 형식 오류를 다른 문구로 안내한다.
 */
export function parseMapImageUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}
