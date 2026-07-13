import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import BaseBottomSheet from '../BaseBottomSheet.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('BaseBottomSheet', () => {
  it('open=false면 콘텐츠를 포털에 렌더하지 않는다', () => {
    mount(BaseBottomSheet, { props: { title: '설정', open: false } })

    expect(document.body.textContent).not.toContain('설정')
  })

  it('open=true면 제목과 본문을 포털로 렌더한다', async () => {
    mount(BaseBottomSheet, {
      props: { title: '설정', open: true },
      slots: { default: '시트 본문' },
    })
    await flushPromises()

    expect(document.body.textContent).toContain('설정')
    expect(document.body.textContent).toContain('시트 본문')
  })

  it('닫기 버튼 클릭 시 update:open=false를 emit한다', async () => {
    const wrapper = mount(BaseBottomSheet, { props: { title: '설정', open: true } })
    await flushPromises()

    const close = document.body.querySelector<HTMLElement>('[aria-label="닫기"]')
    expect(close).not.toBeNull()
    close!.click()
    await flushPromises()

    const events = wrapper.emitted('update:open')
    expect(events?.[events.length - 1]).toEqual([false])
  })
})
