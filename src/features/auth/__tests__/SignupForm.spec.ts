import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SignupForm from '../components/SignupForm.vue'
import type { UserProfile } from '../types'

vi.mock('../api/signup', () => ({ signup: vi.fn<typeof import('../api/signup').signup>() }))
import { signup } from '../api/signup'

const signupMock = vi.mocked(signup)

const PROFILE: UserProfile = { uid: 'u1', email: 'a@b.com', nickname: '오리', gender: 'female' }

describe('SignupForm', () => {
  beforeEach(() => {
    signupMock.mockReset()
  })

  it('이메일/비번/닉네임 입력과 성별 선택 UI를 한 폼에 렌더한다', () => {
    const wrapper = mount(SignupForm)

    expect(wrapper.find('#signup-email').exists()).toBe(true)
    expect(wrapper.find('#signup-password').exists()).toBe(true)
    expect(wrapper.find('#signup-nickname').exists()).toBe(true)
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(2)
  })

  it('유효하지 않으면 제출해도 signup을 호출하지 않고 에러를 보여준다', async () => {
    const wrapper = mount(SignupForm)

    await wrapper.find('form').trigger('submit')

    expect(signupMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('이메일을 입력해주세요.')
  })

  it('이메일 필드에서 벗어나면(blur) 형식 오류를 즉시 보여준다', async () => {
    const wrapper = mount(SignupForm)

    const email = wrapper.find('#signup-email')
    await email.setValue('not-an-email')
    await email.trigger('blur')

    expect(wrapper.text()).toContain('이메일 형식이 올바르지 않아요.')
    expect(signupMock).not.toHaveBeenCalled()
  })

  it('폼을 채워 제출하면 signup 성공 시 success 이벤트를 emit한다', async () => {
    signupMock.mockResolvedValue(PROFILE)
    const wrapper = mount(SignupForm)

    await wrapper.find('#signup-email').setValue('a@b.com')
    await wrapper.find('#signup-password').setValue('secret1')
    await wrapper.find('#signup-nickname').setValue('오리')
    await wrapper.findAll('[role="radio"]')[1]!.trigger('click') // 여성
    await wrapper.find('form').trigger('submit')
    await new Promise((r) => setTimeout(r))

    expect(signupMock).toHaveBeenCalledOnce()
    expect(wrapper.emitted('success')?.[0]).toEqual([PROFILE])
  })
})
