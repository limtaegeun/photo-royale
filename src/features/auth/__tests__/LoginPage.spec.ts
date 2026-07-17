import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LoginPage from '../LoginPage.vue'
import LoginForm from '../components/LoginForm.vue'

// LoginForm은 stub으로 대체하므로 실제 useLogin/firebase가 실행되지 않지만,
// LoginForm.vue를 findComponent 매처로 import하는 것만으로 firebase 모듈이 로드되는 것을 막는다.
vi.mock('../api/login', () => ({ login: vi.fn<typeof import('../api/login').login>() }))

const replaceMock = vi.fn<() => void>()
const pushMock = vi.fn<() => void>()
const routeState = { query: {} as Record<string, string> }
vi.mock('vue-router', () => ({
  useRoute: () => ({
    get query() {
      return routeState.query
    },
  }),
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    replaceMock.mockReset()
    pushMock.mockReset()
    routeState.query = {}
  })

  it('로그인 성공 시 진입(entry) 화면으로 replace 이동한다', async () => {
    const wrapper = mount(LoginPage, {
      global: { stubs: { LoginForm: true } },
    })

    await wrapper.findComponent(LoginForm).vm.$emit('success')

    expect(replaceMock).toHaveBeenCalledWith({ name: 'entry', query: undefined })
  })

  it('회원가입 버튼을 누르면 signup으로 push 이동한다', async () => {
    const wrapper = mount(LoginPage, {
      global: { stubs: { LoginForm: true } },
    })

    const signupButton = wrapper.findAll('button').find((b) => b.text().includes('계정 만들기'))!
    await signupButton.trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'signup', query: undefined })
  })

  it('공유 초대 코드(?code=)가 있으면 성공 리다이렉트와 회원가입 이동에 코드를 유지한다', async () => {
    routeState.query = { code: 'AB2C' }
    const wrapper = mount(LoginPage, {
      global: { stubs: { LoginForm: true } },
    })

    await wrapper.findComponent(LoginForm).vm.$emit('success')
    expect(replaceMock).toHaveBeenCalledWith({ name: 'entry', query: { code: 'AB2C' } })

    const signupButton = wrapper.findAll('button').find((b) => b.text().includes('계정 만들기'))!
    await signupButton.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'signup', query: { code: 'AB2C' } })
  })

  it('보존된 목적지(?redirect=)가 있으면 성공 시 그리로 복귀하고 회원가입 이동에도 유지한다', async () => {
    routeState.query = { redirect: '/waiting-room/AB2C' }
    const wrapper = mount(LoginPage, {
      global: { stubs: { LoginForm: true } },
    })

    await wrapper.findComponent(LoginForm).vm.$emit('success')
    expect(replaceMock).toHaveBeenCalledWith('/waiting-room/AB2C')

    const signupButton = wrapper.findAll('button').find((b) => b.text().includes('계정 만들기'))!
    await signupButton.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({
      name: 'signup',
      query: { redirect: '/waiting-room/AB2C' },
    })
  })

  it('외부 URL ?redirect=는 무시하고 entry로 복귀한다 (open redirect 방지)', async () => {
    routeState.query = { redirect: 'https://evil.com' }
    const wrapper = mount(LoginPage, {
      global: { stubs: { LoginForm: true } },
    })

    await wrapper.findComponent(LoginForm).vm.$emit('success')

    expect(replaceMock).toHaveBeenCalledWith({ name: 'entry', query: undefined })
  })
})
