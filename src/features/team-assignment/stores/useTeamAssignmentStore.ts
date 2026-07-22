import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Gender } from '@/features/auth'
import { assignTeams, deriveCarryover } from '../teamAssignment'
import { ARMBAND_LABELS, armbandForTeamIndex } from '../armbands'
import { pickXTeams } from '../xRole'
import { confirmAssignment, type ConfirmedTeamWrite } from '../api/assignment'

/**
 * 보드에 올라온 한 명. TeamCandidate(id·gender·sameGenderStreak·previousPartnerIds)를
 * 구조적으로 충족하므로 assignTeams/deriveCarryover에 그대로 넘긴다. name은 표기용이다.
 */
export interface DraftMember {
  id: string
  name: string
  gender: Gender | null
  sameGenderStreak: number
  previousPartnerIds: string[]
}

/** 드래프트 보드의 한 팀 — 완장·멤버·X 겸직 여부 */
export interface DraftTeam {
  armband: string
  members: DraftMember[]
  isXTeam: boolean
}

/**
 * 호스트 팀 배정 보드 — 로컬 드래프트. 배정/재배정/수동 편집을 모두 로컬에서만 하고,
 * confirm() 시 writeBatch 1회로 커밋한다. streak·짝꿍 이력이 확정 시에만 저장되므로
 * 재배정을 몇 번 돌려도 이력이 오염되지 않는다.
 */
export const useTeamAssignmentStore = defineStore('teamAssignment', () => {
  const draftTeams = ref<DraftTeam[]>([])
  /**
   * 이번 드래프트가 확정할 팀편성 차수 — 보드를 여는 시점에 고정된다. 실시간 값을 따라가면
   * 다른 탭의 확정 뒤에 stale 드래프트가 다음 라운드로 슬쩍 커밋되므로(QA N-02), 고정값으로
   * 커밋해 rules의 +1 검사가 stale 확정을 거부하게 한다.
   */
  const draftRound = ref(0)
  /** 보드 진입 후 합류한 미배정 대기자 */
  const waitingPool = ref<DraftMember[]>([])
  const xModuleEnabled = ref(false)
  const selectedMemberId = ref<string | null>(null)
  const isConfirming = ref(false)
  const confirmError = ref<string | null>(null)

  const assignedCount = computed(() =>
    draftTeams.value.reduce((sum, team) => sum + team.members.length, 0),
  )
  const canConfirm = computed(
    () => draftTeams.value.some((team) => team.members.length > 0) && !isConfirming.value,
  )

  /** 현재 draftTeams(완장·멤버 수) 기준으로 X 팀을 재선정해 isXTeam을 다시 마킹한다 */
  function applyXModule(random: () => number = Math.random) {
    const selected = pickXTeams(
      draftTeams.value.map((team) => ({ armband: team.armband, memberCount: team.members.length })),
      random,
    )
    for (const team of draftTeams.value) {
      team.isXTeam = selected.has(team.armband)
    }
  }

  /**
   * 초기 배정 — assignTeams로 2인 1팀 혼성 우선 편성 후 팀 순서대로 완장을 부여한다.
   * X 모듈이 켜져 있으면 X 팀도 함께 선정한다. 대기자·선택 상태는 초기화한다.
   * nextRound(이번에 확정할 차수)는 보드를 여는 시점에 고정해 draftRound에 담는다.
   */
  function startDraft(
    members: DraftMember[],
    nextRound: number,
    random: () => number = Math.random,
  ) {
    const byId = new Map(members.map((member) => [member.id, member]))
    const { teams } = assignTeams(members, random)
    // assignTeams는 멤버를 얕은 복사하므로, id로 원본 DraftMember(name 포함)를 되찾아 담는다
    draftTeams.value = teams.map((team, index) => ({
      armband: armbandForTeamIndex(index),
      members: team.members.map((member) => byId.get(member.id)!),
      isXTeam: false,
    }))
    draftRound.value = nextRound
    if (xModuleEnabled.value) applyXModule(random)
    waitingPool.value = []
    selectedMemberId.value = null
  }

  /**
   * 재배정 — 현재 배정된 전원(대기자 제외)으로 다시 편성한다. X도 편성마다 새로 선정된다.
   * 대기자는 이번 재배정 대상이 아니므로 대기열에 그대로 남는다.
   */
  function reroll(random: () => number = Math.random) {
    const assigned = draftTeams.value.flatMap((team) => team.members)
    const pool = waitingPool.value
    // 재배정은 같은 라운드의 재편성이므로 현재 draftRound를 그대로 유지한다
    startDraft(assigned, draftRound.value, random)
    waitingPool.value = pool
  }

  /** 대기열 합류 — 보드가 열린 뒤 새로 레디한 참가자용. 이미 배정/대기 중이면(id 기준) 무시한다 */
  function addToWaitingPool(member: DraftMember) {
    const inDraft = draftTeams.value.some((team) =>
      team.members.some((existing) => existing.id === member.id),
    )
    const inPool = waitingPool.value.some((existing) => existing.id === member.id)
    if (inDraft || inPool) return
    waitingPool.value.push(member)
  }

  /** 칩 선택 토글 — 같은 id를 다시 고르면 해제하고, null이면 선택을 지운다 */
  function selectMember(id: string | null) {
    if (id === null) {
      selectedMemberId.value = null
      return
    }
    selectedMemberId.value = selectedMemberId.value === id ? null : id
  }

  /**
   * 선택된 멤버를 소속(팀 or 대기열)에서 떼어 대상 팀으로 옮긴다(null이면 대기열로).
   * 이동 후 멤버 수가 2가 아니게 된 팀은 X 겸직을 해제한다(X는 2인 팀만 가능 — 확정 스펙).
   * 빈 팀은 이동 타겟으로 필요하므로 유지한다. 이동 후 선택을 해제한다.
   */
  function moveSelectedTo(targetArmband: string | null) {
    const id = selectedMemberId.value
    if (id === null) return

    let moved: DraftMember | undefined
    for (const team of draftTeams.value) {
      const index = team.members.findIndex((member) => member.id === id)
      if (index !== -1) {
        moved = team.members.splice(index, 1)[0]
        break
      }
    }
    if (!moved) {
      const index = waitingPool.value.findIndex((member) => member.id === id)
      if (index !== -1) moved = waitingPool.value.splice(index, 1)[0]
    }
    if (!moved) return

    if (targetArmband === null) {
      waitingPool.value.push(moved)
    } else {
      const target = draftTeams.value.find((team) => team.armband === targetArmband)
      // 대상 팀이 없으면 멤버를 잃지 않도록 대기열로 되돌린다(정상 UI에선 발생하지 않는다)
      if (target) target.members.push(moved)
      else waitingPool.value.push(moved)
    }

    for (const team of draftTeams.value) {
      if (team.members.length !== 2) team.isXTeam = false
    }
    selectedMemberId.value = null
  }

  /** 사용 중이지 않은 첫 완장으로 빈 팀을 추가한다. 완장을 모두 쓰면 안내를 세팅한다 */
  function addTeam() {
    const used = new Set(draftTeams.value.map((team) => team.armband))
    const next = ARMBAND_LABELS.find((label) => !used.has(label))
    if (next === undefined) {
      confirmError.value = '완장을 모두 사용했어요. 더 이상 팀을 추가할 수 없어요.'
      return
    }
    draftTeams.value.push({ armband: next, members: [], isXTeam: false })
  }

  /** X 모듈 토글 — 켜면 현재 편성 기준으로 X 팀을 재선정하고, 끄면 전 팀의 X를 해제한다 */
  function setXModule(enabled: boolean, random: () => number = Math.random) {
    xModuleEnabled.value = enabled
    if (enabled) {
      applyXModule(random)
    } else {
      for (const team of draftTeams.value) {
        team.isXTeam = false
      }
    }
  }

  /**
   * 배정 확정 — 멤버가 있는 팀만 대상으로 이월값을 재산출해 writeBatch 1회로 커밋한다.
   * 성공 시 드래프트를 초기화하고 true, 실패 시 confirmError를 세팅하고 false를 반환한다.
   */
  async function confirm(code: string): Promise<boolean> {
    if (isConfirming.value) return false

    const teamsWithMembers = draftTeams.value.filter((team) => team.members.length > 0)
    const { nextStreaks, nextPartnerIds } = deriveCarryover(
      teamsWithMembers.map((team) => team.members),
    )
    const payload: ConfirmedTeamWrite[] = teamsWithMembers.map((team) => ({
      armband: team.armband,
      isXTeam: team.isXTeam,
      members: team.members.map((member) => ({
        id: member.id,
        nextStreak: nextStreaks[member.id] ?? 0,
        nextPartnerIds: nextPartnerIds[member.id] ?? [],
      })),
    }))

    isConfirming.value = true
    confirmError.value = null
    try {
      await confirmAssignment(code, draftRound.value, payload)
      reset()
      return true
    } catch {
      confirmError.value = '배정 확정에 실패했어요. 다시 시도해 주세요.'
      return false
    } finally {
      isConfirming.value = false
    }
  }

  /** 전체 초기화 */
  function reset() {
    draftTeams.value = []
    draftRound.value = 0
    waitingPool.value = []
    xModuleEnabled.value = false
    selectedMemberId.value = null
    isConfirming.value = false
    confirmError.value = null
  }

  return {
    draftTeams,
    draftRound,
    waitingPool,
    xModuleEnabled,
    selectedMemberId,
    isConfirming,
    confirmError,
    assignedCount,
    canConfirm,
    startDraft,
    reroll,
    addToWaitingPool,
    selectMember,
    moveSelectedTo,
    addTeam,
    setXModule,
    confirm,
    reset,
  }
})
