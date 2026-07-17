import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SignupPage from '../SignupPage.vue'
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
const routeState = { query: {} as Record<string, string> }
vi.mock('vue-router', () => ({
  useRoute: () => ({
    get query() {
      return routeState.query
    },
  }),
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}))

const PROFILE: UserProfile = { uid: 'u1', email: 'a@b.com', nickname: '오리', gender: 'female' }

describe('SignupPage', () => {
  beforeEach(() => {
    replaceMock.mockReset()
    pushMock.mockReset()
    routeState.query = {}
  })

  it('가입 성공 시 진입(entry) 화면으로 replace 이동한다', async () => {
    const wrapper = mount(SignupPage, {
      global: { stubs: { SignupForm: true } },
    })

    await wrapper.findComponent(SignupForm).vm.$emit('success', PROFILE)

    expect(replaceMock).toHaveBeenCalledWith({ name: 'entry', query: undefined })
  })

  it('로그인 버튼을 누르면 login으로 push 이동한다', async () => {
    const wrapper = mount(SignupPage, {
      global: { stubs: { SignupForm: true } },
    })

    const loginButton = wrapper.findAll('button').find((b) => b.text().includes('로그인'))!
    await loginButton.trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'login', query: undefined })
  })

  it('공유 초대 코드(?code=)가 있으면 성공 리다이렉트와 로그인 이동에 코드를 유지한다', async () => {
    routeState.query = { code: 'AB2C' }
    const wrapper = mount(SignupPage, {
      global: { stubs: { SignupForm: true } },
    })

    await wrapper.findComponent(SignupForm).vm.$emit('success', PROFILE)
    expect(replaceMock).toHaveBeenCalledWith({ name: 'entry', query: { code: 'AB2C' } })

    const loginButton = wrapper.findAll('button').find((b) => b.text().includes('로그인'))!
    await loginButton.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'login', query: { code: 'AB2C' } })
  })

  it('보존된 목적지(?redirect=)가 있으면 성공 시 그리로 복귀하고 로그인 이동에도 유지한다', async () => {
    routeState.query = { redirect: '/waiting-room/AB2C' }
    const wrapper = mount(SignupPage, {
      global: { stubs: { SignupForm: true } },
    })

    await wrapper.findComponent(SignupForm).vm.$emit('success', PROFILE)
    expect(replaceMock).toHaveBeenCalledWith('/waiting-room/AB2C')

    const loginButton = wrapper.findAll('button').find((b) => b.text().includes('로그인'))!
    await loginButton.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({
      name: 'login',
      query: { redirect: '/waiting-room/AB2C' },
    })
  })

  it('외부 URL ?redirect=는 무시하고 entry로 복귀한다 (open redirect 방지)', async () => {
    routeState.query = { redirect: 'https://evil.com' }
    const wrapper = mount(SignupPage, {
      global: { stubs: { SignupForm: true } },
    })

    await wrapper.findComponent(SignupForm).vm.$emit('success', PROFILE)

    expect(replaceMock).toHaveBeenCalledWith({ name: 'entry', query: undefined })
  })
})
