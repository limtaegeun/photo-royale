import { doc, writeBatch } from 'firebase/firestore'
import { db } from '@/shared/api/firebase'
import type { GameModeId } from '@/features/game-mode'

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
 * isReady를 false로 리셋(라운드마다 재레디), 방 문서 assignmentRound를 올리며 이번 차수의
 * 모드를 roundModes 이력에 남긴다.
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
        // 이 완장이 몇 차 편성인지 함께 남긴다 — 이번 라운드에 대기자로 내려간 참가자는
        // 이 배치에 없어 team이 직전 값으로 남으므로, 차수 마커로 유효 배정만 걸러낸다
        assignedRound: nextRound,
        isXTeam: team.isXTeam,
        sameGenderStreak: member.nextStreak,
        previousPartnerIds: member.nextPartnerIds,
        isReady: false,
      })
    }
  }

  batch.update(doc(db, 'rooms', code), {
    assignmentRound: nextRound,
    gameMode,
    // gameMode는 확정마다 덮어써져 과거 라운드가 무슨 모드였는지 어디에도 남지 않는다(제출 문서에도
    // 모드 필드가 없다). 그래서 차수 → 모드 이력을 같은 배치에 원자적으로 쌓아, 기록 탭의 라운드
    // 라벨과 "아직 안 한 모드" 파악(기획: 다섯 모드 전부 진행)의 근거 데이터로 쓴다.
    // dot-path로 해당 차수 키만 병합한다 — 맵을 통째로 쓰면 과거 차수를 지울 위험이 있다.
    [`roundModes.${nextRound}`]: gameMode,
  })

  await batch.commit()
}
