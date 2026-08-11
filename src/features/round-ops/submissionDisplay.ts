import { groupLabelKo } from '@/features/team-assignment'
import type { Participant } from '@/features/waiting-room'

/**
 * 판정 이력·판정 큐 화면(JudgeSheet/JudgeQueueList/RecordDetailSheet/RecordLogList)이 공유하는
 * 표시 로직 — 팀 배지 라벨과 제출자 이름 조인은 네 화면이 문자 그대로 중복 구현하고 있었다.
 */

/** 색+라벨 병기 규칙 — 완장 알파벳과 그룹 한글 라벨을 항상 함께 쓴다 */
export function teamChipLabel(team: string): string {
  const label = groupLabelKo(team)
  return label === '' ? `팀 ${team}` : `팀 ${team} · ${label}`
}

/** 명단 유실(경계 상황) 시에도 화면이 깨지지 않게 안전 문구로 흡수한다 */
export function participantName(participants: Participant[], uid: string | undefined): string {
  return participants.find((participant) => participant.id === uid)?.name ?? '알 수 없음'
}
