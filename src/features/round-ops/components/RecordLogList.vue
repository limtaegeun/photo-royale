<script setup lang="ts">
import { computed } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseSectionHeader from '@/shared/components/BaseSectionHeader.vue'
import BaseSegmented from '@/shared/components/BaseSegmented.vue'
// 모드 라벨은 game-mode 기능의 소유물이라 public API로만 가져온다(CameraPage 전례)
import { GAME_MODES, type GameModeId } from '@/features/game-mode'
import { displayGroup } from '@/features/team-assignment'
import type { Participant } from '@/features/waiting-room'
import type { SubmissionRecord } from '../api/submissions'
import { RECORD_STATUS_LABEL, RECORD_STATUS_TONE } from '../recordStatusStyles'
import { formatRelativeTime } from '../relativeTime'
import { participantName, teamChipLabel } from '../submissionDisplay'

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
  /**
   * 차수 → 확정 모드 이력(room.roundModes). 키는 차수 문자열이다.
   * 이력을 남기기 전에 확정된 기존 방은 비어 있어 라운드 라벨이 예전처럼 차수만 보여준다.
   */
  roundModes?: Record<string, GameModeId>
}

const props = withDefaults(defineProps<Props>(), { roundModes: () => ({}) })

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

/**
 * 필터는 모델로 열어 둔다 — 탭을 떠나면 이 컴포넌트가 언마운트되면서 내부 ref가 사라져,
 * 판정하러 갔다 돌아온 진행자가 좁혀 둔 조건을 매번 다시 골라야 했다. 호출부가 v-model로
 * 묶으면 상태가 페이지에 남고, 묶지 않으면 로컬 폴백으로 지금처럼 동작한다.
 */
const statusFilter = defineModel<string>('statusFilter', { default: 'all' })
/** null = 모든 라운드 */
const roundFilter = defineModel<number | null>('roundFilter', { default: null })

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

/** 선택 상태별 클래스 — 보더 폭은 고정하고 색만 바꾼다(선택 이동 시 칩 크기 흔들림 방지) */
const ROUND_CHIP_CLASS = {
  selected: 'border-transparent bg-brand text-on-brand',
  selectable: 'border-stroke-strong text-content-secondary hover:text-content',
} as const

function roundChipClass(selected: boolean): string {
  return selected ? ROUND_CHIP_CLASS.selected : ROUND_CHIP_CLASS.selectable
}

/**
 * 라운드 구분선 라벨 — 그 차수의 확정 모드가 이력에 있으면 함께 적는다. 차수만으로는 "라운드 3"이
 * 그룹전이었는지 왕잡기였는지 되짚을 수 없다. 이력이 없는 기존 방은 예전처럼 차수만 보여준다
 * (좁은 라운드 필터 칩은 모드까지 넣으면 넘치므로 손대지 않는다).
 */
function roundGroupLabel(round: number): string {
  const mode = props.roundModes[String(round)]
  return mode === undefined ? `라운드 ${round}` : `라운드 ${round} · ${GAME_MODES[mode].label}`
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
      <!-- overflow-x-auto는 세로도 스크롤 박스로 만들어 ::before 히트 확장이 잘린다 —
           패딩으로 확장분을 박스 안에 수용(레이아웃 이동은 음수 마진으로 상쇄) -->
      <div
        v-if="roundOptions.length >= 2"
        role="group"
        aria-label="라운드 필터"
        class="flex gap-2 overflow-x-auto py-1 -my-1"
      >
        <button
          type="button"
          :aria-pressed="roundFilter === null"
          class="chip-hit relative h-10 shrink-0 rounded-full border px-4 text-label font-bold
                 whitespace-nowrap transition-colors duration-100 ease-standard
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
          class="chip-hit relative h-10 shrink-0 rounded-full border px-4 text-label font-bold
                 whitespace-nowrap transition-colors duration-100 ease-standard
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
          {{ roundGroupLabel(group.round) }}
          <span aria-hidden="true" class="h-px flex-1 bg-stroke"></span>
        </h3>

        <ul class="flex flex-col gap-3">
          <li v-for="record in group.records" :key="record.id" class="log-row">
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
                loading="lazy"
                decoding="async"
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
                <span class="truncate text-label text-content">{{ participantName(participants, record.uid) }}</span>
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

<style scoped>
/* 히트 영역 확장 — 필터 칩 시각 높이(h-10=40px)가 최소 터치 타겟 48px(DESIGN_SYSTEM.md §3-5)
   보다 낮으므로, SelectableMemberChip(team-assignment)의 ::before 확장 선례를 그대로 따른다. */
.chip-hit::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: var(--pr-size-tap-minimum);
  transform: translateY(-50%);
}

/* 오프스크린 행의 레이아웃·페인트를 생략한다 — 사진 목록이 길어질 때 스크롤 성능을 지킨다 */
.log-row {
  content-visibility: auto;
  contain-intrinsic-size: auto 88px;
}
</style>
