/**
 * 완장 알파벳 · 그룹 색 매핑.
 *
 * 기획서 3.3 본문("A,E,I…=빨강")과 1장 표(A,E,I…=파랑)가 서로 모순인데, 표가 정본으로
 * 확정됐다(A=파랑, B=주황, C=연두, D=빨강, 이후 4색 순환). 본문 서술은 무시한다.
 */

/** 그룹 색 — 완장 표 기준 알파벳 4색 순환의 순서(A=파랑, B=주황, C=연두, D=빨강, 이후 반복) */
export type TeamGroup = 'blue' | 'orange' | 'green' | 'red'
export const TEAM_GROUP_ORDER: readonly TeamGroup[] = ['blue', 'orange', 'green', 'red']

/**
 * 자동 배정에 쓰는 일반 완장 — X를 제외한 알파벳 전체 25개(A~W, Y, Z).
 * 기존엔 제작 완료된 A~P 16개만 노출했으나, 기획이 40인(20팀) 지원을 확정해
 * X(특수 완장)를 제외한 전체 알파벳으로 확장했다 — Q 이후는 완장 추가 제작을 전제한다.
 * X는 SPECIAL_ARMBAND로 별도 취급되므로 이 풀에서 빠진다.
 */
export const ARMBAND_LABELS: readonly string[] = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'Y',
  'Z',
]

/** 특수 완장 X — 4색이 모두 인쇄되어 있고 별도 규칙(X끼리만 사냥)이 적용된다 */
export const SPECIAL_ARMBAND = 'X'

/** 알파벳 대문자 A~Z의 charCode 경계 */
const CHAR_CODE_A = 'A'.charCodeAt(0)
const CHAR_CODE_Z = 'Z'.charCodeAt(0)

/**
 * 팀 순번 → 완장 알파벳. 0→'A' … 22→'W', 23→'Y', 24→'Z'(X는 건너뛴다).
 * 완장 개수(25개)를 초과하거나 음수·정수가 아니면 throw — 배정할 완장 실물이 없다.
 */
export function armbandForTeamIndex(index: number): string {
  if (!Number.isInteger(index)) {
    throw new Error(`완장 순번은 정수여야 합니다: ${index}`)
  }
  if (index < 0 || index >= ARMBAND_LABELS.length) {
    throw new Error(
      `배정 가능한 완장은 0~${ARMBAND_LABELS.length - 1}번(A~Z, X 제외)뿐입니다: ${index}`,
    )
  }
  return ARMBAND_LABELS[index]!
}

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
