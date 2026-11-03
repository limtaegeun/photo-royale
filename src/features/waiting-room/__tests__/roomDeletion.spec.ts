import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

interface FakeRef {
  path: string
}

/** 쓰기 순서를 한 줄로 기록한다 — 배치는 커밋될 때 그 안의 삭제를 한꺼번에 남긴다 */
const writeLog: string[] = []
const getDocMock =
  vi.fn<(ref: FakeRef) => Promise<{ exists: () => boolean; data: () => Record<string, unknown> }>>()
const countMock = vi.fn<(ref: FakeRef) => Promise<{ data: () => { count: number } }>>()
const updateDocMock = vi.fn<(ref: FakeRef, data: Record<string, unknown>) => Promise<void>>()
const commitMock = vi.fn<(deletes: string[]) => Promise<void>>()

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  collection: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join('/') }),
  getDoc: (ref: FakeRef) => getDocMock(ref),
  getCountFromServer: (ref: FakeRef) => countMock(ref),
  updateDoc: (ref: FakeRef, data: Record<string, unknown>) => updateDocMock(ref, data),
  deleteField: () => 'delete-field',
  writeBatch: () => {
    const deletes: string[] = []
    return {
      delete: (ref: FakeRef) => deletes.push(ref.path),
      commit: () => commitMock(deletes),
    }
  },
}))

const getIdTokenMock = vi.fn<() => Promise<string>>()
const authState: { currentUser: { getIdToken: () => Promise<string> } | null } = {
  currentUser: { getIdToken: () => getIdTokenMock() },
}
vi.mock('@/shared/api/firebase', () => ({
  db: { app: { options: { projectId: 'photo-royale-test' } } },
  get auth() {
    return authState
  },
}))

import { deleteRoom, fetchRoomDeletionSummary, ROOM_CHILD_COLLECTIONS } from '../api/roomDeletion'

/** runQuery 응답 — 문서 이름만 든 행. 비면 readTime만 든 행 하나가 온다(실서버 모양) */
function runQueryRows(code: string, name: string, ids: string[]) {
  if (ids.length === 0) return [{ readTime: '2026-11-03T00:00:00Z' }]
  return ids.map((id) => ({
    document: {
      name: `projects/photo-royale-test/databases/(default)/documents/rooms/${code}/${name}/${id}`,
    },
    readTime: '2026-11-03T00:00:00Z',
  }))
}

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()

/** 컬렉션별 문서 ID를 주면 runQuery fetch를 그 내용으로 응답시킨다 */
function serveChildren(code: string, children: Partial<Record<string, string[]>>) {
  fetchMock.mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init.body)) as {
      structuredQuery: { from: Array<{ collectionId: string }> }
    }
    const name = body.structuredQuery.from[0]!.collectionId
    writeLog.push(`list ${name}`)
    return new Response(JSON.stringify(runQueryRows(code, name, children[name] ?? [])), {
      status: 200,
    })
  })
}

describe('fetchRoomDeletionSummary', () => {
  beforeEach(() => {
    getDocMock.mockReset()
    countMock.mockReset()
  })

  it('방이 없으면 null', async () => {
    getDocMock.mockResolvedValue({ exists: () => false, data: () => ({}) })

    expect(await fetchRoomDeletionSummary('AB2C')).toBeNull()
    expect(countMock).not.toHaveBeenCalled()
  })

  it('방 상태와 하위 컬렉션 다섯 곳의 개수를 집계로 센다', async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'playing' }) })
    const counts: Record<string, number> = {
      'rooms/AB2C/participants': 12,
      'rooms/AB2C/submissions': 34,
      'rooms/AB2C/rounds': 3,
      'rooms/AB2C/notices': 2,
      'rooms/AB2C/assets': 1,
    }
    countMock.mockImplementation(async (ref) => ({ data: () => ({ count: counts[ref.path]! }) }))

    expect(await fetchRoomDeletionSummary('AB2C')).toEqual({
      status: 'playing',
      counts: { participants: 12, submissions: 34, rounds: 3, notices: 2, assets: 1 },
    })
  })
})

describe('deleteRoom', () => {
  beforeEach(() => {
    writeLog.length = 0
    updateDocMock.mockReset()
    updateDocMock.mockImplementation(async (ref, data) => {
      writeLog.push(`update ${ref.path} ${JSON.stringify(data)}`)
    })
    commitMock.mockReset()
    commitMock.mockImplementation(async (deletes) => {
      writeLog.push(`commit ${deletes.join(',')}`)
    })
    getIdTokenMock.mockReset()
    getIdTokenMock.mockResolvedValue('id-token')
    authState.currentUser = { getIdToken: () => getIdTokenMock() }
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('방을 닫고 → 킬샷·원장·공지·지도 → 참가자와 방 문서를 한 배치로 지운다', async () => {
    serveChildren('AB2C', {
      submissions: ['s1', 's2'],
      rounds: ['1', '2'],
      notices: ['n1'],
      assets: ['venueMap'],
      participants: ['u1', 'u2'],
    })

    await deleteRoom('AB2C')

    expect(writeLog).toEqual([
      'update rooms/AB2C {"status":"waiting","round":"delete-field","deleting":true}',
      'list submissions',
      'commit rooms/AB2C/submissions/s1,rooms/AB2C/submissions/s2',
      'list rounds',
      'commit rooms/AB2C/rounds/1,rooms/AB2C/rounds/2',
      'list notices',
      'commit rooms/AB2C/notices/n1',
      'list assets',
      'commit rooms/AB2C/assets/venueMap',
      'list participants',
      'commit rooms/AB2C/participants/u1,rooms/AB2C/participants/u2,rooms/AB2C',
    ])
  })

  it('목록은 진행자 토큰으로 문서 이름만 받는다(사진·지도를 내려받지 않는다)', async () => {
    serveChildren('AB2C', {})

    await deleteRoom('AB2C')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(
      'https://firestore.googleapis.com/v1/projects/photo-royale-test/databases/(default)/documents/rooms/AB2C:runQuery',
    )
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer id-token')
    expect(JSON.parse(String(init.body))).toEqual({
      structuredQuery: {
        from: [{ collectionId: 'submissions' }],
        select: { fields: [{ fieldPath: '__name__' }] },
      },
    })
  })

  it('하위 문서가 없는 방은 빈 배치를 커밋하지 않고 방 문서만 지운다', async () => {
    serveChildren('AB2C', {})

    await deleteRoom('AB2C')

    expect(writeLog.filter((line) => line.startsWith('commit'))).toEqual(['commit rooms/AB2C'])
  })

  it('쓰기 상한(500)을 넘으면 배치를 나누고, 방 문서는 마지막 배치에 싣는다', async () => {
    const submissionIds = Array.from({ length: 1001 }, (_, i) => `s${i}`)
    const participantIds = Array.from({ length: 499 }, (_, i) => `u${i}`)
    serveChildren('AB2C', { submissions: submissionIds, participants: participantIds })

    await deleteRoom('AB2C')

    const sizes = commitMock.mock.calls.map(([deletes]) => deletes.length)
    // 킬샷 500 · 500 · 1, 참가자 499 + 방 1
    expect(sizes).toEqual([500, 500, 1, 500])
    expect(commitMock.mock.calls.slice(-1)[0]![0].slice(-1)[0]).toBe('rooms/AB2C')
  })

  it('목록을 읽지 못하면 멈추고 방 문서는 남긴다(다시 지울 수 있게)', async () => {
    fetchMock.mockResolvedValue(new Response('denied', { status: 403 }))

    await expect(deleteRoom('AB2C')).rejects.toThrow('submissions')
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('로그인이 없으면 방을 닫은 뒤 목록 단계에서 멈춘다', async () => {
    authState.currentUser = null

    await expect(deleteRoom('AB2C')).rejects.toThrow('로그인')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('firestore.rules 동기화', () => {
  const rules = readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8')

  it('하위 컬렉션 다섯 곳 모두에 방 삭제 갈래가 있다 — 빠지면 그 컬렉션에서 삭제가 멈춘다', () => {
    for (const name of ROOM_CHILD_COLLECTIONS) {
      const block = rules.slice(rules.indexOf(`match /${name}/`))
      const end = block.indexOf('\n      }')
      expect({
        name,
        hasBranch: block.slice(0, end).includes('isDeletingRoomHost(roomCode)'),
      }).toEqual({
        name,
        hasBranch: true,
      })
    }
  })

  it('방 문서 삭제와 방 닫기 갈래가 삭제 표식(deleting)을 쓴다', () => {
    expect(rules).toContain("hasOnly(['status', 'round', 'deleting'])")
    expect(rules).toMatch(
      /allow delete: if request\.auth != null\s+&& request\.auth\.uid == resource\.data\.hostUid\s+&& resource\.data\.get\('deleting', false\) == true;/,
    )
  })
})
