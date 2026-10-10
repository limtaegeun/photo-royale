import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JPEG_DATA_URL_PREFIX } from '@/shared/utils/encodeJpegDataUrl'

vi.mock('@/shared/api/firebase', () => ({ db: {} }))

/** 실제 DocumentReference 대신 쓰는 식별자 — doc() mock이 만들어 호출 검증에 쓴다 */
interface FakeRef {
  path: string
}

const setDocMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => Promise<void>>()
const onSnapshotMock =
  vi.fn<
    (
      ref: FakeRef,
      onNext: (snapshot: { data: () => Record<string, unknown> | undefined }) => void,
      onError?: (error: Error) => void,
    ) => () => void
  >()

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  setDoc: (ref: FakeRef, data: Record<string, unknown>) => setDocMock(ref, data),
  onSnapshot: (
    ref: FakeRef,
    onNext: (snapshot: { data: () => Record<string, unknown> | undefined }) => void,
    onError?: (error: Error) => void,
  ) => onSnapshotMock(ref, onNext, onError),
  serverTimestamp: () => 'server-timestamp',
}))

import {
  VENUE_MAP_IMAGE_MAX_LENGTH,
  saveVenueMapImage,
  subscribeToVenueMapImage,
} from '../api/venueMap'

const MAP_IMAGE = `${JPEG_DATA_URL_PREFIX}map`

beforeEach(() => {
  setDocMock.mockReset().mockResolvedValue(undefined)
  onSnapshotMock.mockReset().mockReturnValue(() => {})
})

describe('saveVenueMapImage', () => {
  it('방 문서가 아니라 rooms/{code}/assets/venueMap 문서를 이미지·서버 시각으로 통째로 쓴다', async () => {
    await saveVenueMapImage('AB2C', MAP_IMAGE)

    expect(setDocMock).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C/assets/venueMap' },
      { image: MAP_IMAGE, updatedAt: 'server-timestamp' },
    )
  })

  it('쓰기 실패(권한·형식 거부)는 호출부로 전파된다', async () => {
    setDocMock.mockRejectedValueOnce(new Error('permission denied'))

    await expect(saveVenueMapImage('AB2C', MAP_IMAGE)).rejects.toThrow('permission denied')
  })
})

describe('subscribeToVenueMapImage', () => {
  function subscribe() {
    const onChange = vi.fn<(image: string | null) => void>()
    const onError = vi.fn<(error: Error) => void>()
    subscribeToVenueMapImage('AB2C', onChange, onError)
    const [ref, onNext, passedOnError] = onSnapshotMock.mock.calls[0]!
    return { ref, onNext, passedOnError, onChange, onError }
  }

  it('지도 문서를 구독하고, JPEG 데이터 URL이면 그대로 전달한다', () => {
    const { ref, onNext, onChange } = subscribe()
    expect(ref).toEqual({ path: 'rooms/AB2C/assets/venueMap' })

    onNext({ data: () => ({ image: MAP_IMAGE, updatedAt: 'ts' }) })

    expect(onChange).toHaveBeenLastCalledWith(MAP_IMAGE)
  })

  it('문서가 없거나(등록 전) JPEG 데이터 URL이 아니면 null — 콕핏이 지도 슬롯을 숨긴다', () => {
    const { onNext, onChange } = subscribe()

    onNext({ data: () => undefined })
    expect(onChange).toHaveBeenLastCalledWith(null)

    onNext({ data: () => ({ image: 'https://example.com/map.png' }) })
    expect(onChange).toHaveBeenLastCalledWith(null)

    onNext({ data: () => ({ image: 42 }) })
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('구독 오류 콜백을 그대로 넘긴다', () => {
    const { passedOnError, onError } = subscribe()

    expect(passedOnError).toBe(onError)
  })
})

/**
 * 행사장 지도(P08 §2.2) — rules의 assets 갈래는 호스트가 venueMap 문서 하나만, JPEG 데이터 URL로,
 * 길이 상한 안에서 쓰게 한다. 상한은 클라 VENUE_MAP_IMAGE_MAX_LENGTH의 이중 정의라 여기서 대조하고,
 * 문서 ID·접두 검사가 rules에 남아 있는지도 함께 고정한다.
 */
describe('firestore.rules 행사장 지도 규칙 동기화 가드', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')
  const assetsBlock = rules.slice(rules.indexOf('match /assets/{assetId}'), rules.indexOf('match /notices/'))

  it('assets 갈래가 있고 venueMap 문서에 JPEG 데이터 URL만 받는다', () => {
    expect(assetsBlock).toContain("assetId == 'venueMap'")
    expect(assetsBlock).toContain('request.resource.data.image is string')
    expect(assetsBlock).toContain(`image.matches('^${JPEG_DATA_URL_PREFIX}.*')`)
    expect(assetsBlock).toContain("keys().hasOnly(['image', 'updatedAt'])")
    expect(assetsBlock).toContain('allow delete: if false')
  })

  it('길이 상한이 클라 VENUE_MAP_IMAGE_MAX_LENGTH와 같고 문서 한도(1MiB) 안이다', () => {
    const match = assetsBlock.match(/request\.resource\.data\.image\.size\(\) <= (\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBe(VENUE_MAP_IMAGE_MAX_LENGTH)
    expect(VENUE_MAP_IMAGE_MAX_LENGTH).toBeLessThan(1024 * 1024)
  })
})
