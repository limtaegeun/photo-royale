<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import {
  isAssignedInRound,
  normalizeRoomCode,
  subscribeToParticipants,
  subscribeToRoom,
  type Participant,
  type RoomInfo,
} from '@/features/waiting-room'
import { useAuthStore } from '@/features/auth'
import { GAME_MODES } from '@/features/game-mode'
import { groupTextClass } from '@/features/team-assignment'
import { useToast } from '@/shared/composables/useToast'
import { subscribeToLatestNotice, type Notice, useRoundTimer } from '@/features/round-ops'
import { useCameraStream } from './composables/useCameraStream'
import { useKillshotSubmit } from './composables/useKillshotSubmit'
import { usePhotoCapture } from './composables/usePhotoCapture'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { toast } = useToast()
const { status, stream, start } = useCameraStream()
const { photo, failed, capture, clear } = usePhotoCapture()
const { isSubmitting, submit } = useKillshotSubmit()
const videoRef = ref<HTMLVideoElement | null>(null)
const room = ref<RoomInfo | null>(null)
const participants = ref<Participant[]>([])
const latestNotice = ref<Notice | null>(null)
const noticeExpanded = ref(false)
const noticeResumeImmediately = ref(false)
const noticeViewportRef = ref<HTMLElement | null>(null)
const noticeTextRef = ref<HTMLElement | null>(null)
const noticeOverflowDistance = ref(0)
const noticeIsOverflowing = computed(
  () => !noticeExpanded.value && noticeOverflowDistance.value > 1,
)
const noticeMarqueeStyle = computed(() => ({
  '--notice-marquee-offset': `-${noticeOverflowDistance.value}px`,
  // 게임 중 곁눈질로도 읽을 수 있게 약 24px/s로 이동하고 양 끝에 머무는 시간을 둔다.
  '--notice-marquee-duration': `${Math.max(16, noticeOverflowDistance.value / 24 + 4)}s`,
}))
const controlColumns = [
  [
    { n: 1, label: '아이템' },
    { n: 3, label: '지도' },
  ],
  [
    { n: 2, label: '아이템' },
    { n: 4, label: '기록' },
  ],
] as const

/** 콕핏은 방에 매여 있다 — 경로의 코드가 어느 방의 라운드를 뛰는 중인지 가리킨다 */
const roomCode = normalizeRoomCode(String(route.params.roomCode))

/**
 * 방 문서 구독 — 콕핏이 스스로 나갈 시점을 알기 위한 최소한의 연결이다.
 * 호스트가 게임을 종료하면(status가 waiting으로 돌아가거나 round가 사라지면) 플레이어는
 * 뛰는 것을 멈추고 대기실로 돌아가야 하는데, 구독이 없으면 카메라 화면에 갇힌다.
 * (라운드 타이머·공지 수신 UI는 이 구독 위에 후속으로 얹는다)
 */
let unsubscribeRoom: (() => void) | null = null
let unsubscribeParticipants: (() => void) | null = null
let unsubscribeNotice: (() => void) | null = null
let subscriptionFailed = false
let noticeResizeObserver: ResizeObserver | null = null

const round = computed(() => room.value?.round ?? null)
const { formatted: remainingTime, displayState } = useRoundTimer(round)
/**
 * 타이머가 0에 닿은 상태 — 확정 스펙(라운드당 20분)이 표시로만 존재하지 않도록 셔터·제출을
 * 여기서 잠근다(RoundOpsPage의 동일 이름 파생값과 같은 뜻: displayState === 'ended').
 */
const isRoundEnded = computed(() => displayState.value === 'ended')
/**
 * 진행자가 일시정지(올스탑)를 건 상태 — 정지 중에도 셔터·제출이 살아 있으면 안전을 위한
 * 전원 정지가 게임적으로는 지켜지지 않는다. ended가 항상 paused보다 먼저다(정지 중 남은
 * 시간이 0에 닿으면 displayState가 자연히 'ended'로 넘어가 이 값은 false로 물러난다).
 */
const isPaused = computed(() => displayState.value === 'paused')
const currentMode = computed(() => GAME_MODES[room.value?.gameMode ?? 'normal'])
const objective = computed(
  () =>
    currentMode.value.rules.find((rule) => rule.kind === 'static')?.text ??
    currentMode.value.description,
)
const assignedParticipants = computed(() =>
  participants.value.filter((participant) =>
    isAssignedInRound(participant, room.value?.assignmentRound ?? 0),
  ),
)
const me = computed(
  () =>
    assignedParticipants.value.find((participant) => participant.id === authStore.user?.uid) ??
    null,
)
const teammates = computed(() =>
  me.value === null
    ? []
    : assignedParticipants.value.filter(
        (participant) => participant.team === me.value?.team && participant.id !== me.value?.id,
      ),
)
const assignedTeamCount = computed(
  // 탈락 상태는 아직 데이터 모델에 없다. 탈락 모델 기능이 추가되면 배정 팀 수 대신
  // 실제 생존 상태를 기준으로 계산하도록 교체한다.
  () => new Set(assignedParticipants.value.map((participant) => participant.team)).size,
)
const teamLabel = computed(() => {
  if (me.value?.team === null || me.value === null) return '팀 확인 중'
  const partnerNames = teammates.value.map((participant) => participant.name).join(' · ')
  return partnerNames ? `팀 ${me.value.team} · ${partnerNames}` : `팀 ${me.value.team} · 1인 팀`
})

function leaveCockpit(nextRoom: RoomInfo | null) {
  room.value = nextRoom
  if (nextRoom === null) {
    toast({ title: '방을 찾을 수 없어요.', tone: 'danger' })
    router.replace({ name: 'entry' })
    return
  }
  if (nextRoom.status !== 'playing' || nextRoom.round === null) {
    router.replace({ name: 'waiting-room', params: { roomCode } })
  }
}

function handleSubscriptionError() {
  if (subscriptionFailed) return
  subscriptionFailed = true
  toast({ title: '게임 정보를 불러올 수 없어요. 다시 입장해주세요.', tone: 'danger' })
  router.replace({ name: 'entry' })
}

async function measureNoticeOverflow() {
  await nextTick()
  const viewport = noticeViewportRef.value
  const text = noticeTextRef.value
  noticeOverflowDistance.value =
    noticeExpanded.value || viewport === null || text === null
      ? 0
      : Math.max(0, text.scrollWidth - viewport.clientWidth)
}

function toggleNotice() {
  if (noticeExpanded.value) noticeResumeImmediately.value = true
  noticeExpanded.value = !noticeExpanded.value
}

function handleNoticeAnimationIteration() {
  if (noticeResumeImmediately.value) noticeResumeImmediately.value = false
}

watch(latestNotice, () => {
  noticeResumeImmediately.value = false
})
watch([latestNotice, noticeExpanded], measureNoticeOverflow, { flush: 'post' })
watch(
  noticeViewportRef,
  (viewport, previousViewport) => {
    if (previousViewport) noticeResizeObserver?.unobserve(previousViewport)
    if (viewport) noticeResizeObserver?.observe(viewport)
    measureNoticeOverflow()
  },
  { flush: 'post' },
)

watch([stream, videoRef], ([media, video]) => {
  if (!video) return

  video.srcObject = media
  if (media) {
    // jsdom은 play()가 Promise를 반환하지 않으므로 옵셔널 체이닝으로 방어
    video.play()?.catch(() => {})
  }
})

async function shoot() {
  if (!videoRef.value) return
  await capture(videoRef.value)
}

/**
 * 킬샷 제출 — 공격팀 선택은 없다(확정 스펙: 대상 팀 식별은 호스트가 판정 시 수행).
 * 성공하면 미리보기를 비우고 콕핏으로 돌아가 다음 킬샷을 이어서 찍을 수 있게 한다.
 */
async function submitPhoto() {
  // 확인 화면이 열린 채 00:00을 넘기는 경우를 막는다 — 셔터 비활성만으로는
  // 이미 찍어둔 사진의 제출을 잠그지 못한다.
  if (isRoundEnded.value) {
    toast({ title: '라운드가 종료되어 제출할 수 없어요.', tone: 'danger' })
    return
  }
  // 확인 화면이 열린 채 일시정지가 걸리는 경우를 막는다 — 셔터 비활성만으로는
  // 이미 찍어둔 사진의 제출을 잠그지 못한다.
  if (isPaused.value) {
    toast({ title: '일시정지 중에는 제출할 수 없어요.', tone: 'danger' })
    return
  }
  const killshot = photo.value
  const submitter = me.value
  const currentRoom = room.value
  if (killshot === null || submitter?.team == null || currentRoom === null) return

  const submitted = await submit({
    roomCode,
    uid: submitter.id,
    team: submitter.team,
    round: currentRoom.assignmentRound,
    photo: killshot,
  })
  if (!submitted) {
    // 실패 시 사진을 보존한다 — 현장에서 같은 장면을 다시 만들 수 없다
    toast({ title: '제출에 실패했어요. 다시 시도해 주세요.', tone: 'danger' })
    return
  }
  clear()
  // 판정 결과를 게스트에게 전달하는 채널이 없으므로 "기다려 주세요"를 약속하지 않는다
  toast({ title: '킬샷을 제출했어요.', tone: 'success' })
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    noticeResizeObserver = new ResizeObserver(measureNoticeOverflow)
  }
  window.addEventListener('resize', measureNoticeOverflow)
  start()
  unsubscribeRoom = subscribeToRoom(roomCode, leaveCockpit, handleSubscriptionError)
  unsubscribeParticipants = subscribeToParticipants(
    roomCode,
    (nextParticipants) => {
      participants.value = nextParticipants
    },
    handleSubscriptionError,
  )
  unsubscribeNotice = subscribeToLatestNotice(
    roomCode,
    (notice) => {
      latestNotice.value = notice
    },
    handleSubscriptionError,
  )
})
onUnmounted(() => {
  noticeResizeObserver?.disconnect()
  noticeResizeObserver = null
  window.removeEventListener('resize', measureNoticeOverflow)
  unsubscribeRoom?.()
  unsubscribeParticipants?.()
  unsubscribeNotice?.()
  unsubscribeRoom = null
  unsubscribeParticipants = null
  unsubscribeNotice = null
})
</script>

<template>
  <section class="relative flex min-h-dvh flex-col overflow-hidden bg-canvas text-content">
    <video
      v-show="status === 'active'"
      ref="videoRef"
      class="absolute inset-0 h-full w-full object-cover"
      autoplay
      muted
      playsinline
    ></video>

    <template v-if="status === 'active' && !photo">
      <!-- 화면 전체를 덮는 바 대신, 읽어야 하는 정보 단위에만 작은 스크림을 둔다. -->
      <header
        class="absolute inset-x-0 top-0 z-(--pr-z-hud) flex flex-col gap-2 px-4 pt-(--pr-inset-top-safe)"
      >
        <div class="mt-3 flex items-start gap-3 rounded-lg bg-scrim-strong p-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <BaseBadge tone="accent">목표</BaseBadge>
              <span class="text-caption text-content-secondary">{{ currentMode.label }}</span>
            </div>
            <p class="mt-1 text-label text-pretty break-keep">
              {{ isRoundEnded ? '라운드가 종료됐어요. 진행자 안내를 기다려 주세요.' : objective }}
            </p>
          </div>
          <div class="shrink-0 text-right" aria-label="게임 남은 시간">
            <p class="text-caption text-content-secondary">남은 시간</p>
            <p
              class="font-mono text-subheading"
              :class="isPaused || isRoundEnded ? 'text-warning' : 'text-info'"
            >
              {{ remainingTime }}
            </p>
          </div>
        </div>

        <!--
          일시정지는 목표·공지를 덮어쓰지 않고 자기 자리에서 알린다 — 정지가 풀리면 그대로
          사라져야 하는 일시적 상태라, 계속 읽혀야 하는 목표나 진행자 공지를 대체하면
          정지가 끝난 뒤에도 원문이 무엇이었는지 알 수 없다. 셔터가 잠긴 이유도 여기서 읽힌다.
        -->
        <div
          v-if="isPaused"
          role="status"
          class="flex items-center gap-2 rounded-lg border border-warning bg-scrim-strong p-3"
        >
          <BaseBadge tone="warning">일시정지</BaseBadge>
          <p class="min-w-0 flex-1 text-caption text-pretty break-keep text-warning">
            진행자가 게임을 멈췄어요. 자리에 멈춰 안내를 기다려 주세요.
          </p>
        </div>

        <div class="flex gap-2 text-caption">
          <span
            class="min-w-0 flex-1 truncate rounded-full bg-scrim-strong px-3 py-2"
            :class="groupTextClass(me?.team)"
          >
            {{ teamLabel }}
          </span>
          <span class="shrink-0 rounded-full bg-scrim-strong px-3 py-2 text-content">
            {{ assignedTeamCount }}팀 참가
          </span>
        </div>

        <BaseButton
          variant="hud"
          size="content"
          padding="compact"
          class="notice-button w-full justify-start overflow-hidden py-3 text-left"
          :aria-expanded="noticeExpanded"
          aria-controls="cockpit-notice"
          @click="toggleNotice"
        >
          <span
            class="flex w-full min-w-0 gap-2"
            :class="noticeExpanded ? 'items-start' : 'items-center'"
          >
            <span class="shrink-0 text-caption text-warning">공지</span>
            <span ref="noticeViewportRef" class="min-w-0 flex-1 overflow-hidden">
              <span
                id="cockpit-notice"
                ref="noticeTextRef"
                class="block text-caption text-content"
                :class="
                  noticeExpanded
                    ? 'wrap-anywhere whitespace-pre-wrap'
                    : [
                        'whitespace-nowrap',
                        noticeIsOverflowing &&
                          (noticeResumeImmediately
                            ? 'notice-marquee-resumed'
                            : 'notice-marquee'),
                      ]
                "
                :style="noticeIsOverflowing ? noticeMarqueeStyle : undefined"
                @animationiteration="handleNoticeAnimationIteration"
              >
                {{ latestNotice?.text ?? '새로운 공지가 없습니다.' }}
              </span>
            </span>
            <svg
              aria-hidden="true"
              class="ml-auto size-4 shrink-0 transition-transform duration-200"
              :class="noticeExpanded && 'rotate-180'"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="m4 6 4 4 4-4"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
        </BaseButton>
      </header>

      <div
        class="pointer-events-none absolute inset-0 z-(--pr-z-hud) flex items-center justify-center"
        aria-hidden="true"
      >
        <div class="target-reticle relative size-12 rounded-full border border-content"></div>
      </div>

      <div class="absolute inset-x-0 bottom-0 z-(--pr-z-hud) pb-(--pr-inset-bottom-safe)">
        <p
          v-if="failed"
          role="alert"
          class="mx-5 mb-2 rounded-md bg-scrim-strong px-4 py-2 text-center text-caption text-danger"
        >
          촬영에 실패했습니다. 다시 시도해주세요
        </p>
        <div class="grid grid-cols-[1fr_auto_1fr] items-end gap-5 px-6 pb-5">
          <div
            v-for="(slots, columnIndex) in controlColumns"
            :key="columnIndex"
            class="flex flex-col items-center gap-3"
            :class="columnIndex === 1 && 'col-start-3'"
          >
            <BaseButton
              v-for="slot in slots"
              :key="slot.n"
              variant="hud"
              size="md"
              shape="circle"
              padding="none"
              disabled
              class="min-h-16 w-16 text-caption"
            >
              <span class="flex flex-col items-center leading-tight">
                <span class="font-semibold">{{ slot.n }}</span
                ><span>{{ slot.label }}</span>
              </span>
            </BaseButton>
          </div>
          <BaseButton
            variant="shutter"
            size="lg"
            shape="circle"
            padding="none"
            aria-label="킬샷 촬영"
            class="shutter col-start-2 row-start-1 mb-7 min-h-20 w-20"
            :disabled="isRoundEnded || isPaused"
            @click="shoot"
          >
            <span class="size-14 rounded-full bg-brand"></span>
          </BaseButton>
        </div>
      </div>
    </template>

    <!-- 공격팀 선택은 없다 — 대상 팀 식별은 호스트가 판정 큐에서 수행한다(확정 스펙). -->
    <div v-if="photo" class="absolute inset-0 z-(--pr-z-hud) flex flex-col bg-canvas">
      <div class="px-5 pt-(--pr-inset-top-safe)">
        <div class="pt-5">
          <p class="text-title">킬샷 확인</p>
          <p class="mt-1 text-caption text-content-secondary">
            사진을 확인한 뒤 제출해 주세요. 판정은 호스트가 진행해요.
          </p>
        </div>
      </div>
      <div class="min-h-0 flex-1 px-5 py-5">
        <img
          :src="photo.url"
          alt="방금 촬영한 킬샷"
          class="h-full w-full rounded-lg border border-stroke object-contain"
        />
      </div>
      <!-- 화면 전체가 이미 canvas 서피스라 별도 밴드(bg-elevated) 없이 버튼을 바로 올린다 -->
      <div class="flex flex-col gap-3 px-5 pt-4 pb-[calc(var(--pr-inset-bottom-safe)+1.25rem)]">
        <p v-if="me === null" class="text-center text-caption break-keep text-content-secondary">
          이번 라운드 팀 배정을 확인하는 중이에요. 배정이 확인되면 제출할 수 있어요.
        </p>
        <p
          v-else-if="isRoundEnded"
          class="text-center text-caption break-keep text-content-secondary"
        >
          라운드가 종료되어 제출할 수 없어요. 다시 찍기로 돌아가 주세요.
        </p>
        <p
          v-else-if="isPaused"
          class="text-center text-caption break-keep text-content-secondary"
        >
          일시정지 중이라 제출할 수 없어요. 재개되면 다시 제출해 주세요.
        </p>
        <div class="grid grid-cols-2 gap-3">
          <BaseButton
            variant="ghost"
            size="lg"
            class="w-full"
            :disabled="isSubmitting"
            @click="clear"
          >
            다시 찍기
          </BaseButton>
          <BaseButton
            variant="primary"
            size="lg"
            class="w-full"
            :disabled="me === null || isRoundEnded || isPaused"
            :loading="isSubmitting"
            @click="submitPhoto"
          >
            킬샷 제출
          </BaseButton>
        </div>
      </div>
    </div>

    <div
      v-if="status !== 'active'"
      class="relative flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <p v-if="status === 'requesting'" class="text-body text-content-secondary">
        카메라 권한을 확인하는 중…
      </p>

      <template v-else-if="status === 'denied'">
        <p class="text-body text-content">카메라 권한이 거부되었습니다</p>
        <p class="text-caption text-content-secondary">
          브라우저 설정에서 카메라 권한을 허용한 뒤 다시 시도해주세요
        </p>
        <BaseButton variant="primary" size="md" @click="start">다시 시도</BaseButton>
      </template>

      <template v-else-if="status === 'unavailable'">
        <p class="text-body text-content">사용할 수 있는 카메라를 찾지 못했습니다</p>
        <BaseButton variant="primary" size="md" @click="start">다시 시도</BaseButton>
      </template>

      <template v-else>
        <p class="text-body text-content">카메라를 켜지 못했습니다</p>
        <BaseButton variant="primary" size="md" @click="start">다시 시도</BaseButton>
      </template>
    </div>
  </section>
</template>

<style scoped>
:deep(.notice-button > span:first-child) {
  width: 100%;
}

.notice-marquee {
  animation: notice-marquee var(--notice-marquee-duration) linear infinite;
}

.notice-marquee-resumed {
  animation: notice-marquee-resumed var(--notice-marquee-duration) linear infinite;
}

@keyframes notice-marquee {
  0%,
  10% {
    transform: translateX(0);
  }
  90%,
  100% {
    transform: translateX(var(--notice-marquee-offset));
  }
}

@keyframes notice-marquee-resumed {
  0% {
    transform: translateX(0);
  }
  90%,
  100% {
    transform: translateX(var(--notice-marquee-offset));
  }
}

@media (prefers-reduced-motion: reduce) {
  .notice-marquee,
  .notice-marquee-resumed {
    animation: none;
    text-overflow: ellipsis;
    overflow: hidden;
  }
}

.target-reticle::before,
.target-reticle::after {
  content: '';
  position: absolute;
  background: var(--pr-color-text-primary);
}
.target-reticle::before {
  top: 50%;
  left: -0.5rem;
  width: calc(100% + 1rem);
  height: 1px;
}
.target-reticle::after {
  top: -0.5rem;
  left: 50%;
  width: 1px;
  height: calc(100% + 1rem);
}
.shutter:active > span {
  transform: scale(0.9);
}
</style>
