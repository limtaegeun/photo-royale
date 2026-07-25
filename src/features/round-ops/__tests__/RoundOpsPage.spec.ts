import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const toastMock = vi.fn<(options: { title: string; tone?: string }) => number>()
vi.mock('@/shared/composables/useToast', () => ({
  useToast: () => ({ toast: toastMock, dismissAll: vi.fn<() => void>() }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { roomCode: 'ab2c' } }),
}))

import RoundOpsPage from '../RoundOpsPage.vue'

function mountPage() {
  return mount(RoundOpsPage)
}

function findButton(wrapper: ReturnType<typeof mountPage>, text: string) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

describe('RoundOpsPage', () => {
  beforeEach(() => {
    toastMock.mockReset()
  })

  it('경로의 방 코드를 정규화해 보여주고 운영 컨트롤 골격을 렌더한다', () => {
    const wrapper = mountPage()

    expect(wrapper.text()).toContain('AB2C')
    expect(wrapper.text()).toContain('LIVE')
    // 스켈레톤임을 화면에서 밝힌다 — 예시 값을 실제 라운드 상태로 오인하지 않게 한다
    expect(wrapper.text()).toContain('운영 기능은 준비 중이에요')
    for (const label of ['일시정지', '재개', '-1분', '+1분', '반영', '공지', '판정']) {
      expect(findButton(wrapper, label)).toBeDefined()
    }
  })

  it('운영 컨트롤을 누르면 준비 중 안내 토스트를 띄운다', async () => {
    const wrapper = mountPage()

    await findButton(wrapper, '일시정지')!.trigger('click')

    expect(toastMock).toHaveBeenCalledWith({ title: '운영 컨트롤은 다음 단계에서 연결돼요.' })
  })

  it('판정·기록 탭은 준비 중 안내로 대체된다', async () => {
    const wrapper = mountPage()

    await wrapper.find('[data-value="judge"]').trigger('click')

    expect(wrapper.text()).toContain('판정 화면 준비 중')
    expect(findButton(wrapper, '일시정지')).toBeUndefined()
  })
})
