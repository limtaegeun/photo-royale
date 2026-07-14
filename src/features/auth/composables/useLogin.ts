import { reactive, ref } from 'vue'
import { login } from '../api/login'
import { COMMON_AUTH_ERROR_MESSAGE, toAuthErrorMessage } from '../errorMessages'
import { emailFieldError } from '../validation'

// Firebase는 이메일 열거 방지(email enumeration protection) 기본 활성화 상태에서
// 미가입 이메일과 비밀번호 오류를 구분해주지 않고 invalid-credential 하나로 응답한다.
// 구분이 남아 있는 구형 설정의 코드(user-not-found/wrong-password)도 같은 메시지로 수렴시킨다.
const INVALID_CREDENTIAL_MESSAGE = '이메일 또는 비밀번호가 올바르지 않아요.'

/** Firebase 에러 코드 → 사용자용 한글 메시지. 없는 코드는 일반 메시지로 폴백한다. */
const LOGIN_ERROR_MESSAGE: Record<string, string> = {
  ...COMMON_AUTH_ERROR_MESSAGE,
  'auth/invalid-credential': INVALID_CREDENTIAL_MESSAGE,
  'auth/user-not-found': INVALID_CREDENTIAL_MESSAGE,
  'auth/wrong-password': INVALID_CREDENTIAL_MESSAGE,
  'auth/invalid-email': '이메일 형식이 올바르지 않아요.',
  'auth/user-disabled': '이용이 제한된 계정이에요.',
}
const DEFAULT_ERROR_MESSAGE = '로그인에 실패했어요. 잠시 후 다시 시도해주세요.'

type FormField = 'email' | 'password'

/**
 * 로그인 폼 로직. useSignup과 같은 구조(fieldErrors/submitError/isSubmitting)로,
 * 제출 전 클라이언트 검증과 중복 제출 방지, Firebase 에러 한글 매핑을 담당한다.
 * submit()은 성공 여부를 boolean으로 반환한다(세션 반영은 useAuthStore 몫).
 */
export function useLogin() {
  const form = reactive({
    email: '',
    password: '',
  })

  const fieldErrors = reactive<Record<FormField, string>>({
    email: '',
    password: '',
  })

  const submitError = ref('')
  const isSubmitting = ref(false)

  /** 이메일 단독 검증 — 필드 이탈(blur) 시 즉시 피드백. validate()도 재사용한다. */
  function validateEmail(): boolean {
    fieldErrors.email = emailFieldError(form.email)
    return !fieldErrors.email
  }

  function validate(): boolean {
    validateEmail()
    // 기존 계정 확인이 목적이라 비밀번호는 입력 여부만 본다(길이 규칙은 가입 폼 소관)
    fieldErrors.password = form.password ? '' : '비밀번호를 입력해주세요.'
    return !fieldErrors.email && !fieldErrors.password
  }

  async function submit(): Promise<boolean> {
    if (isSubmitting.value) return false
    submitError.value = ''
    if (!validate()) return false

    isSubmitting.value = true
    try {
      await login({ email: form.email.trim(), password: form.password })
      return true
    } catch (error) {
      submitError.value = toAuthErrorMessage(error, LOGIN_ERROR_MESSAGE, DEFAULT_ERROR_MESSAGE)
      return false
    } finally {
      isSubmitting.value = false
    }
  }

  return { form, fieldErrors, submitError, isSubmitting, validateEmail, submit }
}
