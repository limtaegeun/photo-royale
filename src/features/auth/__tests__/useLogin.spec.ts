import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FirebaseError } from 'firebase/app'
import { useLogin } from '../composables/useLogin'

vi.mock('../api/login', () => ({ login: vi.fn<typeof import('../api/login').login>() }))
import { login } from '../api/login'

const loginMock = vi.mocked(login)

const INVALID_CREDENTIAL_MESSAGE = '이메일 또는 비밀번호가 올바르지 않아요.'

function fillValid(form: ReturnType<typeof useLogin>['form']) {
  form.email = 'user@example.com'
  form.password = 'secret1'
}

describe('useLogin', () => {
  beforeEach(() => {
    loginMock.mockReset()
  })

  it('빈 값이면 필드 에러를 채우고 login을 호출하지 않는다', async () => {
    const { fieldErrors, submit } = useLogin()

    const result = await submit()

    expect(result).toBe(false)
    expect(fieldErrors.email).toBe('이메일을 입력해주세요.')
    expect(fieldErrors.password).toBe('비밀번호를 입력해주세요.')
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('이메일 형식이 틀리면 필드 에러를 내고 login을 호출하지 않는다', async () => {
    const { form, fieldErrors, submit } = useLogin()
    form.email = 'not-an-email'
    form.password = 'secret1'

    const result = await submit()

    expect(result).toBe(false)
    expect(fieldErrors.email).toBe('이메일 형식이 올바르지 않아요.')
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('검증을 통과하면 trim한 이메일로 login을 호출하고 true를 반환한다', async () => {
    loginMock.mockResolvedValue(undefined)
    const { form, submit } = useLogin()
    form.email = '  user@example.com '
    form.password = 'secret1'

    await expect(submit()).resolves.toBe(true)

    expect(loginMock).toHaveBeenCalledWith({ email: 'user@example.com', password: 'secret1' })
  })

  it('invalid-credential은 이메일/비밀번호 불일치 메시지로 안내한다', async () => {
    loginMock.mockRejectedValue(new FirebaseError('auth/invalid-credential', 'x'))
    const { form, submitError, submit } = useLogin()
    fillValid(form)

    await expect(submit()).resolves.toBe(false)

    expect(submitError.value).toBe(INVALID_CREDENTIAL_MESSAGE)
  })

  it('구형 코드(user-not-found/wrong-password)도 같은 불일치 메시지로 수렴한다', async () => {
    const { form, submitError, submit } = useLogin()
    fillValid(form)

    loginMock.mockRejectedValue(new FirebaseError('auth/user-not-found', 'x'))
    await submit()
    expect(submitError.value).toBe(INVALID_CREDENTIAL_MESSAGE)

    loginMock.mockRejectedValue(new FirebaseError('auth/wrong-password', 'x'))
    await submit()
    expect(submitError.value).toBe(INVALID_CREDENTIAL_MESSAGE)
  })

  it('네트워크 에러를 한글 메시지로 매핑한다', async () => {
    loginMock.mockRejectedValue(new FirebaseError('auth/network-request-failed', 'x'))
    const { form, submitError, submit } = useLogin()
    fillValid(form)

    await expect(submit()).resolves.toBe(false)

    expect(submitError.value).toBe('네트워크 연결을 확인하고 다시 시도해주세요.')
  })

  it('알 수 없는 에러는 일반 실패 메시지로 폴백한다', async () => {
    loginMock.mockRejectedValue(new Error('boom'))
    const { form, submitError, submit } = useLogin()
    fillValid(form)

    await expect(submit()).resolves.toBe(false)

    expect(submitError.value).toBe('로그인에 실패했어요. 잠시 후 다시 시도해주세요.')
  })

  it('제출이 진행 중이면 재호출을 무시한다', async () => {
    let resolveLogin!: () => void
    loginMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveLogin = resolve
      }),
    )
    const { form, submit } = useLogin()
    fillValid(form)

    const first = submit()
    await expect(submit()).resolves.toBe(false)
    resolveLogin()
    await expect(first).resolves.toBe(true)

    expect(loginMock).toHaveBeenCalledOnce()
  })
})
