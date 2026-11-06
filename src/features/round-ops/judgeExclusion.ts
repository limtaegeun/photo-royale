/** 다이얼에서 빠진 팀과 이유 */
export interface ExcludedTeam {
  armband: string
  reason: string
}

export const SUBMITTING_TEAM_REASON = '제출 팀'
export const OUT_TEAM_REASON = '탈락'

/** 이 수를 넘으면 글자를 늘어놓지 않고 수만 적는다 — 제외 줄은 두 줄까지만 들어간다 */
const LISTED_LETTERS_MAX = 3

/**
 * 제외 줄 문구 — 다이얼에서 왜 팀이 빠졌는지 한 줄로 말한다. 제출 팀과 탈락은 어떤 팀인지가 판단에 쓰여서
 * 글자로 적고, 모드 대상 제한은 몇 팀이 빠졌는지만 적는다(예: `제외 같은 그룹 4팀 · H 탈락 · M 제출 팀`).
 *
 * @param labelOf 대상 제한 이유를 부르는 말을 모드가 바꿀 때 쓴다(일반전 X 라운드의 `X 아닌`)
 */
export function exclusionLine(
  excluded: ExcludedTeam[],
  labelOf: (reason: string) => string = (reason) => reason,
): string {
  if (excluded.length === 0) return '제외한 팀 없음'
  const armbandsByReason = new Map<string, string[]>()
  for (const { armband, reason } of excluded) {
    armbandsByReason.set(reason, [...(armbandsByReason.get(reason) ?? []), armband])
  }
  const parts = [...armbandsByReason].map(([reason, armbands]) => {
    const isListed =
      (reason === SUBMITTING_TEAM_REASON || reason === OUT_TEAM_REASON) &&
      armbands.length <= LISTED_LETTERS_MAX
    return isListed
      ? `${armbands.join('·')} ${labelOf(reason)}`
      : `${labelOf(reason)} ${armbands.length}팀`
  })
  return `제외 ${parts.join(' · ')}`
}
