import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/api/firebase', () => ({ db: {} }))

/** 실제 CollectionReference 대신 쓰는 식별자 — collection() mock이 만들어 호출 검증에 쓴다 */
interface FakeRef {
  path: string
}

const addDocMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => Promise<void>>()
const onSnapshotMock = vi.fn<(query: unknown, onNext: (snapshot: unknown) => void) => () => void>()

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  query: (source: FakeRef, ...constraints: unknown[]) => ({ source, constraints }),
  orderBy: (field: string, direction: string) => ({ orderBy: field, direction }),
  limit: (count: number) => ({ limit: count }),
  onSnapshot: (query: unknown, onNext: (snapshot: unknown) => void) => onSnapshotMock(query, onNext),
  serverTimestamp: () => 'server-timestamp',
  addDoc: (ref: FakeRef, data: Record<string, unknown>) => addDocMock(ref, data),
}))

import { NOTICE_TEXT_MAX_LENGTH, sendNotice, subscribeToLatestNotice } from '../api/notices'

beforeEach(() => {
  addDocMock.mockReset().mockResolvedValue(undefined)
  onSnapshotMock.mockReset()
})

describe('sendNotice', () => {
  it('notices 서브컬렉션에 본문과 서버 시각을 append한다', async () => {
    await sendNotice('AB2C', '보급품 A 지점에 배치했습니다')

    expect(addDocMock).toHaveBeenCalledExactlyOnceWith(
      { path: 'rooms/AB2C/notices' },
      { text: '보급품 A 지점에 배치했습니다', createdAt: 'server-timestamp' },
    )
  })

  it('앞뒤 공백을 제거해 저장한다 — 공백만 남은 공지가 이력에 쌓이지 않게', async () => {
    await sendNotice('AB2C', '  집합  ')

    expect(addDocMock.mock.calls[0]![1]).toMatchObject({ text: '집합' })
  })
})

describe('subscribeToLatestNotice', () => {
  it('최신순 1건 쿼리를 걸고 스냅샷을 Notice로 매핑한다', () => {
    const unsubscribe = vi.fn<() => void>()
    onSnapshotMock.mockReturnValue(unsubscribe)
    const onChange = vi.fn<(notice: unknown) => void>()

    const result = subscribeToLatestNotice('AB2C', onChange)

    const [noticeQuery, onNext] = onSnapshotMock.mock.calls[0]!
    expect(noticeQuery).toEqual({
      source: { path: 'rooms/AB2C/notices' },
      constraints: [{ orderBy: 'createdAt', direction: 'desc' }, { limit: 1 }],
    })

    onNext({
      docs: [
        {
          id: 'n1',
          data: () => ({ text: '집합', createdAt: { toMillis: () => 1_700_000_000_000 } }),
        },
      ],
    })
    expect(onChange).toHaveBeenCalledWith({
      id: 'n1',
      text: '집합',
      createdAtMs: 1_700_000_000_000,
    })
    expect(result).toBe(unsubscribe)
  })

  it('공지가 없으면 null, serverTimestamp 반영 전이면 시각을 null로 전달한다', () => {
    onSnapshotMock.mockReturnValue(vi.fn<() => void>())
    const onChange = vi.fn<(notice: unknown) => void>()

    subscribeToLatestNotice('AB2C', onChange)
    const onNext = onSnapshotMock.mock.calls[0]![1]

    onNext({ docs: [] })
    expect(onChange).toHaveBeenLastCalledWith(null)

    onNext({ docs: [{ id: 'n1', data: () => ({ text: '집합', createdAt: null }) }] })
    expect(onChange).toHaveBeenLastCalledWith({ id: 'n1', text: '집합', createdAtMs: null })
  })
})

/**
 * 공지 길이 상한은 rules와의 이중 정의다 — 한쪽만 늘리면 앱이 보낸 공지가 403으로 사라진다.
 * rules 파일을 직접 읽어 숫자와 갈래 존재를 대조한다(rooms.spec의 패턴 동기화 테스트 답습).
 */
describe('firestore.rules 공지 규칙 동기화 가드', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')

  it('rules의 text 길이 상한이 NOTICE_TEXT_MAX_LENGTH와 숫자까지 동일하다', () => {
    const match = rules.match(/request\.resource\.data\.text\.size\(\) <= (\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBe(NOTICE_TEXT_MAX_LENGTH)
  })

  it('notices 갈래가 존재하고 수정·삭제를 막는다', () => {
    expect(rules).toContain('match /notices/{noticeId}')
    expect(rules).toMatch(/match \/notices\/\{noticeId\}[\s\S]*?allow update, delete: if false;/)
  })
})
