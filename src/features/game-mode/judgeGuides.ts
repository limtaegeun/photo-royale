import { GROUP_LABELS, groupForArmband } from './armbandGroups'
import { KING_HUNT_POINTS, KING_HUNT_TEAM_POINTS, livesOf, scaleTeamScore } from './scoring'
import { nextPreyOf } from './targeting'
import type { JudgeContext, JudgeGuide } from './types'

/** 이 킬로 대상 팀이 아웃되는가 — 1인 팀은 라이프가 2라 첫 킬로는 아웃되지 않는다. 원장이 없으면 알 수 없어 false */
function isOutAfterKill(context: JudgeContext, target: string): boolean {
  if (!(target in context.rosters)) return false
  return (context.hits[target] ?? 0) + 1 >= livesOf(context.rosters, target)
}

/** 공격 팀에서 대상 팀까지 건너뛴 완장 — 알파벳 순으로 돌며 대상 앞까지 모은다 */
function skippedArmbands(attacker: string, target: string, teams: string[]): string[] {
  const sorted = [...teams].sort()
  const start = sorted.indexOf(attacker)
  const skipped: string[] = []
  for (let step = 1; step < sorted.length; step += 1) {
    const armband = sorted[(start + step) % sorted.length]!
    if (armband === target) break
    skipped.push(armband)
  }
  return skipped
}

/** 건너뛴 팀이 이 수를 넘으면 글자를 늘어놓지 않고 수만 적는다 — 제외 줄은 두 줄까지만 들어간다 */
const SKIPPED_LETTERS_MAX = 3

/** 일반전 — X를 켠 라운드만 표시가 생긴다. X를 끈 라운드는 xTeams가 비어 기본 화면 그대로다 */
export const NORMAL_JUDGE_GUIDE: JudgeGuide = {
  teamMark: (armband, context) => (context.xTeams.includes(armband) ? 'X' : null),
  exclusionLabel: (attacker, context) => (context.xTeams.includes(attacker) ? 'X 아닌' : 'X'),
}

/** 꼬리잡기 — 후보가 하나뿐이라 돌릴 일이 없다. 판정은 되돌릴 수 없어 그래도 눌러서 고르게 한다 */
export const TAIL_CHASE_JUDGE_GUIDE: JudgeGuide = {
  dialHint: '대상 팀을 눌러 고르기',
  exclusionSummary(attacker, context) {
    const prey = nextPreyOf(attacker, context)
    if (prey === null) return '잡을 수 있는 팀이 없어요'
    const summary = `${attacker}의 대상은 ${prey} 하나뿐이에요`
    const skipped = skippedArmbands(attacker, prey, context.teams)
    if (skipped.length > 0) {
      const who =
        skipped.length > SKIPPED_LETTERS_MAX ? `${skipped.length}팀` : skipped.join('·')
      return `${summary} · ${who} 탈락이라 건너뛰었어요`
    }
    return prey < attacker ? `${summary} · 마지막 완장은 처음으로 돌아가요` : summary
  },
  outcome(attacker, target, context) {
    if (!isOutAfterKill(context, target)) return null
    return {
      note: `잡히면 팀 ${target} 전원이 ${attacker}의 꼬리로 들어가요`,
      toast: `팀 ${target} 킬샷으로 판정했어요. ${attacker}의 꼬리로 들어가요.`,
    }
  },
}

/** 그룹 한글 라벨 — 그룹이 없는 완장(X)은 빈 문자열 */
function groupLabelOf(armband: string): string {
  const group = groupForArmband(armband)
  return group === null ? '' : GROUP_LABELS[group].ko
}

/**
 * 왕잡기(노션 ② 왕잡기 카드) — 왕 표시는 진행자 판정 화면에만 있다. 왕은 같은 그룹에만 알리는 비밀이라 다른 그룹
 * 참가자 화면에는 넣지 않는다. 왕을 잡는(아웃시키는) 킬이면 찍은 사람 +30 · 잡은 팀 +10 · 왕의 그룹 전원 아웃을
 * 미리 보인다(2026-11-16 기획 변경). 1인 팀 왕은 라이프가 2라 첫 킬로는 잡히지 않는다 — 그때는 점수 없는 킬이다.
 */
export const KING_HUNT_JUDGE_GUIDE: JudgeGuide = {
  teamMark: (armband, context) => (context.xTeams.includes(armband) ? '왕' : null),
  outcome(attacker, target, context) {
    if (!context.xTeams.includes(target)) return null
    if (!isOutAfterKill(context, target)) {
      return { note: '왕이 한 번 더 맞아야 잡혀요' }
    }
    const catcherPoints = scaleTeamScore(context.rosters, attacker, KING_HUNT_POINTS)
    const teamPoints = scaleTeamScore(context.rosters, attacker, KING_HUNT_TEAM_POINTS)
    const targetGroup = groupLabelOf(target)
    return {
      approveLabel: `팀 ${target} 왕 잡기 확정`,
      note: `찍은 사람 +${catcherPoints} · 팀 ${attacker} +${teamPoints} · ${targetGroup} 그룹 전원 아웃`,
      toast: `팀 ${target} 왕 잡기로 판정했어요. ${targetGroup} 그룹은 전원 아웃이에요.`,
    }
  },
}

/** 스태프 추격전 — 킬샷이 없는 모드라 잘못 올라온 건은 반려만 할 수 있다 */
export const STAFF_CHASE_JUDGE_GUIDE: JudgeGuide = {
  exclusionSummary: () => '전원 동맹이라 고를 팀이 없어요. 반려만 할 수 있어요.',
}
