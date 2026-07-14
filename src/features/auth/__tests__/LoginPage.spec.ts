import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LoginPage from '../components/LoginPage.vue'
import LoginForm from '../components/LoginForm.vue'

// LoginForm은 stub으로 대체하므로 실제 useLogin/firebase가 실행되지 않지만,
// LoginForm.vue를 findComponent 매처로 import하는 것만으로 firebase 모듈이 로드되는 것을 막는다.
vi.mock('../api/login', () => ({ login: vi.fn<typeof import('../api/login').login>() }))

const replaceMock = vi.fn<() => void>()
const pushMock = vi.fn<() => void>()
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    replaceMock.mockReset()
    pushMock.mockReset()
  })

  it('로그인 성공 시 진입(entry) 화면으로 replace 이동한다', async () => {
    const wrapper = mount(LoginPage, {
      global: { stubs: { LoginForm: true } },
    })

    await wrapper.findComponent(LoginForm).vm.$emit('success')

    expect(replaceMock).toHaveBeenCalledWith({ name: 'entry' })
  })

  it('회원가입 버튼을 누르면 signup으로 push 이동한다', async () => {
    const wrapper = mount(LoginPage, {
      global: { stubs: { LoginForm: true } },
    })

    const signupButton = wrapper.findAll('button').find((b) => b.text().includes('계정 만들기'))!
    await signupButton.trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'signup' })
  })
})
