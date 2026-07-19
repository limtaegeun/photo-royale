import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SignupInput } from '../types'

vi.mock('@/shared/api/firebase', () => ({ auth: {}, db: {} }))

/** 실제 DocumentReference 대신 쓰는 식별자 — doc() mock이 만들어 set/get 호출 검증에 쓴다 */
interface FakeRef {
  collection: string
  id: string
}

const createUserMock =
  vi.fn<(auth: unknown, email: string, password: string) => Promise<{ user: unknown }>>()
const updateProfileMock =
  vi.fn<(user: unknown, profile: { displayName: string }) => Promise<void>>()
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (auth: unknown, email: string, password: string) =>
    createUserMock(auth, email, password),
  updateProfile: (user: unknown, profile: { displayName: string }) =>
    updateProfileMock(user, profile),
}))

const getDocMock = vi.fn<(ref: FakeRef) => Promise<{ exists: () => boolean }>>()
const transactionGetMock = vi.fn<(ref: FakeRef) => Promise<{ exists: () => boolean }>>()
const transactionSetMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => void>()
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string): FakeRef => ({ collection, id }),
  getDoc: (ref: FakeRef) => getDocMock(ref),
  // 실제 runTransaction의 재시도는 커밋 경합에서만 일어나므로, 콜백 1회 실행으로 충분하다
  runTransaction: (
    _db: unknown,
    fn: (transaction: { get: typeof transactionGetMock; set: typeof transactionSetMock }) => Promise<void>,
  ) => fn({ get: transactionGetMock, set: transactionSetMock }),
  serverTimestamp: () => 'server-timestamp',
}))

import { NicknameTakenError, isNicknameTaken, signup, toNicknameKey } from '../api/signup'

const INPUT: SignupInput = {
  email: 'a@b.com',
  password: 'secret1',
  nickname: '오리',
  gender: 'male',
}

function fakeUser() {
  return { uid: 'u1', delete: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) }
}

describe('toNicknameKey', () => {
  it('trim → NFC 정규화 → 소문자화로 보기에 같은 닉네임을 같은 키로 만든다', () => {
    expect(toNicknameKey('  Leo  ')).toBe('leo')
    // macOS 입력 등에서 오는 NFD(자모 분해) 한글도 같은 키가 되어야 한다
    expect(toNicknameKey('오리'.normalize('NFD'))).toBe('오리')
  })
})

describe('isNicknameTaken', () => {
  beforeEach(() => {
    getDocMock.mockReset()
  })

  it('정규화된 키로 nicknames 문서를 조회해 존재 여부를 반환한다', async () => {
    getDocMock.mockResolvedValue({ exists: () => true })

    await expect(isNicknameTaken('  Leo ')).resolves.toBe(true)

    expect(getDocMock).toHaveBeenCalledWith({ collection: 'nicknames', id: 'leo' })
  })
})

describe('signup', () => {
  beforeEach(() => {
    createUserMock.mockReset()
    updateProfileMock.mockReset()
    transactionGetMock.mockReset()
    transactionSetMock.mockReset()
    updateProfileMock.mockResolvedValue(undefined)
  })

  it('닉네임 예약과 프로필 문서를 한 트랜잭션에서 만들고 프로필을 반환한다', async () => {
    const user = fakeUser()
    createUserMock.mockResolvedValue({ user })
    transactionGetMock.mockResolvedValue({ exists: () => false })

    const profile = await signup(INPUT)

    expect(profile).toEqual({ uid: 'u1', email: 'a@b.com', nickname: '오리', gender: 'male' })
    expect(transactionSetMock).toHaveBeenCalledWith(
      { collection: 'nicknames', id: '오리' },
      { uid: 'u1' },
    )
    expect(transactionSetMock).toHaveBeenCalledWith(
      { collection: 'users', id: 'u1' },
      {
        email: 'a@b.com',
        nickname: '오리',
        nicknameKey: '오리',
        gender: 'male',
        createdAt: 'server-timestamp',
      },
    )
    expect(user.delete).not.toHaveBeenCalled()
  })

  it('닉네임이 이미 예약돼 있으면 계정을 되돌리고 NicknameTakenError를 던진다', async () => {
    const user = fakeUser()
    createUserMock.mockResolvedValue({ user })
    transactionGetMock.mockResolvedValue({ exists: () => true })

    await expect(signup(INPUT)).rejects.toBeInstanceOf(NicknameTakenError)

    expect(transactionSetMock).not.toHaveBeenCalled()
    expect(user.delete).toHaveBeenCalledOnce()
  })

  it('트랜잭션이 실패하면 계정을 되돌리고 원래 에러를 다시 던진다', async () => {
    const user = fakeUser()
    createUserMock.mockResolvedValue({ user })
    const failure = new Error('firestore down')
    transactionGetMock.mockRejectedValue(failure)

    await expect(signup(INPUT)).rejects.toBe(failure)

    expect(user.delete).toHaveBeenCalledOnce()
  })
})
