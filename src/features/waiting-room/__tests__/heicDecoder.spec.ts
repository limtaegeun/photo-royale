import { describe, it, expect, vi } from 'vitest'

// 실제 파일 주소는 빌드가 정한다 — 여기서는 고정 주소로 둔다
vi.mock('heic-to?url', () => ({ default: '/assets/heic-to.js' }))

import { createHeicDecoderLoader } from '../heicDecoder'

type HeicToModule = typeof import('heic-to')
const decoderModule = { heicTo: async () => null, isHeic: async () => true } as unknown as HeicToModule

describe('createHeicDecoderLoader', () => {
  it('처음 쓸 때 한 번만 받고, 그 뒤로는 받은 모듈을 그대로 쓴다', async () => {
    const importModule = vi.fn<(url: string) => Promise<HeicToModule>>(async () => decoderModule)
    const load = createHeicDecoderLoader(importModule)

    await expect(Promise.all([load(), load()])).resolves.toEqual([decoderModule, decoderModule])
    await load()

    expect(importModule).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/assets/heic-to.js`)
  })

  it('받기에 실패하면 다음 시도는 다른 주소로 새로 받는다 — 브라우저는 실패한 주소를 다시 받지 않는다', async () => {
    const importModule = vi
      .fn<(url: string) => Promise<HeicToModule>>(async () => decoderModule)
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
    const load = createHeicDecoderLoader(importModule)

    await expect(load()).rejects.toThrow('Failed to fetch dynamically imported module')
    await expect(load()).resolves.toBe(decoderModule)
    await load()

    expect(importModule.mock.calls.map(([url]) => url)).toEqual([
      `${window.location.origin}/assets/heic-to.js`,
      `${window.location.origin}/assets/heic-to.js?retry=1`,
    ])
  })
})
