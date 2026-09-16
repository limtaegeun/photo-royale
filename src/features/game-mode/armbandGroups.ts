/**
 * 완장 알파벳 → 그룹 색 규칙(규칙서 "그룹은 완장 색깔").
 *
 * 기획서 3.3 본문("A,E,I…=빨강")과 1장 표(A,E,I…=파랑)가 서로 모순인데, 표가 정본으로
 * 확정됐다(A=파랑, B=주황, C=연두, D=빨강, 이후 4색 순환). 본문 서술은 무시한다.
 *
 * 배정 보드(team-assignment)와 모드 원점수 규칙(그룹전·왕잡기의 그룹 동료 킬)이 함께 쓰는
 * 게임 규칙이라 규칙서를 소유하는 이 기능에 둔다 — team-assignment는 이 기능을 이미 의존한다.
 */

/** 그룹 색 — 완장 표 기준 알파벳 4색 순환의 순서(A=파랑, B=주황, C=연두, D=빨강, 이후 반복) */
export type TeamGroup = 'blue' | 'orange' | 'green' | 'red'
export const TEAM_GROUP_ORDER: readonly TeamGroup[] = ['blue', 'orange', 'green', 'red']

/**
 * 그룹 표기 라벨 — 색약 대응으로 색과 항상 병기하는 한글/영문 텍스트의 단일 소스.
 * 그룹 색을 추가·변경할 때 컴포넌트별 라벨 맵을 일일이 고치지 않도록 여기서만 관리한다
 * (Tailwind 클래스 맵은 스캐너 대응 때문에 각 컴포넌트의 리터럴 맵으로 남긴다).
 */
export const GROUP_LABELS = {
  blue: { ko: '파랑', en: 'BLUE' },
  orange: { ko: '주황', en: 'ORANGE' },
  green: { ko: '초록', en: 'GREEN' },
  red: { ko: '빨강', en: 'RED' },
} as const satisfies Record<TeamGroup, { ko: string; en: string }>

/** 특수 완장 X — 4색이 모두 인쇄되어 있고 별도 규칙(X끼리만 사냥)이 적용된다 */
export const SPECIAL_ARMBAND = 'X'

/** 알파벳 대문자 A~Z의 charCode 경계 */
const CHAR_CODE_A = 'A'.charCodeAt(0)
const CHAR_CODE_Z = 'Z'.charCodeAt(0)

/**
 * 완장 알파벳 → 그룹 색. 4색 순환(charCode 기반 % 4)으로 계산한다.
 * 'A'→'blue', 'B'→'orange', 'C'→'green', 'D'→'red', 'E'→'blue' … 'P'→'red'.
 * 특수 완장 X는 4색이 모두 인쇄되어 있어 단일 그룹이 없으므로 null을 반환한다.
 * A~Z 범위 밖(소문자·기호·다중 문자 등)은 그룹을 정할 수 없어 throw한다.
 */
export function groupForArmband(label: string): TeamGroup | null {
  if (label === SPECIAL_ARMBAND) {
    return null
  }
  const charCode = label.charCodeAt(0)
  if (label.length !== 1 || charCode < CHAR_CODE_A || charCode > CHAR_CODE_Z) {
    throw new Error(`완장 알파벳은 A~Z 한 글자여야 합니다: ${label}`)
  }
  return TEAM_GROUP_ORDER[(charCode - CHAR_CODE_A) % TEAM_GROUP_ORDER.length]!
}

/**
 * 두 완장이 같은 그룹(동맹)인지. 그룹이 없는 완장(X)은 누구와도 같은 그룹이 아니다 —
 * 그룹전의 "같은 색 그룹끼리는 서로 공격할 수 없다"와 그룹 동료 킬 점수가 이 판정을 쓴다.
 */
export function isSameGroup(armband: string, other: string): boolean {
  const group = groupForArmband(armband)
  return group !== null && group === groupForArmband(other)
}
