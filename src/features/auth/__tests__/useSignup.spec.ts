import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FirebaseError } from 'firebase/app'
import { useSignup } from '../composables/useSignup'
import type { UserProfile } from '../types'

vi.mock('../api/signup', () => ({
  signup: vi.fn<typeof import('../api/signup').signup>(),
  isNicknameTaken: vi.fn<typeof import('../api/signup').isNicknameTaken>(),
  // 실제 모듈은 firebase 초기화를 끌고 오므로 클래스도 mock에서 재정의한다.
  // useSignup의 instanceof 판별도 이 mock 클래스를 보므로 그대로 성립한다.
  NicknameTakenError: class NicknameTakenError extends Error {},
}))
import { NicknameTakenError, isNicknameTaken, signup } from '../api/signup'

const signupMock = vi.mocked(signup)
const isNicknameTakenMock = vi.mocked(isNicknameTaken)

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
    isNicknameTakenMock.mockReset()
    isNicknameTakenMock.mockResolvedValue(false)
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

  it('이메일 형식이 올바르지 않으면 에러를 내고 signup을 호출하지 않는다', async () => {
    const { form, fieldErrors, submit } = useSignup()
    fillValid(form)
    form.email = 'not-an-email'

    const result = await submit()

    expect(result).toBeNull()
    expect(fieldErrors.email).toContain('형식')
    expect(signupMock).not.toHaveBeenCalled()
  })

  // 엄격 검증 패턴(zod 기본값 이식)이 막아야 하는 대표 케이스들
  it.each([
    ['TLD 뒤 숫자', 'khj981116@gmail.com1'],
    ['1자 TLD', 'a@b.c'],
    ['local part 선행 점', '.user@gmail.com'],
    ['연속 점', 'user@gmail..com'],
    ['@ 없음', 'not-an-email'],
  ])('잘못된 이메일(%s)은 형식 오류로 잡고 signup을 호출하지 않는다', async (_label, email) => {
    const { form, fieldErrors, submit } = useSignup()
    fillValid(form)
    form.email = email

    const result = await submit()

    expect(result).toBeNull()
    expect(fieldErrors.email).toContain('형식')
    expect(signupMock).not.toHaveBeenCalled()
  })

  // 실제로 쓰이는 정상 이메일은 통과해야 한다(과잉 차단 방지)
  it.each(['a@b.com', 'user+tag@sub.domain.co.kr', 'khj981116@gmail.com'])(
    '유효한 이메일(%s)은 validateEmail을 통과한다',
    (email) => {
      const { form, validateEmail } = useSignup()
      form.email = email
      expect(validateEmail()).toBe(true)
    },
  )

  it('validateEmail은 형식 오류를 잡고, 값을 고치면 에러를 지운다', () => {
    const { form, fieldErrors, validateEmail } = useSignup()

    form.email = 'not-an-email'
    expect(validateEmail()).toBe(false)
    expect(fieldErrors.email).toContain('형식')

    form.email = 'a@b.com'
    expect(validateEmail()).toBe(true)
    expect(fieldErrors.email).toBe('')
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

  it('닉네임이 중복이면 필드 에러를 내고 signup을 호출하지 않는다', async () => {
    isNicknameTakenMock.mockResolvedValue(true)
    const { form, fieldErrors, submit } = useSignup()
    fillValid(form)

    const result = await submit()

    expect(result).toBeNull()
    expect(fieldErrors.nickname).toContain('이미 사용 중인')
    expect(isNicknameTakenMock).toHaveBeenCalledWith('오리')
    expect(signupMock).not.toHaveBeenCalled()
  })

  it('사전 검사 통과 후 레이스로 NicknameTakenError가 오면 닉네임 필드 에러로 보여준다', async () => {
    signupMock.mockRejectedValue(new NicknameTakenError())
    const { form, fieldErrors, submitError, submit } = useSignup()
    fillValid(form)

    const result = await submit()

    expect(result).toBeNull()
    expect(fieldErrors.nickname).toContain('이미 사용 중인')
    expect(submitError.value).toBe('')
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
