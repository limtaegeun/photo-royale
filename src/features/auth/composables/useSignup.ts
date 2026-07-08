import { reactive, ref } from 'vue'
import { FirebaseError } from 'firebase/app'
import { NicknameTakenError, isNicknameTaken, signup } from '../api/signup'
import type { Gender, SignupInput, UserProfile } from '../types'

// 회원가입 폼용 실무 이메일 패턴. zod가 z.string().email() 기본값으로 쓰는 것과 동일한
// 리터럴을 이식했다(런타임 zod 의존은 없음). 다음을 모두 막는다:
//  - TLD에 숫자/기호가 붙은 값(gmail.com1) — 마지막 라벨을 [A-Za-z]{2,}로 강제
//  - local part의 선행 점(.user@x.com) — (?!\.)
//  - 연속 점(user@x..com) — (?!.*\.\.)
// 출처/근거: https://colinhacks.com/essays/reasonable-email-regex,
// https://github.com/colinhacks/zod (packages/zod/src/v4/core/regexes.ts)
const EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/
const PASSWORD_MIN_LENGTH = 6 // Firebase 최소 요건
const NICKNAME_MIN_LENGTH = 2
const NICKNAME_MAX_LENGTH = 12

/**
 * Firebase 에러 코드 → 사용자용 한글 메시지. 가입 실패 확률 최소화 목표에 따라
 * 원인별로 구체적 안내를 준다. 없는 코드는 일반 메시지로 폴백한다.
 */
const FIREBASE_ERROR_MESSAGE: Record<string, string> = {
  'auth/email-already-in-use': '이미 가입된 이메일이에요. 다른 이메일을 써주세요.',
  'auth/invalid-email': '이메일 형식이 올바르지 않아요.',
  'auth/weak-password': `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 해요.`,
  'auth/network-request-failed': '네트워크 연결을 확인하고 다시 시도해주세요.',
  'auth/too-many-requests': '잠시 후 다시 시도해주세요.',
}
const DEFAULT_ERROR_MESSAGE = '가입에 실패했어요. 잠시 후 다시 시도해주세요.'
const NICKNAME_TAKEN_MESSAGE = '이미 사용 중인 닉네임이에요.'

function toErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return FIREBASE_ERROR_MESSAGE[error.code] ?? DEFAULT_ERROR_MESSAGE
  }
  return DEFAULT_ERROR_MESSAGE
}

type FormField = 'email' | 'password' | 'nickname' | 'gender'

/**
 * 회원가입 폼 로직. 제출 전 클라이언트 검증으로 예방 가능한 실패를 걸러내고(실패율 최소화),
 * 중복 제출을 막고, Firebase 에러를 한글 메시지로 매핑한다.
 * submit()은 성공 시 UserProfile, 실패 시 null을 반환한다.
 */
export function useSignup() {
  const form = reactive({
    email: '',
    password: '',
    nickname: '',
    // BaseSegmented가 string을 emit하므로 string으로 보관하고, 제출 시 Gender로 좁힌다
    gender: '',
  })

  const fieldErrors = reactive<Record<FormField, string>>({
    email: '',
    password: '',
    nickname: '',
    gender: '',
  })

  const submitError = ref('')
  const isSubmitting = ref(false)

  /**
   * 이메일 단독 검증. 필드 이탈(blur) 시점에 형식 오류를 즉시 보여주기 위해 분리했고,
   * validate()도 이를 재사용한다.
   */
  function validateEmail(): boolean {
    const email = form.email.trim()
    if (!email) {
      fieldErrors.email = '이메일을 입력해주세요.'
    } else if (!EMAIL_PATTERN.test(email)) {
      fieldErrors.email = '이메일 형식이 올바르지 않아요.'
    } else {
      fieldErrors.email = ''
    }
    return !fieldErrors.email
  }

  function validate(): boolean {
    fieldErrors.password = ''
    fieldErrors.nickname = ''
    fieldErrors.gender = ''

    validateEmail()

    if (!form.password) {
      fieldErrors.password = '비밀번호를 입력해주세요.'
    } else if (form.password.length < PASSWORD_MIN_LENGTH) {
      fieldErrors.password = `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 해요.`
    }

    const nickname = form.nickname.trim()
    if (!nickname) {
      fieldErrors.nickname = '닉네임을 입력해주세요.'
    } else if (nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) {
      fieldErrors.nickname = `닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자로 입력해주세요.`
    }

    if (!form.gender) {
      fieldErrors.gender = '성별을 선택해주세요.'
    }

    return !fieldErrors.email && !fieldErrors.password && !fieldErrors.nickname && !fieldErrors.gender
  }

  async function submit(): Promise<UserProfile | null> {
    if (isSubmitting.value) return null
    submitError.value = ''
    if (!validate()) return null

    isSubmitting.value = true
    try {
      const nickname = form.nickname.trim()
      // 닉네임은 공개 식별자라 중복을 막는다. 이 사전 검사는 빠른 피드백용(UX)이고,
      // 실제 유니크 보장은 signup()의 예약 트랜잭션 + firestore.rules가 담당한다.
      if (await isNicknameTaken(nickname)) {
        fieldErrors.nickname = NICKNAME_TAKEN_MESSAGE
        return null
      }

      const input: SignupInput = {
        email: form.email.trim(),
        password: form.password,
        nickname,
        gender: form.gender as Gender,
      }
      return await signup(input)
    } catch (error) {
      if (error instanceof NicknameTakenError) {
        // 사전 검사 통과 후 다른 가입자가 먼저 예약한 레이스 — 필드 에러로 안내한다
        fieldErrors.nickname = NICKNAME_TAKEN_MESSAGE
      } else {
        submitError.value = toErrorMessage(error)
      }
      return null
    } finally {
      isSubmitting.value = false
    }
  }

  return { form, fieldErrors, submitError, isSubmitting, validateEmail, submit }
}
