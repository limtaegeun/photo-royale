// 회원가입·로그인 폼이 공유하는 이메일 검증. zod가 z.string().email() 기본값으로 쓰는 것과
// 동일한 리터럴을 이식했다(런타임 zod 의존은 없음). 다음을 모두 막는다:
//  - TLD에 숫자/기호가 붙은 값(gmail.com1) — 마지막 라벨을 [A-Za-z]{2,}로 강제
//  - local part의 선행 점(.user@x.com) — (?!\.)
//  - 연속 점(user@x..com) — (?!.*\.\.)
// 출처/근거: https://colinhacks.com/essays/reasonable-email-regex,
// https://github.com/colinhacks/zod (packages/zod/src/v4/core/regexes.ts)
export const EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/

/** 이메일 필드 에러 메시지. 유효하면 빈 문자열 — fieldErrors에 그대로 대입할 수 있다. */
export function emailFieldError(rawEmail: string): string {
  const email = rawEmail.trim()
  if (!email) return '이메일을 입력해주세요.'
  if (!EMAIL_PATTERN.test(email)) return '이메일 형식이 올바르지 않아요.'
  return ''
}
