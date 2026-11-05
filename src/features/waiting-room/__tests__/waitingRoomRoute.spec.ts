import { describe, it, expect, vi } from 'vitest'
import router from '@/router'

vi.mock('@/shared/api/firebase', () => ({ auth: {}, db: {} }))

function metaOf(name: string) {
  return router.getRoutes().find((route) => route.name === name)?.meta
}

/** P15 — 홈으로 나가도 명단에 남아 게임 시작이 막히거나 혼자 게임을 놓쳐서 대기실 링크를 없앴다 */
describe('헤더 이탈 링크', () => {
  it('대기실에는 두지 않는다', () => {
    expect(metaOf('waiting-room')?.appHeaderBackTo).toBeUndefined()
  })

  it('프로필에는 남긴다 — 대기실에서 홈으로 가는 길이다', () => {
    expect(metaOf('profile')?.appHeaderBackTo).toEqual({ name: 'entry' })
    expect(metaOf('profile')?.appHeaderBackLabel).toBe('홈으로')
  })
})
