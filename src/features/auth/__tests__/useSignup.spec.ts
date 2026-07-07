import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FirebaseError } from 'firebase/app'
import { useSignup } from '../composables/useSignup'
import type { UserProfile } from '../types'

vi.mock('../api/signup', () => ({ signup: vi.fn<typeof import('../api/signup').signup>() }))
import { signup } from '../api/signup'

const signupMock = vi.mocked(signup)

const VALID_PROFILE: UserProfile = {
  uid: 'uid-1',
  email: 'a@b.com',
  nickname: '오리',
  gender: 'male',
}

function fillValid(form: ReturnType<typeof useSignup>['form']) {
  form.email = 'a@b.com'
  form.password = 'secret1'
  form.nickname = '오리'
  form.gender = 'male'
}

describe('useSignup', () => {
  beforeEach(() => {
    signupMock.mockReset()
  })

  it('빈 값이면 필드 에러를 채우고 signup을 호출하지 않는다', async () => {
    const { fieldErrors, submit } = useSignup()

    const result = await submit()

    expect(result).toBeNull()
    expect(fieldErrors.email).toBeTruthy()
    expect(fieldErrors.password).toBeTruthy()
    expect(fieldErrors.nickname).toBeTruthy()
    expect(fieldErrors.gender).toBeTruthy()
    expect(signupMock).not.toHaveBeenCalled()
  })

  it('짧은 비밀번호는 6자 미만 에러를 낸다', async () => {
    const { form, fieldErrors, submit } = useSignup()
    fillValid(form)
    form.password = '12345'

    await submit()

    expect(fieldErrors.password).toContain('6자')
    expect(signupMock).not.toHaveBeenCalled()
  })

  it('유효하면 trim된 값으로 signup을 호출하고 프로필을 반환한다', async () => {
    signupMock.mockResolvedValue(VALID_PROFILE)
    const { form, submit } = useSignup()
    fillValid(form)
    form.email = '  a@b.com  '
    form.nickname = '  오리  '

    const result = await submit()

    expect(result).toEqual(VALID_PROFILE)
    expect(signupMock).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret1',
      nickname: '오리',
      gender: 'male',
    })
  })

  it('이미 가입된 이메일 에러를 한글 메시지로 매핑한다', async () => {
    signupMock.mockRejectedValue(new FirebaseError('auth/email-already-in-use', 'x'))
    const { form, submit, submitError } = useSignup()
    fillValid(form)

    const result = await submit()

    expect(result).toBeNull()
    expect(submitError.value).toContain('이미 가입된 이메일')
  })

  it('제출 중에는 중복 제출을 막는다', async () => {
    let resolve!: (value: UserProfile) => void
    signupMock.mockReturnValue(new Promise((r) => (resolve = r)))
    const { form, submit, isSubmitting } = useSignup()
    fillValid(form)

    const first = submit()
    expect(isSubmitting.value).toBe(true)
    const second = await submit()

    expect(second).toBeNull()
    expect(signupMock).toHaveBeenCalledTimes(1)

    resolve(VALID_PROFILE)
    await first
    expect(isSubmitting.value).toBe(false)
  })
})
