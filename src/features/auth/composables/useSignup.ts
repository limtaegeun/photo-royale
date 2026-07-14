import { reactive, ref } from 'vue'
import { NicknameTakenError, isNicknameTaken, signup } from '../api/signup'
import { COMMON_AUTH_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE, toAuthErrorMessage } from '../errorMessages'
import { emailFieldError } from '../validation'
import type { Gender, SignupInput, UserProfile } from '../types'

const PASSWORD_MIN_LENGTH = 6 // Firebase 최소 요건
const NICKNAME_MIN_LENGTH = 2
const NICKNAME_MAX_LENGTH = 12
// 닉네임 키가 Firestore 문서 ID로 쓰이므로(toNicknameKey) `/`·`..`·`__x__` 같은 예약
// 문자·패턴이 들어가면 경로가 깨져 가입이 영구 실패한다. 한글(자모 포함)·영문·숫자
// 화이트리스트로 원천 차단한다(공백·zero-width 등 보이지 않는 문자도 함께 막힌다).
const NICKNAME_PATTERN = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]+$/

/**
 * Firebase 에러 코드 → 사용자용 한글 메시지. 가입 실패 확률 최소화 목표에 따라
 * 원인별로 구체적 안내를 준다. 없는 코드는 일반 메시지로 폴백한다.
 */
const SIGNUP_ERROR_MESSAGE: Record<string, string> = {
  ...COMMON_AUTH_ERROR_MESSAGE,
  'auth/email-already-in-use': '이미 가입된 이메일이에요.',
  'auth/invalid-email': '이메일 형식이 올바르지 않아요.',
  'auth/weak-password': `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 해요.`,
  // 닉네임 사전검사·가입 트랜잭션(Firestore)이 오프라인일 때의 코드 — auth/* 접두사가 없다
  unavailable: NETWORK_ERROR_MESSAGE,
}
const DEFAULT_ERROR_MESSAGE = '가입에 실패했어요. 잠시 후 다시 시도해주세요.'
const NICKNAME_TAKEN_MESSAGE = '이미 사용 중인 닉네임이에요.'
const NICKNAME_PATTERN_MESSAGE = '닉네임은 한글·영문·숫자만 쓸 수 있어요.'

type FormField = 'email' | 'password' | 'nickname' | 'gender'

/** BaseSegmented가 string으로 보관한 값을 Gender로 좁힌다 — 옵션 추가 시 컴파일러가 지켜준다 */
function isGender(value: string): value is Gender {
  return value === 'male' || value === 'female'
}

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
   * 검증·저장에 쓰는 닉네임. toNicknameKey와 같은 NFC 정규화를 거쳐(macOS 한글 NFD
   * 입력 대응) 화면에 보이는 글자 수와 길이 검증·유니크 키가 어긋나지 않게 한다.
   */
  function normalizedNickname(): string {
    return form.nickname.trim().normalize('NFC')
  }

  /**
   * 이메일 단독 검증. 필드 이탈(blur) 시점에 형식 오류를 즉시 보여주기 위해 분리했고,
   * validate()도 이를 재사용한다.
   */
  function validateEmail(): boolean {
    fieldErrors.email = emailFieldError(form.email)
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

    const nickname = normalizedNickname()
    if (!nickname) {
      fieldErrors.nickname = '닉네임을 입력해주세요.'
    } else if (nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) {
      fieldErrors.nickname = `닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자로 입력해주세요.`
    } else if (!NICKNAME_PATTERN.test(nickname)) {
      fieldErrors.nickname = NICKNAME_PATTERN_MESSAGE
    }

    if (!isGender(form.gender)) {
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
      const nickname = normalizedNickname()
      // 닉네임은 공개 식별자라 중복을 막는다. 이 사전 검사는 빠른 피드백용(UX)이고,
      // 실제 유니크 보장은 signup()의 예약 트랜잭션 + firestore.rules가 담당한다.
      if (await isNicknameTaken(nickname)) {
        fieldErrors.nickname = NICKNAME_TAKEN_MESSAGE
        return null
      }

      // validate()가 이미 걸렀지만, reactive 프로퍼티는 함수 경계를 넘어 좁혀지지 않아
      // 지역 변수로 받아 한 번 더 좁힌다(단언 없이 타입 안전).
      const gender = form.gender
      if (!isGender(gender)) return null

      const input: SignupInput = {
        email: form.email.trim(),
        password: form.password,
        nickname,
        gender,
      }
      return await signup(input)
    } catch (error) {
      if (error instanceof NicknameTakenError) {
        // 사전 검사 통과 후 다른 가입자가 먼저 예약한 레이스 — 필드 에러로 안내한다
        fieldErrors.nickname = NICKNAME_TAKEN_MESSAGE
      } else {
        submitError.value = toAuthErrorMessage(error, SIGNUP_ERROR_MESSAGE, DEFAULT_ERROR_MESSAGE)
      }
      return null
    } finally {
      isSubmitting.value = false
    }
  }

  return { form, fieldErrors, submitError, isSubmitting, validateEmail, submit }
}
