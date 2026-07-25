<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseSectionHeader from '@/shared/components/BaseSectionHeader.vue'
import PlayerChip from '@/shared/components/PlayerChip.vue'
import { DEFAULT_GAME_MODE } from '@/features/game-mode'
import {
  AssignmentBoard,
  MAX_ASSIGNABLE_MEMBERS,
  RoundAssignmentCard,
  useTeamAssignmentStore,
  type DraftMember,
} from '@/features/team-assignment'
import { useToast } from '@/shared/composables/useToast'
import { useAppHeader } from '@/shared/composables/useAppHeader'
import { normalizeRoomCode, type Participant } from './api/rooms'
import { useWaitingRoomStore } from './stores/useWaitingRoomStore'

const route = useRoute()
const router = useRouter()
const { toast, dismissAll } = useToast()
const { setHeader, clearHeader } = useAppHeader()
const store = useWaitingRoomStore()
const {
  roomCode,
  phase,
  room,
  participants,
  roster,
  myAssignment,
  assignmentRound,
  participantCount,
  readyCount,
  isReadyConfirmed,
  isConfirmingReady,
  readyError,
  isHost,
  isStartingGame,
  startGameError,
  myId,
  gameStatus,
  isRoundStarted,
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

/**
 * 게스트: **이번 라운드에** 배정된 완장이 있을 때만 라운드 배정 카드를 본다(store.myAssignment).
 * 직전 라운드 완장이 문서에 남아 있는 것만으로는 카드를 띄우지 않는다 — 이번 라운드에 대기자로
 * 내려간 참가자가 유령 완장 카드를 보고 팀원 목록까지 오염시키던 문제의 수정.
 */
const showGuestAssignment = computed(() => !isHost.value && myAssignment.value !== null)

/**
 * 게스트 CTA 문구 — 확정된 상태는 어느 뷰에서나 '준비 완료' 하나로 통일하고, 누를 수 있는
 * 상태는 뷰별 행동 문구를 쓴다(배정 카드 뷰는 안전 수칙 동의가 이미 끝났으므로 라운드 준비만).
 * 두 상태가 같은 문구였을 때는 눌린 뒤에도 문구가 그대로여서 반영 여부를 알 수 없었다.
 */
const guestCtaLabel = computed(() => {
  if (isReadyConfirmed.value) return '준비 완료'
  return showGuestAssignment.value ? '라운드 준비 완료' : '확인하고 준비 완료'
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
  // 완장 실물 수(25개 × 2인)를 넘으면 완장을 부여할 수 없어 배정 자체가 성립하지 않는다.
  // 가드가 없으면 armbandForTeamIndex가 throw해 안내 없이 클릭이 먹지 않는다.
  if (participantCount.value > MAX_ASSIGNABLE_MEMBERS) {
    toast({
      title: `배정 가능한 인원은 최대 ${MAX_ASSIGNABLE_MEMBERS}명이에요.`,
      tone: 'danger',
    })
    return
  }
  // 이번에 확정할 차수는 클릭 시점의 assignmentRound + 1로 고정한다 — 이후 다른 탭이
  // 확정해 스냅샷이 올라가도 이 드래프트는 고정된 차수로만 커밋한다(QA N-02).
  // 게임 모드는 직전 확정 모드를 기본값으로 넘긴다 — 호스트는 보드에서 바꿀 수 있다.
  taStore.startDraft(
    participants.value.map(toDraftMember),
    (room.value?.assignmentRound ?? 0) + 1,
    room.value?.gameMode ?? DEFAULT_GAME_MODE,
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

// 앱 셸 헤더 타이틀·설명을 화면 상태에 맞춰 바꾼다 — 보드/카드는 자체 h1을 두지 않고
// 제목을 헤더 한 곳에만 노출한다(이중 타이틀 방지). 기본 대기실 뷰는 라우트 meta로 되돌린다.
watchEffect(() => {
  if (showAssignmentBoard.value) {
    setHeader('배정 편집', '칩을 터치하거나 끌어서 팀을 바꿉니다')
  } else if (showGuestAssignment.value) {
    setHeader(`라운드 ${assignmentRound.value} 배정`, '라운드마다 팀과 완장이 바뀝니다')
  } else {
    clearHeader()
  }
})

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
  // 대기실을 벗어나면 헤더 오버라이드를 비워 다음 라우트가 meta 기본값을 쓰게 한다
  clearHeader()
})

// 호스트가 시작하면 status 스냅샷으로 화면이 넘어가는데, 목적지와 시점이 역할별로 다르다.
//
// 호스트(진행자)는 playing 전이 즉시 라운드 운영 화면으로 간다 — 거기서 '라운드 시작'을 눌러야
// 하므로 더 기다릴 것이 없다. 카메라 콕핏으로 보내면 진행자에게 권한 프롬프트가 뜬다.
//
// 게스트는 **호스트가 라운드를 실제로 시작할 때까지** 대기실(배정 카드)에 머문다. playing만으로
// 넘기면 진행자가 인원을 세고 공지하는 동안 플레이어들은 켜진 뷰파인더만 보며 기다리게 되고,
// 그 사이 배정된 완장·팀원을 다시 확인할 방법도 사라진다.
watch([gameStatus, isRoundStarted], ([status, roundStarted]) => {
  if (status !== 'playing') return
  if (isHost.value) {
    router.replace({ name: 'round-ops', params: { roomCode: roomCode.value } })
    return
  }
  if (roundStarted) {
    router.replace({ name: 'camera', params: { roomCode: roomCode.value } })
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
    <!-- 콘텐츠 영역은 flex 컨테이너여야 한다 — 블록이면 자식(배정 보드)의 flex-1·mt-auto가 죽어
         보드의 액션 영역이 화면 하단에 붙지 않는다. 세 뷰의 상단 여백은 여기서 한 번만 준다 -->
    <div class="flex flex-1 flex-col pt-3">
      <template v-if="phase === 'joined'">
        <!-- 호스트: 팀 배정 보드(대기실 콘텐츠·하단 CTA를 대체) -->
        <AssignmentBoard
          v-if="showAssignmentBoard"
          :room-code="roomCode!"
          @confirmed="onAssignmentConfirmed"
        />

        <!-- 게스트: 배정 확정 후 라운드 배정 카드(룸 카드·명단·안전수칙을 대체) -->
        <RoundAssignmentCard
          v-else-if="showGuestAssignment"
          :armband="myAssignment!.armband"
          :members="myAssignment!.members"
          :my-id="myId!"
          :is-x-team="myAssignment!.isXTeam"
          :game-mode="room!.gameMode"
        />

        <!-- 기본 대기실 뷰 — 블록 사이 여백은 mt-* 체인이 아니라 컨테이너 gap으로 준다
             (조건부 렌더에서 첫 블록의 마진이 남는 문제를 없앤다) -->
        <div v-else class="flex flex-col gap-6">
          <!-- 룸 정보 카드 — 초대 수단(링크 복사)을 상시 노출한다. 인원 수는 아래 명단 헤더가
               담당하므로 이 카드는 코드·상태·초대에만 집중한다(같은 숫자를 두 번 보여주지 않는다).
               코드는 카드 내 주요 정보(text-heading)로, display(카운트다운용)는 과하다 -->
          <BaseCard>
            <div class="flex items-center justify-between gap-3">
              <!-- 방 코드는 받아 적어 입력하는 값이라 mono + 자간으로 0/O·1/I 오독을 줄인다 -->
              <p class="text-heading text-content">
                ROOM <span class="font-mono tracking-widest">{{ roomCode }}</span>
              </p>
              <BaseBadge tone="info" appearance="outline" size="sm">대기 중</BaseBadge>
            </div>
            <BaseButton variant="ghost" size="md" class="mt-4 w-full" @click="copyInviteLink">
              초대 링크 복사
            </BaseButton>
          </BaseCard>

          <!-- 입장 명단 -->
          <div class="flex flex-col gap-3">
            <BaseSectionHeader
              title="입장 명단"
              :summary="`${participantCount}명 입장 · ${readyCount}명 준비`"
            />
            <!-- roster는 이번 라운드 배정이 아닌 완장을 숨긴 명단이다(유령 완장 방지) -->
            <ul v-if="participantCount > 0" class="grid grid-cols-3 gap-2">
              <li v-for="participant in roster" :key="participant.id">
                <PlayerChip
                  :name="participant.name"
                  :team="participant.team"
                  :gender="participant.gender"
                  :is-ready="participant.isReady"
                />
              </li>
            </ul>
            <p v-else class="text-caption text-content-secondary">
              아직 입장한 참가자가 없어요. 초대 링크를 공유해 보세요.
            </p>
          </div>

          <!-- 안전 수칙 카드 — 보조 정보라 라벨+캡션으로 낮춰 CTA·명단에 시선을 양보한다 -->
          <BaseCard>
            <h2 class="text-label text-content">안전 수칙 확인</h2>
            <p class="mt-2 text-caption text-content-secondary">
              무리한 추격, 도로 진입, 촬영 중 충돌을 피하고 진행자 안내를 우선합니다.
            </p>
            <!-- 동의 버튼은 게스트에게만 있으므로 안내문도 게스트에게만 보여준다 -->
            <p v-if="!isHost" class="mt-2 text-caption font-semibold text-warning">
              아래 확인 버튼을 누르면 안전 수칙과 개인 책임에 동의합니다.
            </p>
          </BaseCard>
        </div>
      </template>

      <!-- 입장 실패 — 잘못된 초대 코드 또는 네트워크·권한 문제 -->
      <BaseCard v-else-if="phase === 'not-found' || phase === 'error'" padding="lg">
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
      </BaseCard>

      <!-- 참가 등록 중 로딩 -->
      <p v-else class="text-body text-content-secondary" role="status">대기실에 입장하는 중…</p>
    </div>

    <!-- 하단 고정 CTA — 게스트: 안전 수칙 동의/라운드 준비 / 호스트(진행자): 팀 배정 시작.
         배정 보드가 열려 있는 동안엔 보드가 자체 액션을 가지므로 이 CTA를 숨긴다. -->
    <!-- 하단 여백은 pb-4 + section의 safe-area 인셋으로 만든다(둘을 합쳐 24px 이상 확보).
         버튼 사이 간격도 마진 대신 gap으로 준다 — 에러 문구가 끼어도 리듬이 유지된다 -->
    <div v-if="phase === 'joined' && !showAssignmentBoard" class="flex flex-col gap-3 pt-6 pb-4">
      <!-- 호스트(진행자): 배정 확정 전에는 배정 시작만, 확정 후에는 게임 시작을 주 액션으로
           올려 라운드 루프(배정 → 게임)를 끝까지 진행할 수 있게 한다.
           주 CTA는 lg(56px), 보조로 내려간 재배정은 md(48px)로 높이 차이로 위계를 만든다 -->
      <template v-if="isHost">
        <p v-if="startGameError" class="text-caption text-danger" role="alert">
          {{ startGameError }}
        </p>
        <BaseButton
          v-if="assignmentRound > 0"
          variant="accent"
          size="lg"
          class="w-full"
          :loading="isStartingGame"
          @click="store.startPlaying()"
        >
          게임 시작
        </BaseButton>
        <BaseButton
          :variant="assignmentRound > 0 ? 'ghost' : 'accent'"
          :size="assignmentRound > 0 ? 'md' : 'lg'"
          class="w-full"
          @click="startAssignment"
        >
          {{ assignmentRound > 0 ? `${assignmentRound + 1}차 팀 배정` : '팀 배정 시작' }}
        </BaseButton>
      </template>

      <template v-else>
        <p v-if="readyError" class="text-caption text-danger" role="alert">
          {{ readyError }}
        </p>
        <BaseButton
          variant="accent"
          size="lg"
          class="w-full"
          :loading="isConfirmingReady"
          :disabled="isReadyConfirmed"
          @click="store.confirmReady()"
        >
          {{ guestCtaLabel }}
        </BaseButton>
      </template>
    </div>
  </section>
</template>
