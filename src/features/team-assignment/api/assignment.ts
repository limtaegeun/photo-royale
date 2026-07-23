import { doc, writeBatch } from 'firebase/firestore'
import { db } from '@/shared/api/firebase'
import type { GameModeId } from '../gameModes'

/** 확정된 팀의 한 멤버에게 쓸 이월값 */
export interface ConfirmedMemberWrite {
  id: string
  nextStreak: number
  nextPartnerIds: string[]
}

/** 확정된 한 팀 — 완장·X 겸직 여부와 그 팀 멤버들 */
export interface ConfirmedTeamWrite {
  armband: string
  isXTeam: boolean
  members: ConfirmedMemberWrite[]
}

/**
 * 배정 확정 — 단일 writeBatch로 원자 커밋한다. 참가자마다 team(완장)·isXTeam·이월값을 쓰고
 * isReady를 false로 리셋(라운드마다 재레디), 방 문서 assignmentRound를 올린다.
 * 드래프트 단계에선 아무것도 쓰지 않으므로 재배정을 몇 번 돌려도 이력이 오염되지 않는다.
 *
 * @param code      방 초대 코드(= 방 문서 ID)
 * @param nextRound 이번에 확정할 팀편성 차수(기존 assignmentRound + 1)
 * @param gameMode  이번 라운드 확정 게임 모드 — assignmentRound와 함께 원자적으로 커밋된다
 * @param teams     확정된 팀 구성
 */
export async function confirmAssignment(
  code: string,
  nextRound: number,
  gameMode: GameModeId,
  teams: ConfirmedTeamWrite[],
): Promise<void> {
  const batch = writeBatch(db)

  for (const team of teams) {
    for (const member of team.members) {
      batch.update(doc(db, 'rooms', code, 'participants', member.id), {
        team: team.armband,
        isXTeam: team.isXTeam,
        sameGenderStreak: member.nextStreak,
        previousPartnerIds: member.nextPartnerIds,
        isReady: false,
      })
    }
  }

  batch.update(doc(db, 'rooms', code), { assignmentRound: nextRound, gameMode })

  await batch.commit()
}
