import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { JPEG_DATA_URL_PREFIX } from '@/shared/utils/encodeJpegDataUrl'

vi.mock('@/shared/api/firebase', () => ({
  db: { app: { options: { projectId: 'demo' } } },
  auth: { currentUser: { getIdToken: () => Promise.resolve('token') } },
}))

/** 실제 DocumentReference 대신 쓰는 식별자 — doc() mock이 만들어 호출 검증에 쓴다 */
interface FakeRef {
  path: string
}

const setDocMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => Promise<void>>()

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  setDoc: (ref: FakeRef, data: Record<string, unknown>) => setDocMock(ref, data),
  serverTimestamp: () => 'server-timestamp',
}))

import {
  VENUE_MAP_IMAGE_MAX_LENGTH,
  fetchVenueMap,
  fetchVenueMapVersion,
  saveVenueMapImage,
} from '../api/venueMap'

const MAP_IMAGE = `${JPEG_DATA_URL_PREFIX}map`

beforeEach(() => {
  setDocMock.mockReset().mockResolvedValue(undefined)
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

describe('행사장 지도 읽기(REST)', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const jsonResponse = (status: number, body: unknown = {}) =>
    new Response(JSON.stringify(body), { status })

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('판 확인은 갱신 시각 필드만 달라고 하고 로그인 토큰을 싣는다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        documents: [
          {
            name: 'projects/demo/databases/(default)/documents/rooms/AB2C/assets/venueMap',
            fields: { updatedAt: { timestampValue: '2026-11-05T01:00:00Z' } },
          },
        ],
      }),
    )

    await expect(fetchVenueMapVersion('AB2C')).resolves.toBe('2026-11-05T01:00:00Z')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(
      'https://firestore.googleapis.com/v1/projects/demo/databases/(default)/documents/rooms/AB2C/assets?mask.fieldPaths=updatedAt',
    )
    expect(init?.headers).toEqual({ Authorization: 'Bearer token' })
  })

  it('지도가 등록 전이면 판과 지도 모두 null이다', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes('mask.fieldPaths') ? jsonResponse(200, {}) : jsonResponse(404),
    )

    await expect(fetchVenueMapVersion('AB2C')).resolves.toBeNull()
    await expect(fetchVenueMap('AB2C')).resolves.toBeNull()
  })

  it('권한 거부처럼 다른 오류는 호출부로 전파한다', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(403))

    await expect(fetchVenueMapVersion('AB2C')).rejects.toThrow('403')
    await expect(fetchVenueMap('AB2C')).rejects.toThrow('403')
  })

  it('지도와 판을 돌려주고, JPEG 데이터 URL이 아니면 이미지는 null이다', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        fields: {
          image: { stringValue: MAP_IMAGE },
          updatedAt: { timestampValue: '2026-11-05T01:00:00Z' },
        },
      }),
    )
    await expect(fetchVenueMap('AB2C')).resolves.toEqual({
      image: MAP_IMAGE,
      version: '2026-11-05T01:00:00Z',
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { fields: { image: { stringValue: 'https://example.com/map.png' } } }),
    )
    await expect(fetchVenueMap('AB2C')).resolves.toEqual({ image: null, version: null })
  })
})

describe('firestore.rules 행사장 지도 규칙 동기화 가드', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')
  const assetsBlock = rules.slice(rules.indexOf('match /assets/{assetId}'), rules.indexOf('match /notices/'))

  it('assets 갈래가 있고 venueMap 문서에 JPEG 데이터 URL만 받는다', () => {
    expect(assetsBlock).toContain("assetId == 'venueMap'")
    expect(assetsBlock).toContain('request.resource.data.image is string')
    expect(assetsBlock).toContain(`image.matches('^${JPEG_DATA_URL_PREFIX}.*')`)
    expect(assetsBlock).toContain("keys().hasOnly(['image', 'updatedAt'])")
    // 지도만 지우는 길은 없고, 방 삭제(P09) 때만 함께 지운다
    expect(assetsBlock).toContain('allow delete: if isDeletingRoomHost(roomCode);')
  })

  it('길이 상한이 클라 VENUE_MAP_IMAGE_MAX_LENGTH와 같고 문서 한도(1MiB) 안이다', () => {
    const match = assetsBlock.match(/request\.resource\.data\.image\.size\(\) <= (\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBe(VENUE_MAP_IMAGE_MAX_LENGTH)
    expect(VENUE_MAP_IMAGE_MAX_LENGTH).toBeLessThan(1024 * 1024)
  })
})
