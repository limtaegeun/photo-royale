import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import EntryPage from '../EntryPage.vue'

const logoutMock = vi.fn<() => Promise<void>>()
vi.mock('@/features/auth', () => ({
  useAuthStore: () => ({ user: { displayName: '오리' }, logout: () => logoutMock() }),
}))

const replaceMock = vi.fn<() => void>()
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: replaceMock }),
}))

describe('EntryPage', () => {
  beforeEach(() => {
    logoutMock.mockReset()
    logoutMock.mockResolvedValue(undefined)
    replaceMock.mockReset()
  })

  it('로그인한 사용자의 닉네임(displayName)으로 인사를 렌더한다', () => {
    const wrapper = mount(EntryPage)

    expect(wrapper.text()).toContain('오리님, 준비됐나요?')
  })

  it('폐기된 비로그인 입장 폼(닉네임/성별 입력)을 렌더하지 않는다', () => {
    const wrapper = mount(EntryPage)

    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(0)
  })

  it('로그아웃 버튼을 누르면 logout 후 signup으로 replace 이동한다', async () => {
    const wrapper = mount(EntryPage)

    const logoutButton = wrapper.findAll('button').find((b) => b.text() === '로그아웃')!
    await logoutButton.trigger('click')
    await new Promise((r) => setTimeout(r))

    expect(logoutMock).toHaveBeenCalledOnce()
    expect(replaceMock).toHaveBeenCalledWith({ name: 'signup' })
  })
})
