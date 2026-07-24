import { groupForArmband } from './armbands'

/**
 * X 모듈 — 그룹마다 2인 팀 중 1팀을 랜덤 선정해 특수 완장 X를 겸하게 한다(왕잡기에선 X가 왕).
 * X는 기존 팀 소속을 유지한 채 겸직하며, 1인 팀은 X가 될 수 없다(X도 2인 배치 확정).
 * 편성 때마다 새로 선정한다. 선정된 팀의 완장 집합을 반환한다.
 *
 * 게임 모드마다 켜고 끄는 모듈이라, 인원이 적으면 호출부에서 생략한다.
 *
 * @param teams  현재 편성된 팀들(완장·멤버 수). 입력은 변형하지 않는다.
 * @param random [0, 1) 난수 생성기. 테스트 결정성을 위해 주입 가능하다.
 */
export function pickXTeams(
  teams: ReadonlyArray<{ armband: string; memberCount: number }>,
  random: () => number = Math.random,
): Set<string> {
  // 그룹 색 기준으로 2인 팀 후보를 모은다. 그룹이 null인 완장(X 등)은 발생하지 않지만 방어적으로 제외한다.
  const candidatesByGroup = new Map<string, string[]>()
  for (const team of teams) {
    if (team.memberCount !== 2) continue
    const group = groupForArmband(team.armband)
    if (group === null) continue

    const bucket = candidatesByGroup.get(group)
    if (bucket) {
      bucket.push(team.armband)
    } else {
      candidatesByGroup.set(group, [team.armband])
    }
  }

  // 그룹별 후보가 1개 이상이면 그중 1팀을 선정한다. 후보 없는 그룹은 건너뛴다.
  const selected = new Set<string>()
  for (const armbands of candidatesByGroup.values()) {
    const index = Math.floor(random() * armbands.length)
    selected.add(armbands[index]!)
  }
  return selected
}
