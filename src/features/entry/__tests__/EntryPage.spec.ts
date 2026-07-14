import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import EntryPage from '../EntryPage.vue'

// 테스트마다 로그인/비로그인 상태를 바꿀 수 있도록 getter로 참조한다
const authState = { user: null as { displayName: string } | null }
vi.mock('@/features/auth', () => ({
  useAuthStore: () => ({
    get user() {
      return authState.user
    },
    get isLoggedIn() {
      return authState.user !== null
    },
  }),
}))

const pushMock = vi.fn<() => void>()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

describe('EntryPage', () => {
  beforeEach(() => {
    authState.user = { displayName: '오리' }
    pushMock.mockReset()
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

  it('로그인 상태면 입장하기만 렌더하고 로그인·회원가입 버튼은 없다', () => {
    const wrapper = mount(EntryPage)

    expect(findButton(wrapper, '입장하기')).toBeDefined()
    expect(findButton(wrapper, '로그인')).toBeUndefined()
    expect(findButton(wrapper, '계정 만들기')).toBeUndefined()
  })

  it('비로그인이면 로그인·회원가입 CTA를 렌더하고 입장하기/인사는 없다', () => {
    authState.user = null
    const wrapper = mount(EntryPage)

    expect(findButton(wrapper, '로그인')).toBeDefined()
    expect(findButton(wrapper, '계정 만들기')).toBeDefined()
    expect(findButton(wrapper, '입장하기')).toBeUndefined()
    expect(wrapper.text()).not.toContain('준비됐나요?')
  })

  it('비로그인 CTA를 누르면 각각 login/signup으로 push 이동한다', async () => {
    authState.user = null
    const wrapper = mount(EntryPage)

    await findButton(wrapper, '로그인')!.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'login' })

    await findButton(wrapper, '계정 만들기')!.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'signup' })
  })
})
