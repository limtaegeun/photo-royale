import { computed, onScopeDispose, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from '@/shared/composables/useToast'
import type { KillMultiplier, SubmissionTarget } from '../api/submissions'
import { useRoundOpsStore } from '../stores/useRoundOpsStore'

export type JudgeIntent = 'approve' | 'reject'

/** 카드에서 고르는 중인 값 — 판정 전까지 서버에 쓰지 않는 로컬 상태다 */
export interface JudgeDraft {
  team: string | null
  tripleKill: boolean
}

const EMPTY_DRAFT: JudgeDraft = { team: null, tripleKill: false }

const JUDGE_ERROR_MESSAGE = '판정을 처리하지 못했어요. 다시 시도해 주세요.'

/**
 * 판정이 끝난 뒤 입력을 막는 시간. 카드가 빠지면 다음 카드가 손가락 아래로 올라오는데, 판정은 되돌릴 수
 * 없어서 연타가 다음 킬샷의 반려로 이어지면 복구할 방법이 없다.
 */
export const JUDGE_INPUT_LOCK_MS = 400

/**
 * 판정 탭 카드의 고르기·확정·반려 — 카드를 탭 전환에도 유지되게 하려고 선택값을 페이지 쪽에서 들고 있고,
 * 쓰기는 한 번에 한 건만 나가게 전 카드를 잠근다.
 */
export function useKillshotJudging() {
  const store = useRoundOpsStore()
  const { pendingSubmissions, pendingAction, submissionListenError } = storeToRefs(store)
  const { toast } = useToast()

  /** 킬샷별 선택값 — 기록 필터처럼 탭을 오가며 목록이 언마운트돼도 잃지 않게 카드 밖에 둔다 */
  const drafts = ref<Record<string, JudgeDraft>>({})
  /** 쓰기가 진행 중인 킬샷과 눌린 버튼 — 진행 표시를 그 버튼에만 준다 */
  const activeJudgement = ref<{ submissionId: string; intent: JudgeIntent } | null>(null)
  const isCoolingDown = ref(false)
  const isLocked = computed(() => pendingAction.value === 'judge' || isCoolingDown.value)

  let cooldownTimer: ReturnType<typeof setTimeout> | undefined

  function startCooldown() {
    isCoolingDown.value = true
    clearTimeout(cooldownTimer)
    cooldownTimer = setTimeout(() => {
      isCoolingDown.value = false
    }, JUDGE_INPUT_LOCK_MS)
  }
  onScopeDispose(() => clearTimeout(cooldownTimer))

  function draftOf(submissionId: string): JudgeDraft {
    return drafts.value[submissionId] ?? EMPTY_DRAFT
  }

  function updateDraft(submissionId: string, patch: Partial<JudgeDraft>) {
    drafts.value[submissionId] = { ...draftOf(submissionId), ...patch }
  }

  /** 큐에 없는 킬샷의 선택값을 지우고, 팀까지 골라 둔 건이 있었는지 돌려준다 */
  function discardDraftsOutsideQueue(): boolean {
    const liveIds = new Set(pendingSubmissions.value.map((submission) => submission.id))
    const goneIds = Object.keys(drafts.value).filter((id) => !liveIds.has(id))
    const hadPickedTeam = goneIds.some((id) => drafts.value[id]?.team != null)
    for (const id of goneIds) Reflect.deleteProperty(drafts.value, id)
    return hadPickedTeam
  }

  /** 실패 원인을 큐의 로컬 상태로 추정하지 않고 서버 문서의 확정 상태로 판별한다. */
  async function reportFailure(submissionId: string) {
    let status = null
    try {
      status = await store.getSubmissionStatus(submissionId)
    } catch {
      // 서버 확인까지 실패하면 선판정으로 단정하지 않고 재시도 가능한 일반 오류로 남긴다.
    }
    if (status === 'approved' || status === 'rejected') {
      Reflect.deleteProperty(drafts.value, submissionId)
      toast({ title: '이미 판정된 킬샷이에요.', tone: 'neutral' })
      return
    }
    toast({ title: JUDGE_ERROR_MESSAGE, tone: 'danger' })
  }

  /**
   * 쓰기 하나를 잠금과 함께 돌린다. 성공하면 이 킬샷의 선택값과, 탈락시키는 확정이 같은 배치로 자동 반려해
   * 큐에서 함께 빠진 킬샷의 선택값까지 조용히 지운다(P12) — 내 판정의 결과라 "이미 판정됨" 안내 대상이 아니다.
   */
  async function runJudgement(
    submissionId: string,
    intent: JudgeIntent,
    write: () => Promise<boolean>,
  ): Promise<boolean> {
    if (isLocked.value) return false
    activeJudgement.value = { submissionId, intent }
    const succeeded = await write()
    activeJudgement.value = null
    if (!succeeded) {
      await reportFailure(submissionId)
      return false
    }
    Reflect.deleteProperty(drafts.value, submissionId)
    discardDraftsOutsideQueue()
    startCooldown()
    return true
  }

  async function approve(submissionId: string, target: SubmissionTarget, multiplier: KillMultiplier) {
    const approved = await runJudgement(submissionId, 'approve', () =>
      store.approveSubmission(submissionId, target, multiplier),
    )
    if (!approved) return false
    toast({
      title:
        multiplier === 3
          ? `팀 ${target.team} 낙오 포착 킬샷(3배)으로 판정했어요.`
          : `팀 ${target.team} 킬샷으로 판정했어요.`,
      tone: 'success',
    })
    return true
  }

  async function reject(submissionId: string) {
    const rejected = await runJudgement(submissionId, 'reject', () =>
      store.rejectSubmission(submissionId),
    )
    if (!rejected) return false
    toast({ title: '킬샷을 반려했어요.', tone: 'neutral' })
    return true
  }

  // 같은 계정 다른 기기에서 먼저 판정돼 카드가 사라지면 고르던 사람에게만 알린다 — 골라 둔 것 없이
  // 사라진 카드는 하던 일이 끊긴 게 아니다. 내 쓰기 중의 변화는 쓰기 결과(runJudgement)가 정리한다.
  watch(pendingSubmissions, () => {
    if (pendingAction.value === 'judge') return
    const hadPickedTeam = discardDraftsOutsideQueue()
    // Listen 자체가 종료되며 store가 stale 큐를 비운 경우는 다른 기기의 선판정이 아니다.
    if (!hadPickedTeam || submissionListenError.value !== null) return
    toast({ title: '이미 판정된 킬샷이에요.', tone: 'neutral' })
  })

  return { drafts, draftOf, updateDraft, activeJudgement, isLocked, approve, reject }
}
