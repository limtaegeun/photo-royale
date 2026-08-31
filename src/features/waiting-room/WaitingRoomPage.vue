<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseDialog from '@/shared/components/BaseDialog.vue'
import BaseSectionHeader from '@/shared/components/BaseSectionHeader.vue'
import PlayerChip from '@/shared/components/PlayerChip.vue'
import { DEFAULT_GAME_MODE, GAME_MODES } from '@/features/game-mode'
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
import { hasPlayedRound } from './roundPlayMarker'
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
  canStartGame,
  isReadyConfirmed,
  isConfirmingReady,
  readyError,
  isHost,
  isStartingGame,
  startGameError,
  myId,
  gameStatus,
  isRoundLive,
  isRoundOver,
} = storeToRefs(store)

/**
 * 확정된 라운드의 차수·모드 요약 — 배정 확정 전(assignmentRound 0)에는 null이다.
 *
 * **기본값을 표시하지 않는 것이 핵심이다.** room.gameMode는 필드가 없는 방에서 normalizeRoom이
 * DEFAULT_GAME_MODE로 채우므로(rooms.ts), 배정 전에도 값은 '일반전'으로 읽힌다 — 그대로 보여주면
 * 진행자가 고르지도 않은 모드를 확정된 것처럼 알리게 된다. 모드가 실제로 정해지는 시점은
 * 배정 확정(assignmentRound와 gameMode를 원자적으로 커밋)뿐이다.
 *
 * 차수를 모드와 붙여 쓴다 — 하단 CTA가 '다음 차수 배정'이라, 이 줄이 차수를 빼고 모드만 말하면
 * 진행자가 '게임 시작'이 이번 차수 재실행인지 다음 차수인지 구분할 근거를 잃는다.
 */
const confirmedRoundSummary = computed(() => {
  if (assignmentRound.value === 0) return null
  return {
    round: assignmentRound.value,
    modeLabel: GAME_MODES[room.value?.gameMode ?? DEFAULT_GAME_MODE].label,
  }
})

// 호스트 팀 배정 보드 — 드래프트는 로컬 스토어에만 쌓이고 "배정 확정"만 서버에 쓴다
const taStore = useTeamAssignmentStore()
const showAssignmentBoard = ref(false)
/** 같은 차수 재실행 확인 — hasPlayedRound가 true일 때만 연다(requestStartGame 참조) */
const isRestartRoundDialogOpen = ref(false)

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
 * 게스트가 "라운드는 끝났지만 게임은 아직 안 끝난" 구간에 대기실로 나와 있는 상태.
 * 호스트는 playing이면 라운드 운영 화면으로 가므로 이 조건에 걸리지 않는다.
 *
 * `!isRoundLive`가 아니라 `isRoundOver`를 본다 — 게임만 시작하고 라운드는 아직 시작하지 않은
 * 구간(진행자가 인원을 세고 공지하는 동안)에도 라운드는 살아 있지 않아서, 부정으로 가르면
 * 시작도 안 한 라운드를 끝났다고 알린다(I-22).
 */
const isRoundOverAwaitingHost = computed(
  () => !isHost.value && gameStatus.value === 'playing' && isRoundOver.value,
)

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

/**
 * '게임 시작' 클릭 — 이 기기가 이번 차수를 이미 플레이했으면(hasPlayedRound) 즉시 시작하지
 * 않고 재실행 확인 다이얼로그를 연다. 라운드 종료는 status만 waiting으로 되돌리고
 * assignmentRound·전원 레디는 보존하므로, 그대로 다시 누르면 같은 차수가 재실행되며 직전
 * 라운드의 미판정 킬샷이 판정 큐에 부활하고 새 제출·기록이 한 라운드로 뭉친다(서버 rules는
 * 아직 이를 막지 않는다 — 후속 과제). 마커가 없으면(첫 시작이거나 다음 차수로 배정을 새로
 * 확정한 경우) 기존과 동일하게 즉시 시작한다.
 */
function requestStartGame() {
  if (roomCode.value !== null && hasPlayedRound(roomCode.value, assignmentRound.value)) {
    isRestartRoundDialogOpen.value = true
    return
  }
  store.startPlaying()
}

/** 재실행 확인 다이얼로그 — 안전한 경로(다음 차수 배정)를 고르면 기존 팀 배정 시작 경로를 그대로 탄다 */
function goNextAssignment() {
  isRestartRoundDialogOpen.value = false
  startAssignment()
}

/** 재실행 확인 다이얼로그 — 위험을 감수하고 같은 차수를 그대로 다시 시작한다 */
function restartSameRound() {
  isRestartRoundDialogOpen.value = false
  store.startPlaying()
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
//
// 기준은 '라운드가 시작됐다'가 아니라 '뛸 시간이 남았다'다(isRoundLive). 타이머가 0에 닿아도
// round 필드는 호스트가 종료할 때까지 남으므로, 시작 여부만 보면 종료 뒤 콕핏에서 나온 게스트를
// 여기서 즉시 되밀어 낸다. 진행자가 시간을 더하면 이 값이 다시 참이 되어 자동 재진입도 살아난다.
/**
 * 세션 상실 — 다른 기기·탭에서 로그아웃했거나 로그인이 만료되면 이 화면에서 나간다.
 *
 * 이 화면은 방·참가자 구독으로만 살아 있는데, 세션이 끊기면 그 구독이 권한 오류로 죽고 화면에는
 * **마지막 스냅샷이 그대로 남는다.** 참가자는 멀쩡해 보이는 화면에서 `확인하고 준비 완료`를 누르지만
 * 쓰기는 거부되고 안내도 없어, 진행자 명단에는 계속 미준비로 남는다 — 양쪽 다 원인을 모른 채
 * 게임이 지연된다(2026-08-31 실측: 15초 대기·클릭 후에도 무반응, 콘솔에만 permission-denied).
 *
 * 라운드 운영 화면과 같은 기준으로 처리한다(RoundOpsPage의 myId 분기) — 돌아올 목적지를 보존해
 * 로그인 화면으로 보내고, 다시 로그인하면 보던 대기실로 복귀시킨다.
 *
 * 진입 시점의 미인증은 라우트 가드(authGuard)가 `whenReady()`로 인증 복원을 기다린 뒤 이미 걸러낸다.
 * 그래서 여기가 잡는 것은 **화면에 머무는 동안 로그인이 사라지는 전이**뿐이다.
 */
watch(myId, (id) => {
  if (id !== null) return
  router.replace({ name: 'login', query: { redirect: route.fullPath } })
})

watch([gameStatus, isRoundLive], ([status, roundLive]) => {
  // 세션이 사라진 순간과 전이가 같은 tick에 겹치면, 위의 로그인 이동을 이 replace가 덮어쓴다.
  // 그러면 돌아올 목적지(redirect)를 잃어 참가자가 방 코드를 다시 넣어야 한다 —
  // 라운드 운영이 한 watch 안에서 myId를 먼저 보는 것과 같은 기준으로 여기서도 먼저 걸러낸다.
  if (myId.value === null) return
  if (status !== 'playing') return
  if (isHost.value) {
    router.replace({ name: 'round-ops', params: { roomCode: roomCode.value } })
    return
  }
  if (roundLive) {
    router.replace({ name: 'camera', params: { roomCode: roomCode.value } })
  }
})

/**
 * 지난 라운드 기록 보기 — 라운드 종료 후 이번 방의 제출·판정 이력을 확인할 유일한 경로다.
 * 라운드 운영 화면의 기록 탭으로 쿼리(?tab=log)를 붙여 이동한다 — 그 화면은 대기 상태에서도
 * 기록 탭을 열람할 수 있게 바뀐다(round-ops 담당, 이 파일 범위 밖).
 */
function viewPastRecords() {
  if (!roomCode.value) return
  router.push({ name: 'round-ops', params: { roomCode: roomCode.value }, query: { tab: 'log' } })
}

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
    <div class="flex flex-1 flex-col gap-4 pt-3">
      <template v-if="phase === 'joined'">
        <!-- 라운드는 끝났는데 진행자가 아직 게임을 닫지 않은 구간 — 게스트가 콕핏에서 나와
             여기로 돌아오는 유일한 경로다(A-4). 게임 중(playing)인데 대기실에 있는 이유와,
             다음 라운드가 시작되면 화면이 알아서 넘어간다는 것을 같이 알린다.
             배정 카드는 그대로 아래 남아 완장·팀원을 계속 확인할 수 있다. -->
        <BaseCard v-if="isRoundOverAwaitingHost" role="status">
          <div class="flex items-start gap-3">
            <BaseBadge tone="warning">라운드 종료</BaseBadge>
            <p class="min-w-0 flex-1 text-caption text-pretty break-keep text-content-secondary">
              진행자가 게임을 마칠 때까지 기다려 주세요. 다음 라운드가 시작되면 촬영 화면이 자동으로
              열려요.
            </p>
          </div>
        </BaseCard>

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
            <!-- 카드 안 블록 간격도 mt-* 대신 gap으로 준다 — 모드 줄이 조건부라 마진 체인이면
                 배정 전/후로 초대 버튼 위 여백이 달라진다 -->
            <div class="flex flex-col gap-4">
              <!-- 코드·상태·모드는 "이 방의 지금 상태"라 한 덩어리로 묶고 gap-2로 붙인다 -->
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-3">
                  <!-- 방 코드는 받아 적어 입력하는 값이라 mono + 자간으로 0/O·1/I 오독을 줄인다 -->
                  <p class="text-heading text-content">
                    ROOM <span class="font-mono tracking-widest">{{ roomCode }}</span>
                  </p>
                  <BaseBadge tone="info" appearance="outline" size="sm">대기 중</BaseBadge>
                </div>

                <!-- 진행자가 모드를 바꾸지 않으면 직전 라운드 모드가 그대로 반복되므로(배정 보드의
                     기본값), '게임 시작'이 무슨 모드를 켜는지 이 줄에서 확인할 수 있어야 한다.
                     이 줄을 실제로 보는 건 호스트와 **이번 라운드에 배정되지 않은 게스트**다 —
                     배정된 게스트는 이 카드가 RoundAssignmentCard로 대체되므로 보지 못하고,
                     그쪽 규칙서('이번 게임 규칙서')가 모드명을 이미 보여준다(live-qa W-03 실측). -->
                <p v-if="confirmedRoundSummary !== null" class="text-caption text-content-secondary">
                  {{ confirmedRoundSummary.round }}차 라운드 ·
                  <span class="font-semibold text-content">
                    {{ confirmedRoundSummary.modeLabel }}
                  </span>
                </p>
              </div>

              <BaseButton variant="ghost" size="md" class="w-full" @click="copyInviteLink">
                초대 링크 복사
              </BaseButton>
            </div>
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
          :disabled="!canStartGame"
          @click="requestStartGame"
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
        <!-- 라운드 종료 후 기록을 확인할 유일한 경로 — 최소 한 번 배정된 방에서만 의미가 있다 -->
        <BaseButton
          v-if="assignmentRound > 0"
          variant="ghost"
          size="md"
          class="w-full"
          @click="viewPastRecords"
        >
          지난 라운드 기록 보기
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

    <!-- 같은 차수 재실행 확인 — 안전한 경로(다음 배정)를 위에 채운 배경으로, 위험을 감수하는
         경로(그대로 재실행)는 아래에 ghost로 둔다(기존 종료 확인 다이얼로그들과 같은 위계).
         두 버튼의 size는 같게 유지한다 — 높이가 갈리면 위험한 쪽이 오히려 누르기 어려워진다 -->
    <BaseDialog
      v-model:open="isRestartRoundDialogOpen"
      title="이번 차수는 이미 진행했어요"
      description="같은 차수로 다시 시작하면 지난 라운드의 판정하지 않은 킬샷이 판정 큐에 다시 나타나고, 새 기록이 같은 라운드로 합쳐져요."
    >
      <div class="flex flex-col gap-3">
        <BaseButton variant="primary" size="lg" class="w-full" @click="goNextAssignment">
          다음 팀 배정하기
        </BaseButton>
        <BaseButton variant="ghost" size="lg" class="w-full" @click="restartSameRound">
          그대로 다시 시작
        </BaseButton>
      </div>
    </BaseDialog>
  </section>
</template>
