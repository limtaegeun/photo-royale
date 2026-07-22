<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import PlayerChip from './components/PlayerChip.vue'
import {
  AssignmentBoard,
  RoundAssignmentCard,
  useTeamAssignmentStore,
  type DraftMember,
} from '@/features/team-assignment'
import { useToast } from '@/shared/composables/useToast'
import { normalizeRoomCode, type Participant } from './api/rooms'
import { useWaitingRoomStore } from './stores/useWaitingRoomStore'

const route = useRoute()
const router = useRouter()
const { toast, dismissAll } = useToast()
const store = useWaitingRoomStore()
const {
  roomCode,
  phase,
  room,
  participants,
  participantCount,
  readyCount,
  isReadyConfirmed,
  isConfirmingReady,
  readyError,
  isHost,
  myId,
  gameStatus,
} = storeToRefs(store)

// 호스트 팀 배정 보드 — 드래프트는 로컬 스토어에만 쌓이고 "배정 확정"만 서버에 쓴다
const taStore = useTeamAssignmentStore()
const showAssignmentBoard = ref(false)

/** 참가자 → 배정 드래프트 멤버(배정 로직에 필요한 필드만 추린다) */
function toDraftMember(participant: Participant): DraftMember {
  return {
    id: participant.id,
    name: participant.name,
    gender: participant.gender,
    sameGenderStreak: participant.sameGenderStreak,
    previousPartnerIds: participant.previousPartnerIds,
  }
}

/** 내 참가자 문서 — 게스트 배정 카드 렌더에 쓴다 */
const myParticipant = computed(
  () => participants.value.find((participant) => participant.id === myId.value) ?? null,
)
/** 게스트: 배정이 한 번이라도 확정됐고(assignmentRound>0) 내 완장이 있으면 라운드 배정 카드를 본다 */
const showGuestAssignment = computed(
  () => !isHost.value && (room.value?.assignmentRound ?? 0) > 0 && !!myParticipant.value?.team,
)
/** 같은 완장(팀) 멤버 — 표시용 id·name만 */
const myTeamMembers = computed(() => {
  const team = myParticipant.value?.team
  if (!team) return []
  return participants.value
    .filter((participant) => participant.team === team)
    .map((participant) => ({ id: participant.id, name: participant.name }))
})

/** 게스트 CTA 문구 — 배정 카드 뷰에서는 '준비 완료'(안전 수칙 동의는 배정 전 라운드에서 끝났다) */
const guestCtaLabel = computed(() => {
  if (showGuestAssignment.value) return '준비 완료'
  return isReadyConfirmed.value ? '준비 완료' : '확인하고 준비 완료'
})

/**
 * 팀 배정 시작(호스트) — 참가자·레디 상태를 검증한 뒤 드래프트를 채우고 보드를 연다.
 * 배정 대상은 명단(플레이어)뿐이며, 호스트(진행자)는 플레이어가 아니라 제외된다.
 */
function startAssignment() {
  if (participantCount.value === 0) {
    toast({ title: '참가자가 없어요.', tone: 'danger' })
    return
  }
  if (readyCount.value < participantCount.value) {
    toast({ title: '모든 참가자가 준비를 완료해야 시작할 수 있어요.', tone: 'danger' })
    return
  }
  // 이번에 확정할 차수는 클릭 시점의 assignmentRound + 1로 고정한다 — 이후 다른 탭이
  // 확정해 스냅샷이 올라가도 이 드래프트는 고정된 차수로만 커밋한다(QA N-02)
  taStore.startDraft(
    participants.value.map(toDraftMember),
    (room.value?.assignmentRound ?? 0) + 1,
  )
  // 보드로 전환하기 직전 — 이전 화면(대기실)에서 쌓인 에러 토스트가 보드 위에 겹쳐 남지 않도록 비운다
  dismissAll()
  showAssignmentBoard.value = true
}

/** 확정 완료 — 보드를 닫고 기존 대기실 뷰로 복귀한다(명단에 완장 보더가 반영된다) */
function onAssignmentConfirmed() {
  showAssignmentBoard.value = false
  // 확정 토스트만 남도록 보드 맥락의 잔여 알림(완장 소진 안내 등)을 먼저 정리한다
  dismissAll()
  toast({ title: '팀 배정을 확정했어요.', tone: 'success' })
}

// 보드가 열린 동안 새로 레디한 참가자를 대기열에 합류시킨다(이미 배정/대기 중이면 무시된다)
watch(participants, (list) => {
  if (!showAssignmentBoard.value) return
  for (const participant of list) {
    if (participant.isReady) taStore.addToWaitingPool(toDraftMember(participant))
  }
})

// 입장은 멱등이라 새로고침·재방문에도 안전하다. 이탈 시 구독을 해제하고 드래프트를 비운다.
onMounted(() => {
  store.enter(normalizeRoomCode(String(route.params.roomCode)))
})
onUnmounted(() => {
  store.leave()
  taStore.reset()
})

// 호스트가 시작하면 status 스냅샷으로 전원이 동시에 게임(카메라 콕핏)으로 넘어간다
watch(gameStatus, (status) => {
  if (status === 'playing') {
    router.replace({ name: 'camera' })
  }
})

/** 초대는 링크 복사 단일 채널 — 링크의 ?code=가 입장 화면의 자동 입장으로 이어진다 */
async function copyInviteLink() {
  if (!roomCode.value) return
  const inviteLink = `${window.location.origin}/?code=${roomCode.value}`
  try {
    await navigator.clipboard.writeText(inviteLink)
    toast({ title: '초대 링크를 복사했어요.', tone: 'success' })
  } catch {
    toast({ title: '복사에 실패했어요. 주소를 직접 공유해 주세요.', tone: 'danger' })
  }
}
</script>

<template>
  <!-- P02 대기실 — 다크 테마(기본). 콘텐츠 영역 + 하단 고정 CTA의 세로 레이아웃.
       호스트/게스트는 같은 화면을 쓰고, 호스트에게만 게임 시작 컨트롤이 추가된다.
       높이는 앱 셸(헤더 아래 남는 공간)을 flex-1로 채운다 — min-h-dvh를 쓰면 헤더 높이만큼
       항상 세로 스크롤이 생긴다. 스크롤은 명단이 실제로 넘칠 때만 생기는 게 정상이다 -->
  <!-- 타이틀·설명 헤더는 앱 셸 공용 헤더(AppHeader)가 route meta로 담당한다 -->
  <section class="flex flex-1 flex-col bg-canvas px-6 pt-3 pb-(--pr-inset-bottom-safe)">
    <div class="flex-1">
      <template v-if="phase === 'joined'">
        <!-- 호스트: 팀 배정 보드(대기실 콘텐츠·하단 CTA를 대체) -->
        <AssignmentBoard
          v-if="showAssignmentBoard"
          class="mt-6"
          :room-code="roomCode!"
          @confirmed="onAssignmentConfirmed"
        />

        <!-- 게스트: 배정 확정 후 라운드 배정 카드(룸 카드·명단·안전수칙을 대체) -->
        <RoundAssignmentCard
          v-else-if="showGuestAssignment"
          class="mt-6"
          :round="room!.assignmentRound"
          :armband="myParticipant!.team!"
          :members="myTeamMembers"
          :my-id="myId!"
          :is-x-team="myParticipant!.isXTeam"
        />

        <template v-else>
        <!-- 룸 정보 카드 — 초대 수단(링크 복사)을 상시 노출한다.
             코드는 카드 내 주요 정보(text-heading)로, display(카운트다운용)는 과하다 -->
        <div class="mt-3 rounded-lg border border-stroke bg-elevated p-4">
          <div class="flex items-center justify-between gap-3">
            <p class="text-heading text-content">ROOM {{ roomCode }}</p>
            <BaseBadge tone="info" appearance="outline" size="sm">대기 중</BaseBadge>
          </div>
          <p class="mt-1 text-caption text-content-secondary">
            참가자 {{ participantCount }}명 · 준비 {{ readyCount }}명
          </p>
          <BaseButton variant="ghost" size="md" class="mt-3 w-full" @click="copyInviteLink">
            초대 링크 복사
          </BaseButton>
        </div>

        <!-- 입장 명단 -->
        <div class="mt-6">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-label text-content">입장 명단</h2>
            <p class="text-caption text-content-secondary">
              {{ participantCount }}명 입장 · {{ readyCount }}명 레디
            </p>
          </div>
          <ul v-if="participantCount > 0" class="mt-3 grid grid-cols-3 gap-2">
            <li v-for="participant in participants" :key="participant.id">
              <PlayerChip
                :name="participant.name"
                :team="participant.team"
                :gender="participant.gender"
                :is-ready="participant.isReady"
              />
            </li>
          </ul>
          <p v-else class="mt-3 text-caption text-content-secondary">
            아직 입장한 참가자가 없어요. 초대 링크를 공유해 보세요.
          </p>
        </div>

        <!-- 안전 수칙 카드 — 보조 정보라 라벨+캡션으로 낮춰 CTA·명단에 시선을 양보한다 -->
        <div class="mt-6 rounded-lg border border-stroke bg-elevated p-4">
          <h2 class="text-label text-content">안전 수칙 확인</h2>
          <p class="mt-2 text-caption text-content-secondary">
            무리한 추격, 도로 진입, 촬영 중 충돌을 피하고 진행자 안내를 우선합니다.
          </p>
          <!-- 동의 버튼은 게스트에게만 있으므로 안내문도 게스트에게만 보여준다 -->
          <p v-if="!isHost" class="mt-2 text-caption font-semibold text-warning">
            아래 확인 버튼을 누르면 안전 수칙과 개인 책임에 동의합니다.
          </p>
        </div>
        </template>
      </template>

      <!-- 입장 실패 — 잘못된 초대 코드 또는 네트워크·권한 문제 -->
      <div
        v-else-if="phase === 'not-found' || phase === 'error'"
        class="mt-3 rounded-lg border border-stroke bg-elevated p-5"
      >
        <h2 class="text-subheading text-content">
          {{ phase === 'not-found' ? '방을 찾을 수 없어요' : '입장에 실패했어요' }}
        </h2>
        <p class="mt-3 text-body text-content-secondary">
          {{
            phase === 'not-found'
              ? '초대 코드가 맞는지 확인하고 다시 시도해 주세요.'
              : '네트워크 상태를 확인하고 잠시 후 다시 시도해 주세요.'
          }}
        </p>
        <BaseButton
          variant="primary"
          size="md"
          class="mt-5 w-full"
          @click="router.replace({ name: 'entry' })"
        >
          입장 화면으로
        </BaseButton>
      </div>

      <!-- 참가 등록 중 로딩 -->
      <p v-else class="mt-3 text-body text-content-secondary" role="status">
        대기실에 입장하는 중…
      </p>
    </div>

    <!-- 하단 고정 CTA — 게스트: 안전 수칙 동의/라운드 준비 / 호스트(진행자): 팀 배정 시작.
         배정 보드가 열려 있는 동안엔 보드가 자체 액션을 가지므로 이 CTA를 숨긴다. -->
    <div v-if="phase === 'joined' && !showAssignmentBoard" class="pt-5 pb-6">
      <BaseButton v-if="isHost" variant="accent" size="md" class="w-full" @click="startAssignment">
        팀 배정 시작
      </BaseButton>

      <template v-else>
        <p v-if="readyError" class="mb-2 text-caption text-danger" role="alert">
          {{ readyError }}
        </p>
        <BaseButton
          variant="accent"
          size="md"
          class="w-full"
          :disabled="isReadyConfirmed || isConfirmingReady"
          @click="store.confirmReady()"
        >
          {{ guestCtaLabel }}
        </BaseButton>
      </template>
    </div>
  </section>
</template>
