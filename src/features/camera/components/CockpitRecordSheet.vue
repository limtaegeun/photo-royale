<script setup lang="ts">
import { computed } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseSectionHeader from '@/shared/components/BaseSectionHeader.vue'
import { formatRelativeTime, type SubmissionRecord } from '@/features/round-ops'
import {
  computeStandings,
  teamOutStatus,
  tierLabel,
  type RoundLedger,
} from '@/features/round-ledger'

/**
 * 콕핏 기록 시트(P08 슬롯 4) — "내가 올린 킬샷이 어떻게 됐나, 우리 팀은 지금 몇 킬인가, 지난
 * 라운드 등급은"을 콕핏을 떠나지 않고 본다. 판정 토스트(D-3)는 지나가면 끝이라 다시 볼 곳이 여기다.
 * 전부 콕핏이 이미 쥔 데이터의 읽기 전용 뷰다 — 새 구독·쓰기가 없다.
 *
 * 사진은 본인이 찍은 킬샷만, 썸네일 크기로만 보인다(확대·저장 없음 — 기획자 결정 6, 2026-09-20).
 * 상대 참가자의 얼굴이 찍혀 있어 노출 범위를 이 이상 넓히지 않는다.
 */
interface Props {
  /** 이번 라운드 내 제출 — useJudgmentFeedback의 구독 원본(오래된 순) */
  mySubmissions: SubmissionRecord[]
  /** 이번 차수 원장 — 없는 라운드(도입 전 배정·구독 오류)는 null */
  ledger: RoundLedger | null
  /** 내 완장 — 배정 확인 전이면 null */
  myTeam: string | null
  /** 내 uid — 지난 라운드 순위·편입 크레딧을 찾는 키 */
  myUid: string | null
  /** 정산이 끝난(result 있는) 원장만 — 호출부가 걸러서 넘긴다 */
  pastLedgers: RoundLedger[]
  /** 상대 시각 계산 기준 — 라운드 타이머의 1초 tick을 그대로 쓴다 */
  nowMs: number
  /** 모드가 킬샷을 쓰지 않으면(스태프 추격전) 내 킬샷 섹션을 모드 안내로 대신한다 */
  killshotsDisabled?: boolean
}

const props = withDefaults(defineProps<Props>(), { killshotsDisabled: false })

const open = defineModel<boolean>('open', { default: false })

/** 최신 제출이 위 — 서버 시각 반영 전(null)은 방금 제출한 것이라 맨 앞(기록 탭과 같은 규칙) */
const recentSubmissions = computed(() =>
  [...props.mySubmissions].sort(
    (a, b) =>
      (b.createdAtMs ?? Number.MAX_SAFE_INTEGER) - (a.createdAtMs ?? Number.MAX_SAFE_INTEGER),
  ),
)

/** 상태 배지 라벨 — 인정은 잡은 팀(과 3배)까지 한 배지에 적어 여러 장 중 어느 사진인지 바로 읽힌다 */
function statusLabel(record: SubmissionRecord): string {
  if (record.status === 'pending') return '대기'
  if (record.status === 'rejected') return '반려'
  const parts = ['인정']
  if (record.targetTeam !== null) parts.push(`팀 ${record.targetTeam}`)
  if (record.multiplier === 3) parts.push('3배')
  return parts.join(' · ')
}

/** 우리 팀 이번 라운드 요약 — 원장·내 완장이 다 있을 때만 계산한다 */
const teamSummary = computed(() => {
  const ledger = props.ledger
  const team = props.myTeam
  if (ledger === null || team === null) return null
  const tally = ledger.tally?.[team]
  const kills = tally?.kills ?? 0
  // 3배(낙오 포착) 킬은 tripleKills에만 세므로(M2) 총 킬은 둘의 합이다
  const tripleKills = tally?.tripleKills ?? 0
  const killsLine =
    tripleKills > 0 ? `킬 ${kills + tripleKills}건 (3배 ${tripleKills})` : `킬 ${kills + tripleKills}건`
  return {
    killsLine,
    isOut: teamOutStatus(ledger)[team] === true,
    // 꼬리잡기 편입 크레딧 — 킬 시점 사냥 팀 소속에게 쌓이는 킬 귀속 근거(P07 §4.2). 편입 모드가 아니면 null
    credits: props.myUid === null ? null : (ledger.credits?.[props.myUid] ?? null),
  }
})

/** 지난 라운드 내 누적 — 대기실 순위 시트(computeStandings)와 같은 계산이라 숫자가 어긋나지 않는다 */
const myStanding = computed(() => {
  if (props.myUid === null) return null
  return computeStandings(props.pastLedgers).find((standing) => standing.uid === props.myUid) ?? null
})

const myStandingLine = computed(() => {
  const standing = myStanding.value
  if (standing === null) return ''
  return `순위 ${standing.rank}위 · 누적 ${standing.points}P · 원점수 ${standing.rawScore}`
})

/** 라운드별 내역 한 줄 — "1R 2등급 · 2R 1등급"(StandingsCard.formatRounds와 같은 문구) */
const myRoundsLine = computed(() =>
  (myStanding.value?.rounds ?? [])
    .map((entry) => `${entry.roundNo}R ${tierLabel(entry.tier)}`)
    .join(' · '),
)
</script>

<template>
  <BaseBottomSheet v-model:open="open" title="내 기록">
    <div class="flex flex-col gap-5">
      <section class="flex flex-col gap-3">
        <BaseSectionHeader title="이번 라운드 내 킬샷">
          <template v-if="!killshotsDisabled && recentSubmissions.length > 0" #aside>
            <BaseBadge tone="neutral" appearance="outline">{{ recentSubmissions.length }}건</BaseBadge>
          </template>
        </BaseSectionHeader>

        <p v-if="killshotsDisabled" class="text-body text-content-secondary">
          이 모드에는 킬샷이 없어요.
        </p>
        <p v-else-if="recentSubmissions.length === 0" class="text-body text-content-secondary">
          아직 올린 킬샷이 없어요.
        </p>
        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="record in recentSubmissions"
            :key="record.id"
            class="flex items-center gap-3 rounded-lg border border-stroke bg-surface p-3"
            :data-record="record.id"
          >
            <!-- 본인 사진만 썸네일로 — 확대·저장 경로(링크·버튼)를 두지 않는다 -->
            <img
              :src="record.photo"
              alt="내 킬샷"
              loading="lazy"
              decoding="async"
              class="size-16 shrink-0 rounded-md object-cover"
            />
            <span class="min-w-0 flex-1 text-caption text-content-secondary">
              {{ formatRelativeTime(record.createdAtMs, nowMs) }} 제출
            </span>
            <BaseBadge
              v-if="record.status === 'pending'"
              tone="neutral"
              class="shrink-0"
              :data-status="record.status"
            >
              {{ statusLabel(record) }}
            </BaseBadge>
            <BaseBadge
              v-else-if="record.status === 'approved'"
              tone="success"
              class="shrink-0"
              :data-status="record.status"
            >
              {{ statusLabel(record) }}
            </BaseBadge>
            <BaseBadge
              v-else
              tone="danger"
              appearance="outline"
              class="shrink-0"
              :data-status="record.status"
            >
              {{ statusLabel(record) }}
            </BaseBadge>
          </li>
        </ul>
      </section>

      <section class="flex flex-col gap-3">
        <BaseSectionHeader title="우리 팀 이번 라운드" />

        <p v-if="ledger === null" class="text-body text-content-secondary">
          이번 라운드 집계가 없어요.
        </p>
        <p v-else-if="teamSummary === null" class="text-body text-content-secondary">
          팀 배정을 확인하는 중이에요.
        </p>
        <div v-else class="flex flex-col gap-2 rounded-lg border border-stroke bg-surface p-3">
          <div class="flex items-center justify-between gap-3">
            <p class="text-body text-content">{{ teamSummary.killsLine }}</p>
            <!-- 탈락은 색만으로 가르지 않고 라벨을 병기한다(색약 대응) -->
            <BaseBadge v-if="teamSummary.isOut" tone="danger" class="shrink-0" data-team-status="out">
              탈락
            </BaseBadge>
            <BaseBadge
              v-else
              tone="success"
              appearance="outline"
              class="shrink-0"
              data-team-status="alive"
            >
              생존
            </BaseBadge>
          </div>
          <p v-if="teamSummary.credits !== null" class="text-caption text-content-secondary">
            편입 크레딧 {{ teamSummary.credits }}
          </p>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <BaseSectionHeader title="지난 라운드" />

        <p v-if="pastLedgers.length === 0" class="text-body text-content-secondary">
          아직 끝난 라운드가 없어요.
        </p>
        <p v-else-if="myStanding === null" class="text-body text-content-secondary">
          지난 라운드에 내 기록이 없어요.
        </p>
        <div v-else class="flex flex-col gap-1 rounded-lg border border-stroke bg-surface p-3">
          <p class="text-body text-content">{{ myStandingLine }}</p>
          <p class="text-caption text-content-secondary">{{ myRoundsLine }}</p>
        </div>
      </section>
    </div>
  </BaseBottomSheet>
</template>
