import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfilePage from '../components/ProfilePage.vue'

const logoutMock = vi.fn<() => Promise<void>>()
vi.mock('@/features/auth', () => ({
  useAuthStore: () => ({
    user: { displayName: '오리', email: 'duck@example.com' },
    logout: () => logoutMock(),
  }),
}))

const replaceMock = vi.fn<() => void>()
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: replaceMock }),
}))

describe('ProfilePage', () => {
  beforeEach(() => {
    logoutMock.mockReset()
    logoutMock.mockResolvedValue(undefined)
    replaceMock.mockReset()
  })

  it('닉네임(displayName)과 이메일을 렌더한다', () => {
    const wrapper = mount(ProfilePage)

    expect(wrapper.text()).toContain('오리')
    expect(wrapper.text()).toContain('duck@example.com')
  })

  it('로그아웃 버튼을 누르면 logout 후 랜딩(entry)으로 replace 이동한다', async () => {
    const wrapper = mount(ProfilePage)

    const logoutButton = wrapper.findAll('button').find((b) => b.text() === '로그아웃')!
    await logoutButton.trigger('click')
    await new Promise((r) => setTimeout(r))

    expect(logoutMock).toHaveBeenCalledOnce()
    expect(replaceMock).toHaveBeenCalledWith({ name: 'entry' })
  })
})
