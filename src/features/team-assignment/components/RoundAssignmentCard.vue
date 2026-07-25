<script setup lang="ts">
import { computed } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import { GameModeRulebook, type GameModeId } from '@/features/game-mode'
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
  /** 같은 팀 멤버(본인 포함) */
  members: Array<{ id: string; name: string }>
  /** 본인 참가자 id — 멤버 목록에서 '나' 강조에 쓴다 */
  myId: string
  /** 특수 완장 X 겸직 여부 */
  isXTeam: boolean
  /** 이번 라운드 확정 게임 모드 — 규칙서 배지·목록이 이 모드 정의로 렌더된다 */
  gameMode: GameModeId
}

const props = defineProps<Props>()

const isSolo = computed(() => props.members.length === 1)

// 그룹 색 클래스·라벨은 armbandStyles(단일 소스)에서 파생한다 — 완장이 A~Z 한 글자가 아니면
// (방어) 중립 표기로 흡수된다
const armbandTextClass = computed(() => groupTextClass(props.armband))
const armbandBarClass = computed(() => groupSolidBgClass(props.armband))
const armbandBorderClass = computed(() => groupBorderClass(props.armband))
const armbandLabelKo = computed(() => groupLabelKo(props.armband))
const armbandLabelEn = computed(() => groupLabelEn(props.armband))

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
  <!-- P03 참가자 배정 카드 — 대기실(라이트) 안에서 렌더된다. 하단 준비 CTA는 페이지가 담당한다.
       페이지 타이틀('라운드 N 배정')은 앱 셸 헤더(AppHeader)가 담당한다(자체 h1 없음). -->
  <section class="flex flex-col gap-6">
    <!-- 완장 히어로 카드 -->
    <BaseCard padding="lg" class="flex gap-4">
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
        <p v-if="isSolo" class="text-caption font-semibold text-warning">
          1인 팀 · 목숨과 포인트 2배
        </p>
        <div v-if="isXTeam" class="mt-1 flex flex-col gap-1">
          <BaseBadge tone="warning" size="sm" class="self-start">특수 완장 X</BaseBadge>
          <p class="text-caption text-content-secondary">X끼리만 서로 사냥할 수 있어요</p>
        </div>

        <!-- 멤버 목록 -->
        <ul class="mt-2 flex flex-col gap-2">
          <li
            v-for="member in members"
            :key="member.id"
            class="flex items-center gap-2"
            :data-me="member.id === myId"
          >
            <span
              class="flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-caption font-bold text-content"
              :class="armbandBorderClass"
              aria-hidden="true"
            >
              {{ member.name.charAt(0) }}
            </span>
            <span
              class="truncate text-body"
              :class="member.id === myId ? 'font-bold text-content' : 'text-content-secondary'"
            >
              {{ member.id === myId ? `${member.name}(나)` : member.name }}
            </span>
          </li>
        </ul>
      </div>
    </BaseCard>

    <!-- 규칙서 — 모드별 규칙은 game-mode 기능이 소유하고, 카드는 배정 컨텍스트만 넘긴다 -->
    <GameModeRulebook
      :game-mode="gameMode"
      :is-solo="isSolo"
      :group-label-ko="armbandLabelKo"
      :group-text-class="armbandTextClass"
      :is-x-team="isXTeam"
    />
  </section>
</template>
