<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, useTemplateRef, watch } from 'vue'
import {
  groupOnSolidTextClass,
  groupSolidBgClass,
  groupTextClass,
} from '@/features/team-assignment'
import type { DialTeam } from '../teamSections'

/**
 * 드럼 다이얼 — 돌려서 멈춘 줄의 팀을 고른다. 가운데 띠에 멈춘 뒤에야 고른 값으로 치므로, 돌리는 중에는
 * moving이 켜져 호출부가 확정 버튼을 막는다. 맨 위 안내 줄에 멈추면 선택 없음이다. 줄을 눌러도 그 줄로 돌아간다.
 *
 * 줄이 화면보다 많으면 묶음을 여러 벌 깔아 원통처럼 끝없이 돌게 하고, 멈출 때마다 가운데 묶음의 같은 줄로
 * 몰래 옮긴다. 다이얼에 없는 팀은 고를 수 없다 — 어떤 팀을 넘길지는 호출부가 정한다.
 */
interface Props {
  /** 고를 수 있는 팀 — 알파벳 순서로 받는다 */
  teams: DialTeam[]
  /** 맨 위 안내 줄 문구 */
  hint: string
  /** compact: 낮은 줄(이름 한 줄, 넘치면 두 줄) · roomy: 높은 줄(이름을 쌓는다) */
  density: 'compact' | 'roomy'
  /** 원통이 기우는 정도 — 줄이 많이 보이는 다이얼은 작게 줘서 위아래 줄도 읽히게 한다 */
  tilt?: number
  /** 쓰기 중이거나 판정 직후라 입력을 막는다 */
  locked?: boolean
}

const props = withDefaults(defineProps<Props>(), { tilt: 12, locked: false })

const picked = defineModel<string | null>({ default: null })
/** 돌리는 중(손가락이 닿아 있거나 아직 멈추지 않음) */
const moving = defineModel<boolean>('moving', { default: false })

const ROW_HEIGHT_CLASS = { compact: 'h-11', roomy: 'h-16' } as const
/** 원통을 몇 벌 깔지 — 멈출 때 가운데(RING_CENTER_COPY)로 돌아오므로 위아래로 두 벌씩 여유가 있다 */
const RING_COPIES = 5
const RING_CENTER_COPY = 2
/** 스크롤이 이 시간 동안 멎으면 멈춘 것으로 본다 */
const SETTLE_DELAY_MS = 130
const PICK_VIBRATION_MS = 6
/** 멀어질수록 흐려지고 작아지는 값 — 시안의 원통 모양. 세 줄 너머는 더 변하지 않는다 */
const FADE_PER_ROW = 0.175
const SHRINK_PER_ROW = 0.03
const FADE_ROWS_MAX = 3
const TILT_DEG_MAX = 60
/** 보이는 줄 위아래로 이만큼만 그린다 — 원통의 줄 전부를 프레임마다 고치면 느리다 */
const PAINT_REACH_ROWS = 7

const wheelRef = useTemplateRef<HTMLElement>('wheel')
const baseId = useId()

/** 측정값 — 처음 그린 뒤 채운다. 박스가 없으면(0) 원통도 여백도 만들지 않는다 */
const wheelHeight = ref(0)
const rowHeight = ref(0)
/** 한 줄에 다 안 들어가 두 줄로 쌓는 팀 */
const stackedTeams = ref(new Set<string>())

let isTouching = false
/** 코드가 옮긴 자리 — 이 자리에서 온 스크롤 이벤트는 돌리기 시작한 것으로 치지 않는다 */
let programmaticTop: number | null = null
let settleTimer: ReturnType<typeof setTimeout> | undefined
let rowElements: HTMLElement[] = []
let resizeObserver: ResizeObserver | null = null

/** 맨 위 안내 줄(null) + 팀 — 한 묶음 */
const cycle = computed<(DialTeam | null)[]>(() => [null, ...props.teams])
const cycleKey = computed(() => props.teams.map((team) => team.armband).join())

const isRing = computed(
  () =>
    wheelHeight.value > 0 &&
    rowHeight.value > 0 &&
    cycle.value.length > Math.ceil(wheelHeight.value / rowHeight.value),
)
const copies = computed(() => (isRing.value ? RING_COPIES : 1))
const centerCopy = computed(() => (isRing.value ? RING_CENTER_COPY : 0))
/** 원통이 아니면 첫 줄과 끝 줄도 가운데 띠에 오도록 위아래를 비운다 */
const padHeight = computed(() =>
  isRing.value ? 0 : Math.max(0, (wheelHeight.value - rowHeight.value) / 2),
)

const rows = computed(() => {
  const list: { key: string; copy: number; team: DialTeam | null }[] = []
  for (let copy = 0; copy < copies.value; copy += 1) {
    for (const team of cycle.value) {
      list.push({ key: `${copy}-${team?.armband ?? 'hint'}`, copy, team })
    }
  }
  return list
})

/** 멈춘 줄에만 팀 색을 입힌다 — 돌리는 중에 색이 깜빡이면 고른 것처럼 보인다 */
const settledPick = computed(() => (moving.value ? null : picked.value))

function isActiveRow(row: { copy: number; team: DialTeam | null }) {
  return row.team !== null && row.copy === centerCopy.value && row.team.armband === settledPick.value
}

function optionId(armband: string | null) {
  return `${baseId}-${armband ?? 'hint'}`
}

function ariaLabelOf(team: DialTeam | null) {
  if (team === null) return 'no team'
  const mark = team.mark === null ? '' : `, ${team.mark}`
  return `team ${team.armband} ${team.members.join(', ')}${mark}`
}

function refreshRowElements() {
  rowElements = [...(wheelRef.value?.querySelectorAll<HTMLElement>('[data-dial-row]') ?? [])]
}

function indexAtMiddle(wheel: HTMLElement) {
  const position = (wheel.scrollTop + wheel.clientHeight / 2 - padHeight.value) / rowHeight.value
  return Math.max(0, Math.min(rowElements.length - 1, Math.floor(position)))
}

function teamAtMiddle(wheel: HTMLElement) {
  return rowElements[indexAtMiddle(wheel)]?.dataset.team ?? null
}

/** 이 줄이 가운데 띠에 오는 스크롤 위치 */
function topOf(wheel: HTMLElement, copy: number, armband: string | null) {
  const index = Math.max(
    cycle.value.findIndex((team) => (team?.armband ?? null) === armband),
    0,
  )
  const rowIndex = copy * cycle.value.length + index
  return padHeight.value + rowIndex * rowHeight.value + rowHeight.value / 2 - wheel.clientHeight / 2
}

/** 원통 모양 — 줄마다 가운데서 떨어진 만큼 기울이고 흐린다. 프레임마다 돌아서 DOM에 바로 쓴다 */
function paint() {
  const wheel = wheelRef.value
  if (wheel === null || rowHeight.value === 0) return
  const middle = wheel.scrollTop + wheel.clientHeight / 2
  const center = indexAtMiddle(wheel)
  const first = Math.max(0, center - PAINT_REACH_ROWS)
  const last = Math.min(rowElements.length - 1, center + PAINT_REACH_ROWS)
  for (let index = first; index <= last; index += 1) {
    const rowMiddle = padHeight.value + index * rowHeight.value + rowHeight.value / 2
    const distance = (rowMiddle - middle) / rowHeight.value
    const reach = Math.min(Math.abs(distance), FADE_ROWS_MAX)
    const tilt = Math.max(-TILT_DEG_MAX, Math.min(TILT_DEG_MAX, -distance * props.tilt))
    const style = rowElements[index]!.style
    style.opacity = String(1 - reach * FADE_PER_ROW)
    style.transform = `rotateX(${tilt}deg) scale(${1 - reach * SHRINK_PER_ROW})`
  }
}

/** 코드로 스크롤을 옮긴다 — 돌린 게 아니라서 멈춤 판정을 태우지 않는다 */
function moveProgrammatically(wheel: HTMLElement, top: number) {
  if (Math.abs(wheel.scrollTop - top) < 1) return
  wheel.scrollTop = top
  programmaticTop = wheel.scrollTop
}

/** 고른 값이 있는 줄로 바로 옮긴다 */
function placeAtPick() {
  const wheel = wheelRef.value
  if (wheel === null || wheelHeight.value === 0) return
  moveProgrammatically(wheel, topOf(wheel, centerCopy.value, picked.value))
  paint()
}

function armSettle() {
  clearTimeout(settleTimer)
  settleTimer = setTimeout(settle, SETTLE_DELAY_MS)
}

function settle() {
  const wheel = wheelRef.value
  if (wheel === null || isTouching) return
  const team = teamAtMiddle(wheel)
  if (team !== picked.value) {
    picked.value = team
    if (team !== null) navigator.vibrate?.(PICK_VIBRATION_MS)
  }
  // 원통: 가운데 묶음 밖에서 멈췄으면 같은 줄이 있는 가운데 묶음으로 몰래 옮긴다
  const copy = Math.floor(indexAtMiddle(wheel) / cycle.value.length)
  if (isRing.value && copy !== RING_CENTER_COPY) {
    wheel.style.scrollSnapType = 'none'
    moveProgrammatically(
      wheel,
      wheel.scrollTop + (RING_CENTER_COPY - copy) * cycle.value.length * rowHeight.value,
    )
    wheel.style.scrollSnapType = ''
  }
  paint()
  moving.value = false
}

function handleScroll(event: Event) {
  paint()
  const top = (event.currentTarget as HTMLElement).scrollTop
  const isFromCode = programmaticTop !== null && Math.abs(top - programmaticTop) < 1
  programmaticTop = null
  if (isFromCode) return
  moving.value = true
  armSettle()
}

function handleTouchStart() {
  isTouching = true
  moving.value = true
}

function handleTouchEnd() {
  isTouching = false
  armSettle()
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function handleKeydown(event: KeyboardEvent) {
  if (props.locked || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
  event.preventDefault()
  const step = event.key === 'ArrowDown' ? rowHeight.value : -rowHeight.value
  wheelRef.value?.scrollBy({ top: step, behavior: scrollBehavior() })
}

/** 줄을 누르면 바로 고르고 그 줄로 돌아간다 — 멈춤 판정이 같은 값을 다시 읽으니 고른 값은 어긋나지 않는다 */
function handleRowTap(row: { copy: number; team: DialTeam | null }) {
  if (props.locked) return
  const armband = row.team?.armband ?? null
  picked.value = armband
  const wheel = wheelRef.value
  if (wheel === null || wheelHeight.value === 0) return
  const top = topOf(wheel, row.copy, armband)
  if (Math.abs(top - wheel.scrollTop) <= 2) return
  moving.value = true
  wheel.scrollTo({ top, behavior: scrollBehavior() })
}

/** 한 줄에 안 들어가는 팀만 두 줄로 쌓는다 — 12자 닉네임 둘이면 폭을 넘는다 */
function measureNames() {
  const stacked = new Set<string>()
  for (const line of wheelRef.value?.querySelectorAll<HTMLElement>('[data-dial-names]') ?? []) {
    const armband = line.closest<HTMLElement>('[data-team]')?.dataset.team
    if (armband !== undefined && line.scrollWidth > line.clientWidth) stacked.add(armband)
  }
  stackedTeams.value = stacked
}

async function layOut() {
  const wheel = wheelRef.value
  if (wheel === null) return
  rowHeight.value = wheel.querySelector<HTMLElement>('[data-dial-row]')?.offsetHeight ?? 0
  wheelHeight.value = wheel.clientHeight
  stackedTeams.value = new Set()
  await nextTick()
  refreshRowElements()
  measureNames()
  if (!isTouching) placeAtPick()
}

onMounted(() => {
  void layOut()
  if (typeof ResizeObserver !== 'undefined' && wheelRef.value !== null) {
    resizeObserver = new ResizeObserver(() => void layOut())
    resizeObserver.observe(wheelRef.value)
  }
})

onBeforeUnmount(() => {
  clearTimeout(settleTimer)
  resizeObserver?.disconnect()
})

// 다른 판정으로 팀이 빠지면 줄이 바뀐다 — 고른 값이 있는 자리로 다시 맞춘다
watch(cycleKey, () => void layOut(), { flush: 'post' })
watch(
  () => props.density,
  () => void layOut(),
  { flush: 'post' },
)

// 호출부가 선택을 풀면(고른 팀이 다른 판정으로 탈락) 안내 줄로 돌아간다. 돌리는 중이면 멈춤 판정이 맡는다
watch(
  picked,
  () => {
    const wheel = wheelRef.value
    if (wheel === null || wheelHeight.value === 0 || isTouching || moving.value) return
    if (teamAtMiddle(wheel) !== picked.value) placeAtPick()
  },
  { flush: 'post' },
)
</script>

<template>
  <div class="relative min-h-0 min-w-0 overflow-hidden rounded-lg bg-elevated">
    <div
      aria-hidden="true"
      data-dial-band
      class="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 rounded-md transition-colors
             duration-100 ease-standard"
      :class="[
        ROW_HEIGHT_CLASS[density],
        settledPick === null ? 'bg-surface' : groupSolidBgClass(settledPick),
      ]"
    />
    <div
      ref="wheel"
      role="listbox"
      aria-label="team dial"
      :aria-activedescendant="optionId(picked)"
      :aria-disabled="locked || undefined"
      tabindex="0"
      class="dial-wheel relative h-full snap-y snap-mandatory overflow-y-auto overscroll-contain touch-pan-y
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      :class="{ 'pointer-events-none': locked }"
      @scroll.passive="handleScroll"
      @touchstart.passive="handleTouchStart"
      @touchend.passive="handleTouchEnd"
      @touchcancel.passive="handleTouchEnd"
      @keydown="handleKeydown"
    >
      <div v-if="padHeight > 0" aria-hidden="true" :style="{ height: `${padHeight}px` }" />
      <!-- 여러 벌 중 가운데 묶음만 낭독기에 알린다 -->
      <div
        v-for="row in rows"
        :id="row.copy === centerCopy ? optionId(row.team?.armband ?? null) : undefined"
        :key="row.key"
        data-dial-row
        role="option"
        :data-team="row.team?.armband"
        :aria-label="ariaLabelOf(row.team)"
        :aria-selected="(row.team?.armband ?? null) === picked"
        :aria-hidden="row.copy !== centerCopy || undefined"
        class="flex snap-center items-center gap-2 overflow-hidden px-3 select-none will-change-transform"
        :class="[ROW_HEIGHT_CLASS[density], row.team === null ? 'justify-center' : '']"
        @click="handleRowTap(row)"
      >
        <span v-if="row.team === null" class="text-label font-normal text-content-tertiary">{{ hint }}</span>
        <template v-else>
          <span
            class="w-5 shrink-0 text-center text-subheading leading-(--pr-line-height-tight) font-bold"
            :class="isActiveRow(row) ? groupOnSolidTextClass(row.team.armband) : groupTextClass(row.team.armband)"
          >
            {{ row.team.armband }}
          </span>
          <span
            class="min-w-0 flex-1 text-caption"
            :class="isActiveRow(row) ? groupOnSolidTextClass(row.team.armband) : 'text-content-secondary'"
          >
            <!-- 높은 줄은 폭이 좁아 긴 닉네임이 줄바꿈된다. 줄 높이 안에 네 줄까지 들어간다 -->
            <template v-if="density === 'roomy'">
              <span v-for="member in row.team.members" :key="member" class="block leading-4 break-all">
                {{ member }}
              </span>
            </template>
            <template v-else-if="stackedTeams.has(row.team.armband)">
              <span v-for="member in row.team.members" :key="member" class="block truncate leading-4">
                {{ member }}
              </span>
            </template>
            <span v-else data-dial-names class="block truncate">{{ row.team.members.join(' · ') }}</span>
          </span>
          <span
            v-if="row.team.mark !== null"
            class="flex h-5 shrink-0 items-center rounded-full border border-current px-2 text-caption font-semibold whitespace-nowrap"
            :class="isActiveRow(row) ? groupOnSolidTextClass(row.team.armband) : 'text-content-secondary'"
          >
            {{ row.team.mark }}
          </span>
        </template>
      </div>
      <div v-if="padHeight > 0" aria-hidden="true" :style="{ height: `${padHeight}px` }" />
    </div>
  </div>
</template>

<style scoped>
.dial-wheel {
  /* 줄이 원통을 따라 기우는 시점 거리 — 시안 값 */
  perspective: 32.5rem;
  scrollbar-width: none;
}
.dial-wheel::-webkit-scrollbar {
  display: none;
}
</style>
