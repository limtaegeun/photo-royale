import type { Gender } from '@/features/auth'

/**
 * 팀 배정 최소 인원 — 레디 완료자만 배정 대상이며 최소 인원 제한은 없다(1명이면 1인 팀).
 * 0명은 배정 자체가 성립하지 않으므로 이 값(1) 미만일 때만 throw한다.
 */
export const MIN_TEAM_CANDIDATES = 1

export interface TeamCandidate {
  id: string
  /** 가입 시 확정된 성별 — 프로필 조회 실패 등으로 미상(null)일 수 있다 */
  gender: Gender | null
  /** 직전 배정까지 연속으로 비혼성 팀에 배정된 횟수. 첫 배정이면 0 */
  sameGenderStreak: number
  /** 이번 세션에서 이전 라운드들에 짝이었던 참가자 id 누적 — 재짝꿍 회피용. 첫 배정이면 빈 배열 */
  previousPartnerIds: string[]
}

export interface AssignedTeam {
  /**
   * 기본 2명. 전체 인원이 홀수면 정확히 한 팀만 1인 팀이 되며, 1인 팀은 게임에서
   * 목숨·포인트 2배 보상을 받는다(기획 확정). 보상 지급은 이후 게임플레이 단계 몫이고
   * 배정 로직은 1인 팀을 만들어내기만 하면 된다.
   */
  members: TeamCandidate[]
  /** 남녀가 모두 포함된 팀인지 — 성별 미상 멤버는 혼성 판정에 기여하지 않는다 */
  isMixed: boolean
}

export interface TeamAssignmentResult {
  teams: AssignedTeam[]
  /** 다음 배정에 이월할 우선권 값 — 혼성 팀원은 0으로 리셋, 비혼성 팀원은 기존 streak + 1 */
  nextStreaks: Record<string, number>
  /** 다음 배정에 이월할 짝꿍 이력 — 기존 이력 + 이번 라운드 팀원 id들(중복 없이). 배정 확정 시점에 저장한다 */
  nextPartnerIds: Record<string, string[]>
}

/**
 * 멤버 중 남성 1명 이상 AND 여성 1명 이상이면 혼성 팀이다.
 * 성별 미상(null) 멤버는 어느 쪽으로도 세지 않으므로 혼성 판정에 기여하지 않는다.
 */
function isMixedTeam(members: TeamCandidate[]): boolean {
  const hasMale = members.some((member) => member.gender === 'male')
  const hasFemale = members.some((member) => member.gender === 'female')
  return hasMale && hasFemale
}

/**
 * 두 후보가 직전(이전 라운드들) 짝이었는지 판정한다.
 * 이력은 양쪽에 대칭으로 저장되지만, 저장 누락 등에 대비해 방어적으로 양방향을 모두 확인한다.
 */
function werePartners(a: TeamCandidate, b: TeamCandidate): boolean {
  return a.previousPartnerIds.includes(b.id) || b.previousPartnerIds.includes(a.id)
}

/**
 * 주입된 random으로 Fisher–Yates 셔플을 제자리에서 수행한다.
 * random을 인자로 받는 이유는 테스트가 결정적 시퀀스를 주입해 결과를 검증하기 위함이다
 * (Math.random/Date.now 직접 호출 금지).
 */
function shuffleInPlace<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    // i > 0 이고 0 <= j <= i 이므로 두 인덱스 모두 유효하다(noUncheckedIndexedAccess 대응)
    const temp = items[i]!
    items[i] = items[j]!
    items[j] = temp
  }
}

/**
 * 재짝꿍 최소화 탐색의 노드 예산(방문 노드 수 상한).
 *
 * 직전 짝 제약은 인당 최대 2~3개로 희소해서 실전 규모(≤40인)에서는 재짝꿍 0 조합을 거의 즉시
 * 찾아 예산에 닿기 전에 종료한다. 이 상수는 병리적 입력(제약이 촘촘한 큰 입력)에서 완전 탐색이
 * 프레임을 막지 않도록 하는 안전판이다. 예산 소진 시 그때까지의 최선(첫 리프가 항상 존재하므로
 * 기존 greedy와 최소 동급)을 반환한다.
 */
const PAIRING_SEARCH_BUDGET = 20_000

/**
 * 후보 목록을 "person의 직전 짝이 아닌 사람 먼저" 순으로 재배열한다(원래 상대 순서는 유지).
 * 탐색이 이 순서로 먼저 내려가므로 첫 리프가 기존 greedy(직전 짝이 아닌 첫 상대를 고름)와
 * 동급이 되고, 그보다 나은 조합이 있으면 이어지는 탐색이 찾아낸다.
 */
function orderByNonPartner(person: TeamCandidate, others: TeamCandidate[]): TeamCandidate[] {
  const nonPartners = others.filter((other) => !werePartners(person, other))
  const partners = others.filter((other) => werePartners(person, other))
  return [...nonPartners, ...partners]
}

/**
 * 혼성 슬롯로 선발된 남녀를 재짝꿍(직전 라운드 짝 재결합) 수가 최소가 되도록 1:1로 짝짓는다.
 *
 * 기존 greedy(남자를 streak 순으로 순회하며 직전 짝이 아닌 첫 여자를 즉시 소진)는 제약이 많은
 * 남자가 뒤로 밀리면 전역적으로 회피 가능한 배치가 있는데도 재짝꿍을 만들었다(QA F-03). 이를
 * 분기 한정(branch & bound) 백트래킹으로 교체해 재짝꿍 수가 최소인 조합을 찾는다.
 *
 * 남자를 순서(선발된 streak 순)대로 진행하며 남은 여자 중 하나를 배정하는 DFS다. 후보(여자)는
 * 직전 짝이 아닌 사람 먼저 순회하므로 첫 리프는 greedy와 동급이다. 재짝꿍 수(rematches)는
 * 단조 증가하므로 현재 누적이 지금까지의 최선 이상이면 가지치기하고, 최선이 0이면 즉시 종료한다.
 * 탐색은 결정적이다(난수 없음 — 무작위성은 상위의 셔플이 이미 제공). 노드 예산 소진 시 그때까지의
 * 최선을 반환한다.
 *
 * @param selectedMales   혼성 슬롯 선발 남자(streak 순). selectedFemales와 길이가 같다.
 * @param selectedFemales 혼성 슬롯 선발 여자(streak 순).
 */
function pairMixed(
  selectedMales: TeamCandidate[],
  selectedFemales: TeamCandidate[],
): AssignedTeam[] {
  const count = selectedMales.length
  // current[i] = 남자 i에게 배정된 여자(i를 0부터 순서대로 채운다). best는 재짝꿍이 가장 적은 스냅샷.
  const current: TeamCandidate[] = []
  let best: TeamCandidate[] | null = null
  let bestRematches = Infinity
  let budget = PAIRING_SEARCH_BUDGET

  const search = (maleIndex: number, remainingFemales: TeamCandidate[], rematches: number): void => {
    if (bestRematches === 0 || budget <= 0) return
    budget--

    if (maleIndex === count) {
      // 리프: 모든 남자가 짝을 얻었다. 현재 조합이 더 적은 재짝꿍이면 갱신한다.
      best = current.slice()
      bestRematches = rematches
      return
    }

    const male = selectedMales[maleIndex]!
    for (const female of orderByNonPartner(male, remainingFemales)) {
      const add = werePartners(male, female) ? 1 : 0
      // rematches는 단조 증가하므로 rematches+add가 하한이다 — 최선 이상이면 개선 불가라 건너뛴다.
      if (rematches + add >= bestRematches) continue
      current[maleIndex] = female
      search(maleIndex + 1, remainingFemales.filter((other) => other !== female), rematches + add)
      if (bestRematches === 0 || budget <= 0) return
    }
  }

  search(0, selectedFemales, 0)

  // count===0이면 즉시 빈 리프가 기록되고, 그 외에는 첫 리프가 항상 존재하므로 best는 non-null이다.
  const assignment = best ?? []
  return selectedMales.map((male, index) => ({
    members: [male, assignment[index]!],
    isMixed: true,
  }))
}

/**
 * 남은 인원 풀(다수 성별 초과분 + 성별 미상)을 재짝꿍 수가 최소가 되도록 짝짓는다.
 *
 * 기존 greedy(맨 앞 사람을 꺼내 직전 짝이 아닌 첫 상대와 즉시 짝지음)는 순서 의존이라 회피 가능한
 * 재짝꿍을 만들 수 있었다(QA F-03: 풀 [a,b,c,d], 직전 짝 a↔b·b↔d면 greedy는 a-c를 먼저 만들어
 * b-d 재짝꿍을 강제하지만 (a,d)(b,c)면 재짝꿍 0). 이를 분기 한정 백트래킹으로 교체한다.
 *
 * 남은 사람 중 첫 번째를 고정하고 나머지 각 후보와 짝짓는 DFS다(직전 짝이 아닌 사람 먼저). 풀이
 * 홀수면 "누가 1인 팀이 되는가"도 탐색에 포함한다 — 첫 번째를 solo로 두는 분기를 짝짓기 분기
 * 뒤에 두어, solo(재짝꿍 0에 기여)가 전체 재짝꿍 최소화에 유리한 사람에게 돌아가게 하면서도,
 * 재짝꿍이 동률인 조합 중에서는 기존 greedy처럼 "맨 뒤에 남는 사람"이 solo가 되도록 한다.
 * 재짝꿍 0이면 즉시 종료, 누적이 최선 이상이면 가지치기, 노드 예산 소진 시 최선을 반환한다.
 * 짝짓기는 streak에 영향을 주지 않으므로(비혼성 팀원은 deriveCarryover에서 일괄 +1) 자유롭게
 * 재배열해도 이월 스펙을 해치지 않는다. 탐색은 결정적이다.
 */
function pairPool(remaining: TeamCandidate[]): AssignedTeam[] {
  // currentTeams는 진행 중 조합의 팀 목록(각 팀은 2인 또는 1인). best는 최선 조합의 스냅샷.
  const currentTeams: TeamCandidate[][] = []
  let best: TeamCandidate[][] | null = null
  let bestRematches = Infinity
  let budget = PAIRING_SEARCH_BUDGET

  const search = (people: TeamCandidate[], rematches: number): void => {
    if (bestRematches === 0 || budget <= 0) return
    if (rematches >= bestRematches) return
    budget--

    if (people.length === 0) {
      best = currentTeams.map((team) => [...team])
      bestRematches = rematches
      return
    }

    const first = people[0]!
    const tail = people.slice(1)

    // first를 나머지 각 후보와 짝짓는 분기 (직전 짝이 아닌 사람 먼저 — 첫 리프가 greedy 동급).
    for (const candidate of orderByNonPartner(first, tail)) {
      const add = werePartners(first, candidate) ? 1 : 0
      if (rematches + add >= bestRematches) continue
      currentTeams.push([first, candidate])
      search(
        tail.filter((person) => person !== candidate),
        rematches + add,
      )
      currentTeams.pop()
      if (bestRematches === 0 || budget <= 0) return
    }

    // 풀이 홀수일 때만 first를 1인 팀으로 두는 분기(짝짓기 분기 뒤 = 재짝꿍 동률 시 greedy와 동일한
    // solo 선택). 여기서 solo를 쓰면 tail은 짝수라 이후 분기에서 추가 solo가 나오지 않는다.
    if (people.length % 2 === 1) {
      currentTeams.push([first])
      search(tail, rematches)
      currentTeams.pop()
    }
  }

  search(remaining, 0)

  // 첫 리프가 항상 존재하므로 best는 non-null이다(빈 풀이면 빈 리프가 기록된다).
  const finalTeams = best ?? []
  return finalTeams.map((members) => ({
    members,
    isMixed: isMixedTeam(members),
  }))
}

/**
 * 일반전 팀 배정 — 2인 1팀, 남녀 1:1 혼성 팀을 최우선으로 구성한다.
 *
 * 혼성 팀을 먼저 채우고 남은 인원(다수 성별 초과분 + 성별 미상)은 부득이하게 비혼성 팀으로
 * 묶는다. 비혼성 팀에 배정된 사람은 다음 배정에서 혼성 팀 우선권을 갖도록 sameGenderStreak를
 * 이월한다(streak가 높을수록 혼성 슬롯을 먼저 가져간다). 이 이월이 특정인이 매번 비혼성 팀에만
 * 묶이는 불공정을 완화한다.
 *
 * 전체 인원이 홀수면 남은 1명은 기존 팀에 합류시키지 않고 1인 팀으로 만든다(기획 확정 —
 * 1인 팀은 게임에서 목숨·포인트 2배 보상을 받는다).
 *
 * 짝짓기 단계에서는 직전 라운드 짝(previousPartnerIds)을 재짝꿍 수가 최소가 되도록 회피한다.
 * 기존 greedy가 순서 의존 탓에 회피 가능한 재짝꿍을 만들던 버그(QA F-03)를 분기 한정 백트래킹
 * 탐색(pairMixed·pairPool)으로 교체했다. best-effort의 의미는 "회피 가능한 조합이 하나라도
 * 있으면(탐색 예산 내에서) 재짝꿍을 만들지 않고, 회피가 정말 불가능할 때만(예: 남은 후보가 전원
 * 직전 짝) 재짝꿍을 허용"으로 강화됐다 — 강제 제약이면 인원이 적을 때 배정 자체가 성립 불가하기
 * 때문이다. 혼성 슬롯 선발(streak 이월 우선권)은 바뀌지 않고, "선발된 인원끼리 누가 짝이 되는가"만
 * 재배열한다. 짝짓기는 streak에 영향을 주지 않으므로(혼성 팀원은 전원 0 리셋) 스펙 무손상이다.
 *
 * @param candidates 배정 대상. 입력 배열·객체는 변형하지 않는다(내부에서 복사 후 작업).
 * @param random     [0, 1) 난수 생성기. 테스트 결정성을 위해 주입 가능하다.
 */
export function assignTeams(
  candidates: TeamCandidate[],
  random: () => number = Math.random,
): TeamAssignmentResult {
  if (candidates.length < MIN_TEAM_CANDIDATES) {
    throw new Error(`팀 배정에는 최소 ${MIN_TEAM_CANDIDATES}명이 필요합니다`)
  }

  // 입력 불변성 보장: 배열과 각 후보 객체를 얕은 복사해 이후 어떤 조작도 원본에 닿지 않게 한다
  const pool = candidates.map((candidate) => ({ ...candidate }))
  shuffleInPlace(pool, random)

  // 성별 3버킷으로 분리 — 셔플 순서를 그대로 보존한다
  const males = pool.filter((candidate) => candidate.gender === 'male')
  const females = pool.filter((candidate) => candidate.gender === 'female')

  // 혼성 팀 수 = 남녀 중 적은 쪽. 소수 성별은 전원이 혼성 슬롯에 들어간다
  const mixedTeamCount = Math.min(males.length, females.length)

  // 혼성 슬롯 선발: sameGenderStreak 내림차순 안정 정렬(동점은 셔플 순서 유지) 후 앞에서 뽑는다.
  // 직전에 비혼성이었던 사람(streak가 큼)이 혼성 슬롯을 먼저 가져가는 이월 우선권의 핵심이다.
  const malesByStreak = [...males].sort((a, b) => b.sameGenderStreak - a.sameGenderStreak)
  const femalesByStreak = [...females].sort((a, b) => b.sameGenderStreak - a.sameGenderStreak)

  const teams: AssignedTeam[] = []
  const selectedIds = new Set<string>()

  // 혼성 슬롯 선발: 남녀 각각 streak 상위 mixedTeamCount명. 선발 자체는 기존 그대로다(이월 우선권).
  const selectedMales = malesByStreak.slice(0, mixedTeamCount)
  const selectedFemales = femalesByStreak.slice(0, mixedTeamCount)

  // 선발된 인원끼리의 짝짓기만 재짝꿍 최소화 탐색으로 정한다(선발 규칙은 불변). greedy가 회피 가능한
  // 재짝꿍을 만들던 버그(QA F-03)를 pairMixed의 분기 한정 백트래킹으로 교체했다.
  for (const team of pairMixed(selectedMales, selectedFemales)) {
    for (const member of team.members) selectedIds.add(member.id)
    teams.push(team)
  }

  // 남은 인원 풀 = 다수 성별 초과분 + unknown 전원. 셔플 순서를 유지하도록 pool에서 필터링한다.
  const remaining = pool.filter((candidate) => !selectedIds.has(candidate.id))

  // 남은 풀도 재짝꿍 최소화 탐색으로 짝짓는다. 전체 인원이 홀수면 남는 1명은 기존 팀에 합류시키지
  // 않고 1인 팀이 되며(기획 확정 — 1인 팀은 목숨·포인트 2배 보상, 지급은 이후 게임플레이 단계 몫),
  // 누가 solo가 되는가도 pairPool의 탐색에 포함된다. 후보가 1명뿐인 경우도 mixedTeamCount 0,
  // remaining 1 → 이 경로로 자연스럽게 1인 팀이 된다. 풀에는 한 성별 + unknown만 남으므로 대개
  // 혼성이 될 수 없지만, isMixed는 pairPool 내부에서 방어적으로 isMixedTeam으로 판정한다.
  for (const team of pairPool(remaining)) {
    teams.push(team)
  }

  const { nextStreaks, nextPartnerIds } = deriveCarryover(teams.map((team) => team.members))

  return { teams, nextStreaks, nextPartnerIds }
}

/**
 * 확정 시점의 최종 팀 구성(수동 편집 반영 후)으로부터 다음 라운드 이월값을 재산출한다.
 * isMixed는 내부에서 멤버 기준으로 재판정한다 — 보드에서 멤버를 옮기면 배정 당시 판정이 무효라서다.
 *
 * nextStreaks: 혼성 팀원은 0으로 리셋, 비혼성 팀원은 기존 streak + 1로 이월한다.
 * 1인 팀은 isMixed가 false이므로 이 로직을 그대로 타 streak + 1이 된다 — 혼자 배정된 사람도
 * 다음 배정에서 혼성 우선권을 받는 것이 이월 우선권 취지에 맞다.
 * nextPartnerIds: 각 멤버의 기존 이력 뒤에 같은 팀 다른 멤버 id들을 덧붙인다(중복 추가 금지).
 * 1인 팀은 다른 멤버가 없으므로 기존 이력의 복사본이 그대로 이월된다. 원본 배열은 변형하지 않는다.
 */
export function deriveCarryover(teamsMembers: TeamCandidate[][]): {
  nextStreaks: Record<string, number>
  nextPartnerIds: Record<string, string[]>
} {
  const nextStreaks: Record<string, number> = {}
  const nextPartnerIds: Record<string, string[]> = {}
  for (const members of teamsMembers) {
    const isMixed = isMixedTeam(members)
    for (const member of members) {
      nextStreaks[member.id] = isMixed ? 0 : member.sameGenderStreak + 1

      const merged = [...member.previousPartnerIds]
      for (const other of members) {
        if (other.id !== member.id && !merged.includes(other.id)) {
          merged.push(other.id)
        }
      }
      nextPartnerIds[member.id] = merged
    }
  }
  return { nextStreaks, nextPartnerIds }
}
