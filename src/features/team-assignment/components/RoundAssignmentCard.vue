<script setup lang="ts">
import { computed } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import { GAME_MODES, type GameModeId } from '@/features/game-mode'
import {
  groupBorderClass,
  groupLabelEn,
  groupLabelKo,
  groupSolidBgClass,
  groupTextClass,
} from '../armbandStyles'

interface Props {
  /** 내 완장 알파벳 — 그룹 색은 완장에서 파생 */
  armband: string
  /** 같은 팀 멤버(본인 포함) — isReady는 이번 라운드 준비 여부로, 멤버 행의 상태 배지가 쓴다 */
  members: Array<{ id: string; name: string; isReady: boolean }>
  /** 본인 참가자 id — 멤버 목록에서 '나' 강조에 쓴다 */
  myId: string
  /** 특수 완장 X 겸직 여부 */
  isXTeam: boolean
  /** 이번 라운드 확정 게임 모드 — X 겸직 배지·문구가 이 모드 정의로 정해진다 */
  gameMode: GameModeId
  /**
   * 우리 그룹의 비밀 왕 완장 — 비밀 왕 모드(왕잡기)에서 내가 왕이 아닐 때만 넘긴다. 왕은 같은 그룹에만 알린다
   * (노션 ② 왕잡기 "그룹마다 몰래 왕을 1명 정해요"). 없으면 null
   */
  groupKingArmband?: string | null
}

const props = withDefaults(defineProps<Props>(), { groupKingArmband: null })

const isSolo = computed(() => props.members.length === 1)

// 그룹 색 클래스·라벨은 armbandStyles(단일 소스)에서 파생한다 — 완장이 A~Z 한 글자가 아니면
// (방어) 중립 표기로 흡수된다
const armbandTextClass = computed(() => groupTextClass(props.armband))
const armbandBarClass = computed(() => groupSolidBgClass(props.armband))
const armbandBorderClass = computed(() => groupBorderClass(props.armband))
const armbandLabelKo = computed(() => groupLabelKo(props.armband))
const armbandLabelEn = computed(() => groupLabelEn(props.armband))
/** X 겸직 안내 — 모드가 X에 역할을 주면(왕잡기의 비밀 왕) 그 문구, 아니면 X 모듈 기본 규칙 */
const xTeamCaption = computed(
  () => GAME_MODES[props.gameMode].xTeamCaption ?? 'X끼리만 서로 사냥할 수 있어요',
)
/** X 겸직 배지 — 왕잡기는 X 완장을 차지 않는 비밀 왕이라 '비밀 왕' */
const xTeamBadge = computed(() => GAME_MODES[props.gameMode].xTeamBadge ?? '특수 완장 X')

/** 팀 구성 요약 — 2인 1조 / 1인 팀 */
/**
 * 팀 구성 요약 — 기본 편성은 2인 1조지만, 호스트가 보드에서 멤버를 옮기면 3인 이상 팀도 확정될
 * 수 있다. 그때 '2인 1조'로 표기하면 실제 팀원 수와 어긋나므로 인원수를 그대로 밝힌다.
 */
const compositionLabel = computed(() => {
  if (isSolo.value) return '1인 팀'
  return props.members.length === 2 ? '2인 1조' : `${props.members.length}인 팀`
})
</script>

<template>
  <!-- P03 참가자 배정 카드 — 대기실 안에서 렌더된다. 하단 준비 CTA는 페이지가 담당한다.
       페이지 타이틀('라운드 N 배정')은 앱 셸 헤더(AppHeader)가 담당한다(자체 h1 없음).
       규칙 설명서(노션 ②)는 지도와 함께 페이지가 이 카드 아래에 붙인다.
       완장 히어로 카드 — 위는 완장 요약, 구분선 아래는 팀원별 준비 상태다 -->
  <BaseCard padding="lg" class="flex flex-col gap-4">
    <div class="flex items-center gap-4">
      <!-- 완장 타일: 상단 그룹 색 바 + 중앙 알파벳(그룹 색) -->
      <div
        class="flex size-20 shrink-0 flex-col overflow-hidden rounded-md border border-stroke bg-surface"
        aria-hidden="true"
      >
        <span class="h-2 w-full shrink-0" :class="armbandBarClass"></span>
        <span
          class="flex flex-1 items-center justify-center text-display"
          :class="armbandTextClass"
        >
          {{ armband }}
        </span>
      </div>

      <!-- 완장 설명 -->
      <div class="flex min-w-0 flex-col gap-1">
        <p class="text-heading text-content">{{ armbandLabelKo }} 완장 {{ armband }}</p>
        <p class="text-caption text-content-secondary">
          그룹 {{ armbandLabelEn }} · {{ compositionLabel }}
        </p>
        <!-- 노션 ② 기본 규칙 5 "혼자 남은 팀은 체력과 점수가 2배예요"와 같은 말을 쓴다 -->
        <p v-if="isSolo" class="text-caption font-semibold text-warning">
          1인 팀 · 체력과 점수 2배
        </p>
        <div v-if="isXTeam" class="mt-1 flex flex-col gap-1">
          <BaseBadge tone="warning" size="sm" class="self-start">{{ xTeamBadge }}</BaseBadge>
          <p class="text-caption text-pretty break-keep text-content-secondary">{{ xTeamCaption }}</p>
        </div>
        <div v-else-if="groupKingArmband !== null" class="mt-1 flex flex-col gap-1" data-group-king>
          <BaseBadge tone="warning" size="sm" class="self-start">우리 그룹 왕 · 팀 {{ groupKingArmband }}</BaseBadge>
          <p class="text-caption text-pretty break-keep text-content-secondary">
            다른 그룹에는 비밀이에요. 왕이 잡히면 그룹 전체가 즉시 아웃돼요. 왕을 꼭 지키세요.
          </p>
        </div>
      </div>
    </div>

    <!-- 멤버 목록 — 카드 전체 폭을 써서 닉네임 자리를 남기고, 상태 배지는 오른쪽 끝에 맞춘다.
         닉네임이 길면 이름만 줄이고 (나)는 남긴다 -->
    <ul class="flex flex-col gap-2 border-t border-stroke pt-4">
      <li
        v-for="member in members"
        :key="member.id"
        class="flex items-center gap-3"
        :data-me="member.id === myId"
      >
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <span
            class="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-caption font-bold text-content"
            :class="armbandBorderClass"
            aria-hidden="true"
          >
            {{ member.name.charAt(0) }}
          </span>
          <span
            class="flex min-w-0 text-body"
            :class="member.id === myId ? 'font-bold text-content' : 'text-content-secondary'"
          >
            <span class="truncate">{{ member.name }}</span>
            <span v-if="member.id === myId" class="shrink-0">(나)</span>
          </span>
        </div>
        <BaseBadge
          :tone="member.isReady ? 'success' : 'neutral'"
          size="sm"
          class="shrink-0"
          :data-ready="member.isReady"
        >
          {{ member.isReady ? '준비 완료' : '대기 중' }}
        </BaseBadge>
      </li>
    </ul>
  </BaseCard>
</template>
