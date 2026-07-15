import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import BaseDialog from '../BaseDialog.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('BaseDialog', () => {
  it('open=false면 콘텐츠를 포털에 렌더하지 않는다', () => {
    mount(BaseDialog, { props: { title: '초대장', open: false } })

    expect(document.body.textContent).not.toContain('초대장')
  })

  it('open=true면 제목·설명·본문을 포털로 렌더한다', async () => {
    mount(BaseDialog, {
      props: { title: '초대장', description: '팀에 합류하세요', open: true },
      slots: { default: '본문 내용' },
    })
    await flushPromises()

    expect(document.body.textContent).toContain('초대장')
    expect(document.body.textContent).toContain('팀에 합류하세요')
    expect(document.body.textContent).toContain('본문 내용')
  })

  it('닫기 버튼 클릭 시 update:open=false를 emit한다', async () => {
    const wrapper = mount(BaseDialog, { props: { title: '초대장', open: true } })
    await flushPromises()

    const close = document.body.querySelector<HTMLElement>('[aria-label="닫기"]')
    expect(close).not.toBeNull()
    close!.click()
    await flushPromises()

    const events = wrapper.emitted('update:open')
    expect(events?.[events.length - 1]).toEqual([false])
  })
})
