/**
 * 자동 배정에 쓰는 완장 실물 목록 · 팀 순번 → 완장 매핑.
 * 완장 → 그룹 색 규칙(TeamGroup·groupForArmband·GROUP_LABELS·SPECIAL_ARMBAND)은 게임 규칙이라
 * game-mode(armbandGroups.ts)가 소유한다 — 여기서는 어떤 완장을 몇 번째 팀에 주는지만 다룬다.
 */

/**
 * 자동 배정에 쓰는 일반 완장 — X를 제외한 알파벳 전체 25개(A~W, Y, Z).
 * 기존엔 제작 완료된 A~P 16개만 노출했으나, 기획이 40인(20팀) 지원을 확정해
 * X(특수 완장)를 제외한 전체 알파벳으로 확장했다 — Q 이후는 완장 추가 제작을 전제한다.
 * X는 SPECIAL_ARMBAND(game-mode)로 별도 취급되므로 이 풀에서 빠진다.
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

/**
 * 자동 배정이 소화할 수 있는 최대 인원 — 완장 25개 × 2인 1팀. 이보다 많으면 완장을 부여할
 * 완장 실물이 없어(armbandForTeamIndex throw) 배정이 성립하지 않으므로, 호출부가 배정을
 * 시작하기 전에 이 값으로 미리 걸러 안내한다.
 */
export const MAX_ASSIGNABLE_MEMBERS = ARMBAND_LABELS.length * 2

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
