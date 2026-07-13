import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { FirebaseError } from 'firebase/app'
import LoginForm from '../components/LoginForm.vue'

vi.mock('../api/login', () => ({ login: vi.fn<typeof import('../api/login').login>() }))
import { login } from '../api/login'

const loginMock = vi.mocked(login)

async function fillAndSubmit(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('#login-email').setValue('user@example.com')
  await wrapper.find('#login-password').setValue('secret1')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('LoginForm', () => {
  beforeEach(() => {
    loginMock.mockReset()
  })

  it('이메일/비밀번호 입력과 로그인 버튼을 렌더한다', () => {
    const wrapper = mount(LoginForm)

    expect(wrapper.find('#login-email').exists()).toBe(true)
    expect(wrapper.find('#login-password').attributes('type')).toBe('password')
    expect(wrapper.find('button[type="submit"]').text()).toBe('로그인')
  })

  it('로그인 성공 시 success를 emit한다', async () => {
    loginMock.mockResolvedValue(undefined)
    const wrapper = mount(LoginForm)

    await fillAndSubmit(wrapper)

    expect(wrapper.emitted('success')).toHaveLength(1)
  })

  it('로그인 실패 시 에러 메시지를 보여주고 success를 emit하지 않는다', async () => {
    loginMock.mockRejectedValue(new FirebaseError('auth/invalid-credential', 'x'))
    const wrapper = mount(LoginForm)

    await fillAndSubmit(wrapper)

    expect(wrapper.find('[role="alert"]').text()).toBe('이메일 또는 비밀번호가 올바르지 않아요.')
    expect(wrapper.emitted('success')).toBeUndefined()
  })

  it('빈 폼 제출 시 필드 에러를 보여주고 login을 호출하지 않는다', async () => {
    const wrapper = mount(LoginForm)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('이메일을 입력해주세요.')
    expect(wrapper.text()).toContain('비밀번호를 입력해주세요.')
    expect(loginMock).not.toHaveBeenCalled()
  })
})
