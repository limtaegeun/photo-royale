import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimeoutError, withTimeout } from '../withTimeout'

afterEach(() => {
  vi.useRealTimers()
})

describe('withTimeout', () => {
  it('시간 안에 끝나면 그 결과를 그대로 돌려준다', async () => {
    await expect(withTimeout(Promise.resolve('완료'), 1000)).resolves.toBe('완료')
  })

  it('시간 안에 실패하면 그 오류를 그대로 돌려준다', async () => {
    const error = new Error('거부')
    await expect(withTimeout(Promise.reject(error), 1000)).rejects.toBe(error)
  })

  it('시간이 지나면 TimeoutError로 끝난다', async () => {
    vi.useFakeTimers()
    const settled = withTimeout(new Promise(() => {}), 1000).catch((error: unknown) => error)

    await vi.advanceTimersByTimeAsync(1000)

    expect(await settled).toBeInstanceOf(TimeoutError)
  })
})
