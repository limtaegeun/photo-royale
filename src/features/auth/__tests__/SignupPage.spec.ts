import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SignupPage from '../components/SignupPage.vue'
import SignupForm from '../components/SignupForm.vue'
import type { UserProfile } from '../types'

// SignupForm은 stub으로 대체하므로 실제 useSignup/firebase가 실행되지 않지만,
// SignupForm.vue를 findComponent 매처로 import하는 것만으로 firebase 모듈이 로드되는 것을 막는다.
vi.mock('../api/signup', () => ({
  signup: vi.fn<typeof import('../api/signup').signup>(),
  isNicknameTaken: vi.fn<typeof import('../api/signup').isNicknameTaken>(),
  NicknameTakenError: class NicknameTakenError extends Error {},
}))

const replaceMock = vi.fn<() => void>()
const pushMock = vi.fn<() => void>()
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}))

const PROFILE: UserProfile = { uid: 'u1', email: 'a@b.com', nickname: '오리', gender: 'female' }

describe('SignupPage', () => {
  beforeEach(() => {
    replaceMock.mockReset()
    pushMock.mockReset()
  })

  it('가입 성공 시 진입(entry) 화면으로 replace 이동한다', async () => {
    const wrapper = mount(SignupPage, {
      global: { stubs: { SignupForm: true } },
    })

    await wrapper.findComponent(SignupForm).vm.$emit('success', PROFILE)

    expect(replaceMock).toHaveBeenCalledWith({ name: 'entry' })
  })

  it('로그인 버튼을 누르면 login으로 push 이동한다', async () => {
    const wrapper = mount(SignupPage, {
      global: { stubs: { SignupForm: true } },
    })

    const loginButton = wrapper.findAll('button').find((b) => b.text().includes('로그인'))!
    await loginButton.trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'login' })
  })
})
