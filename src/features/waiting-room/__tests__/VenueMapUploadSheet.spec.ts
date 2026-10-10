import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

// 브라우저 인코딩(createImageBitmap·canvas)은 jsdom에 없다 — 줄인 결과만 흉내 낸다
const encodeVenueMapImageMock = vi.fn<(file: Blob) => Promise<string | null>>()
vi.mock('../venueMapImage', () => ({
  encodeVenueMapImage: (file: Blob) => encodeVenueMapImageMock(file),
}))

import VenueMapUploadSheet from '../components/VenueMapUploadSheet.vue'

const CURRENT_IMAGE = 'data:image/jpeg;base64,current-map'
const PICKED_IMAGE = 'data:image/jpeg;base64,picked-map'

/** 시트는 포털로 body에 렌더된다 — 포털 마운트를 기다린 뒤 document.body에서 확인한다 */
async function mountSheet(currentImage: string | null = null) {
  const wrapper = mount(VenueMapUploadSheet, { props: { currentImage, open: true } })
  await flushPromises()
  return wrapper
}

function fileInput() {
  return document.body.querySelector<HTMLInputElement>('input[type="file"]')!
}

async function pickFile() {
  const input = fileInput()
  Object.defineProperty(input, 'files', {
    value: [new File(['png'], 'venue.png', { type: 'image/png' })],
    configurable: true,
  })
  input.dispatchEvent(new Event('change'))
  await flushPromises()
}

function preview() {
  return document.body.querySelector<HTMLImageElement>('img[alt="행사장 지도 미리보기"]')
}

function bodyButton(text: string) {
  return [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!
}

beforeEach(() => {
  encodeVenueMapImageMock.mockReset()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('VenueMapUploadSheet', () => {
  it('파일 입력은 이미지만 고르게 하고, 화면에서는 숨겨 보조기기에도 버튼 하나만 보인다', async () => {
    await mountSheet()

    const input = fileInput()
    expect(input.accept).toBe('image/*')
    expect(input.className).toContain('sr-only')
    expect(input.getAttribute('aria-hidden')).toBe('true')
    expect(input.tabIndex).toBe(-1)
  })

  it('줄이는 동안 저장을 막고, 끝나면 미리보기를 고른 지도로 바꾼다', async () => {
    let resolveEncode!: (image: string | null) => void
    encodeVenueMapImageMock.mockReturnValueOnce(
      new Promise((resolvePromise) => {
        resolveEncode = resolvePromise
      }),
    )
    const wrapper = await mountSheet(CURRENT_IMAGE)

    const input = fileInput()
    Object.defineProperty(input, 'files', {
      value: [new File(['png'], 'venue.png', { type: 'image/png' })],
      configurable: true,
    })
    input.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(bodyButton('저장').disabled).toBe(true)
    expect(preview()?.getAttribute('src')).toBe(CURRENT_IMAGE)

    resolveEncode(PICKED_IMAGE)
    await flushPromises()

    expect(preview()?.getAttribute('src')).toBe(PICKED_IMAGE)
    bodyButton('저장').click()
    expect(wrapper.emitted('save')).toEqual([[PICKED_IMAGE]])
  })

  it('고른 파일을 비워 둬서 같은 파일을 다시 골라도 다시 줄인다', async () => {
    encodeVenueMapImageMock.mockResolvedValue(PICKED_IMAGE)
    await mountSheet()

    await pickFile()
    expect(fileInput().value).toBe('')
    await pickFile()

    expect(encodeVenueMapImageMock).toHaveBeenCalledTimes(2)
  })

  it('고르고 저장하지 않은 채 닫았다 열면 지금 등록된 지도로 돌아간다', async () => {
    encodeVenueMapImageMock.mockResolvedValue(PICKED_IMAGE)
    const wrapper = await mountSheet(CURRENT_IMAGE)
    await pickFile()
    expect(preview()?.getAttribute('src')).toBe(PICKED_IMAGE)

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await flushPromises()

    expect(preview()?.getAttribute('src')).toBe(CURRENT_IMAGE)
    expect(bodyButton('저장').disabled).toBe(true)
  })

  it('저장 중에는 다른 이미지를 고를 수 없다', async () => {
    mount(VenueMapUploadSheet, { props: { currentImage: CURRENT_IMAGE, open: true, saving: true } })
    await flushPromises()

    expect(bodyButton('이미지 고르기').disabled).toBe(true)
  })
})
