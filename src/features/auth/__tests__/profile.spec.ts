import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/api/firebase', () => ({ db: {} }))

/** 실제 DocumentReference 대신 쓰는 식별자 — doc() mock이 만들어 호출 검증에 쓴다 */
interface FakeRef {
  path: string
}

const getDocMock =
  vi.fn<(ref: FakeRef) => Promise<{ exists: () => boolean; data?: () => Record<string, unknown> }>>()

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  getDoc: (ref: FakeRef) => getDocMock(ref),
}))

import { fetchMyGender } from '../api/profile'

describe('fetchMyGender', () => {
  beforeEach(() => {
    getDocMock.mockReset()
  })

  it('users/{uid} 문서에서 성별을 읽어 반환한다', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ gender: 'female', nickname: '오리' }),
    })

    await expect(fetchMyGender('u1')).resolves.toBe('female')
    expect(getDocMock).toHaveBeenCalledWith({ path: 'users/u1' })
  })

  it('문서가 없거나 값이 비정상이면 null을 반환한다', async () => {
    getDocMock.mockResolvedValueOnce({ exists: () => false })
    await expect(fetchMyGender('u1')).resolves.toBeNull()

    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ gender: 'unknown' }),
    })
    await expect(fetchMyGender('u1')).resolves.toBeNull()
  })
})
