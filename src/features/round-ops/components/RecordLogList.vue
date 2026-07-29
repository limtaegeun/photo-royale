<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseSectionHeader from '@/shared/components/BaseSectionHeader.vue'
import BaseSegmented from '@/shared/components/BaseSegmented.vue'
import { displayGroup, groupLabelKo } from '@/features/team-assignment'
import type { Participant } from '@/features/waiting-room'
import type { SubmissionRecord } from '../api/submissions'
import { RECORD_STATUS_LABEL, RECORD_STATUS_TONE } from '../recordStatusStyles'
import { formatRelativeTime } from '../relativeTime'

/**
 * 기록 — 전 라운드의 킬샷 제출·판정 이력을 최신순으로 나열한다(대기 건 포함). 기본은 모든
 * 라운드를 라운드 구분선으로 나눠 보여주고, 상태(전체/대기/확정/반려)와 라운드 필터로 좁힌다.
 * 행을 누르면 선택 이벤트만 낸다 — 대기 건을 판정 시트로 보낼지 상세로 보낼지는 호출부가
 * 라운드·게임 상태를 보고 결정한다.
 */
interface Props {
  /** 판정 이력 — 최신이 위(api가 라운드·제출 시각 내림차순 정렬) */
  records: SubmissionRecord[]
  /** 제출자 이름 조인용 명단 — 문서 ID=uid라 항상 찾을 수 있다(퇴장 삭제 플로우 없음) */
  participants: Participant[]
  /** 상대 시각 계산 기준 — 라운드 타이머의 1초 tick을 그대로 쓴다 */
  nowMs: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  /** 행 선택 — 상세 확인 또는(대기 건) 판정 */
  select: [record: SubmissionRecord]
}>()

const STATUS_FILTER_OPTIONS = [
  { label: '전체', value: 'all' },
  { label: '대기', value: 'pending' },
  { label: '확정', value: 'approved' },
  { label: '반려', value: 'rejected' },
]

const statusFilter = ref<string>('all')
/** null = 모든 라운드 */
const roundFilter = ref<number | null>(null)

/** 라운드 필터 선택지 — 필터로 좁혀도 선택지가 사라지지 않게 전체 기록에서 파생한다 */
const roundOptions = computed(() =>
  [...new Set(props.records.map((record) => record.round))].sort((a, b) => b - a),
)

const filteredRecords = computed(() =>
  props.records.filter(
    (record) =>
      (statusFilter.value === 'all' || record.status === statusFilter.value) &&
      (roundFilter.value === null || record.round === roundFilter.value),
  ),
)

interface RoundGroup {
  round: number
  records: SubmissionRecord[]
}

/** 라운드 구분선용 그룹 — 입력이 라운드 내림차순이라 Map 삽입 순서가 곧 표시 순서다 */
const roundGroups = computed<RoundGroup[]>(() => {
  const byRound = new Map<number, SubmissionRecord[]>()
  for (const record of filteredRecords.value) {
    const group = byRound.get(record.round) ?? []
    group.push(record)
    byRound.set(record.round, group)
  }
  return [...byRound.entries()].map(([round, records]) => ({ round, records }))
})

/** 명단 유실(경계 상황) 시에도 리스트가 깨지지 않게 안전 문구로 흡수한다 */
function submitterName(uid: string): string {
  return props.participants.find((participant) => participant.id === uid)?.name ?? '알 수 없음'
}

/** 색+라벨 병기 규칙 — 완장 알파벳과 그룹 한글 라벨을 항상 함께 쓴다 */
function teamChipLabel(team: string): string {
  const label = groupLabelKo(team)
  return label === '' ? `팀 ${team}` : `팀 ${team} · ${label}`
}

/** 선택 상태별 클래스 — 보더 폭은 고정하고 색만 바꾼다(선택 이동 시 칩 크기 흔들림 방지) */
const ROUND_CHIP_CLASS = {
  selected: 'border-transparent bg-brand text-on-brand',
  selectable: 'border-stroke-strong text-content-secondary hover:text-content',
} as const

function roundChipClass(selected: boolean): string {
  return selected ? ROUND_CHIP_CLASS.selected : ROUND_CHIP_CLASS.selectable
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <BaseSectionHeader title="기록" summary="모든 라운드의 킬샷 제출과 판정 결과예요.">
      <template #aside>
        <BaseBadge tone="neutral" appearance="outline">
          {{ filteredRecords.length }}건
        </BaseBadge>
      </template>
    </BaseSectionHeader>

    <div class="flex flex-col gap-3">
      <BaseSegmented v-model="statusFilter" :options="STATUS_FILTER_OPTIONS" />

      <!-- 라운드가 하나뿐이면 필터가 의미 없어 숨긴다. 칩 수가 라운드만큼 늘어나므로
           BaseSegmented(균등 분할) 대신 가로 스크롤 칩으로 둔다 -->
      <div
        v-if="roundOptions.length >= 2"
        role="group"
        aria-label="라운드 필터"
        class="flex gap-2 overflow-x-auto"
      >
        <button
          type="button"
          :aria-pressed="roundFilter === null"
          class="h-10 shrink-0 rounded-full border px-4 text-label font-bold whitespace-nowrap
                 transition-colors duration-100 ease-standard focus-visible:outline-none
                 focus-visible:ring-2 focus-visible:ring-brand"
          :class="roundChipClass(roundFilter === null)"
          @click="roundFilter = null"
        >
          모든 라운드
        </button>
        <button
          v-for="round in roundOptions"
          :key="round"
          type="button"
          :data-round="round"
          :aria-pressed="roundFilter === round"
          class="h-10 shrink-0 rounded-full border px-4 text-label font-bold whitespace-nowrap
                 transition-colors duration-100 ease-standard focus-visible:outline-none
                 focus-visible:ring-2 focus-visible:ring-brand"
          :class="roundChipClass(roundFilter === round)"
          @click="roundFilter = round"
        >
          라운드 {{ round }}
        </button>
      </div>
    </div>

    <BaseCard v-if="records.length === 0" padding="lg">
      <div class="flex flex-col gap-2">
        <p class="text-body text-content-secondary">아직 기록이 없어요.</p>
        <p class="text-caption break-keep text-content-tertiary">
          참가자가 킬샷을 제출하면 판정 결과까지 이곳에 쌓여요.
        </p>
      </div>
    </BaseCard>

    <BaseCard v-else-if="filteredRecords.length === 0" padding="lg">
      <div class="flex flex-col gap-2">
        <p class="text-body text-content-secondary">조건에 맞는 기록이 없어요.</p>
        <p class="text-caption break-keep text-content-tertiary">
          상태나 라운드 필터를 바꿔 보세요.
        </p>
      </div>
    </BaseCard>

    <div v-else class="flex flex-col gap-4">
      <section v-for="group in roundGroups" :key="group.round" class="flex flex-col gap-3">
        <h3 class="flex items-center gap-3 text-caption font-semibold text-content-tertiary">
          <span aria-hidden="true" class="h-px flex-1 bg-stroke"></span>
          라운드 {{ group.round }}
          <span aria-hidden="true" class="h-px flex-1 bg-stroke"></span>
        </h3>

        <ul class="flex flex-col gap-3">
          <li v-for="record in group.records" :key="record.id">
            <button
              type="button"
              :data-record="record.id"
              class="flex min-h-(--pr-size-control-lg) w-full items-center gap-3 rounded-lg border
                     border-stroke bg-elevated p-3 text-left transition-colors duration-100
                     ease-standard focus-visible:outline-none focus-visible:ring-2
                     focus-visible:ring-brand"
              @click="emit('select', record)"
            >
              <!-- 정보(팀·이름·상태·시각)는 텍스트로 전달하므로 썸네일은 장식으로 둔다 -->
              <img
                :src="record.photo"
                alt=""
                aria-hidden="true"
                class="size-16 shrink-0 rounded-md border border-stroke bg-surface object-cover"
              />
              <span class="flex min-w-0 flex-1 flex-col gap-1">
                <!-- 좁은 화면에서 배지 두 개가 넘치면 잘리는 대신 줄바꿈한다 -->
                <span class="flex flex-wrap items-center gap-1">
                  <BaseBadge :team="displayGroup(record.team) ?? undefined">
                    {{ teamChipLabel(record.team) }}
                  </BaseBadge>
                  <!-- 확정 건은 잡힌 팀까지 한 줄에 — 제출 팀 → 잡힌 팀 -->
                  <template v-if="record.targetTeam !== null">
                    <span aria-hidden="true" class="text-caption text-content-tertiary">→</span>
                    <BaseBadge :team="displayGroup(record.targetTeam) ?? undefined">
                      {{ teamChipLabel(record.targetTeam) }}
                    </BaseBadge>
                  </template>
                </span>
                <span class="truncate text-label text-content">{{ submitterName(record.uid) }}</span>
                <span class="text-caption text-content-secondary">
                  {{ formatRelativeTime(record.createdAtMs, nowMs) }} 제출
                </span>
              </span>
              <BaseBadge
                :tone="RECORD_STATUS_TONE[record.status]"
                appearance="outline"
                class="shrink-0"
              >
                {{ RECORD_STATUS_LABEL[record.status] }}
              </BaseBadge>
              <svg
                aria-hidden="true"
                class="size-4 shrink-0 text-content-tertiary"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="m6 4 4 4-4 4"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
