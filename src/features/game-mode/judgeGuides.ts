import { GROUP_LABELS, groupForArmband } from './armbandGroups'
import { KING_HUNT_POINTS, KING_KILL_POINTS, KING_OUT_PENALTY, livesOf, scaleTeamScore } from './scoring'
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

/** 왕잡기 — 왕 표시는 진행자 판정 화면에만 있다. 규칙서에서 왕은 비밀이라 참가자 화면에 넣지 않는다 */
export const KING_HUNT_JUDGE_GUIDE: JudgeGuide = {
  teamMark: (armband, context) => (context.xTeams.includes(armband) ? '왕' : null),
  outcome(attacker, target, context) {
    if (context.xTeams.includes(target)) {
      const huntPoints = scaleTeamScore(context.rosters, attacker, KING_HUNT_POINTS)
      if (!isOutAfterKill(context, target)) {
        return {
          approveLabel: `팀 ${target} 왕 사냥 확정`,
          note: `왕 사냥 +${huntPoints}`,
          toast: `팀 ${target} 왕 사냥으로 판정했어요.`,
        }
      }
      const group = groupForArmband(target)
      const groupLabel = group === null ? '' : GROUP_LABELS[group].ko
      const penalty = `${groupLabel} 그룹 전원 −${Math.abs(KING_OUT_PENALTY)}`
      return {
        approveLabel: `팀 ${target} 왕 사냥 확정`,
        note: `왕 사냥 +${huntPoints} · ${penalty}`,
        toast: `팀 ${target} 왕 사냥으로 판정했어요. ${penalty}이에요.`,
      }
    }
    if (context.xTeams.includes(attacker)) {
      return {
        approveLabel: `팀 ${target} 왕의 킬 확정`,
        note: `왕의 킬 +${scaleTeamScore(context.rosters, attacker, KING_KILL_POINTS)}`,
        toast: `팀 ${target} 왕의 킬로 판정했어요.`,
      }
    }
    return null
  },
}

/** 스태프 추격전 — 킬샷이 없는 모드라 잘못 올라온 건은 반려만 할 수 있다 */
export const STAFF_CHASE_JUDGE_GUIDE: JudgeGuide = {
  exclusionSummary: () => '전원 동맹이라 고를 팀이 없어요. 반려만 할 수 있어요.',
}
