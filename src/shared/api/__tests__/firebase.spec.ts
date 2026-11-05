import { describe, it, expect, vi } from 'vitest'

const initializeFirestoreMock = vi.fn<(app: unknown, settings: unknown) => { type: string }>(() => ({
  type: 'firestore',
}))

vi.mock('firebase/app', () => ({ initializeApp: () => ({ name: 'app' }) }))
vi.mock('firebase/auth', () => ({ getAuth: () => ({ type: 'auth' }) }))
vi.mock('firebase/firestore', () => ({
  initializeFirestore: (app: unknown, settings: unknown) => initializeFirestoreMock(app, settings),
}))

describe('firebase 초기화', () => {
  it('Firestore 전송을 long polling으로 고정한다 — Safari가 스트리밍 응답을 묶어 두는 것을 피한다', async () => {
    const { db } = await import('../firebase')

    expect(db).toEqual({ type: 'firestore' })
    expect(initializeFirestoreMock).toHaveBeenCalledTimes(1)
    expect(initializeFirestoreMock.mock.calls[0]![1]).toEqual({ experimentalForceLongPolling: true })
  })
})
