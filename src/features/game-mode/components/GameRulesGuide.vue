<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseAccordion from '@/shared/components/BaseAccordion.vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseSectionHeader from '@/shared/components/BaseSectionHeader.vue'
import { GAME_MODES } from '../registry'
import { BASIC_RULES, FORBIDDEN_ACTIONS, FORBIDDEN_INTRO, RULES_GUIDE_SLOGAN } from '../rulesGuide'
import type { GameModeId, RuleCardIcon } from '../types'

/**
 * 규칙 설명서 화면(노션 ②, 시안 https://claude.ai/artifact/1D6k9gSskzw871SznBuoP8) — 배정 카드 아래로 내리면
 * 보인다. 모든 모드에 공통인 기본 규칙과 이번 라운드 모드 카드 하나를 보인다. 처음 열면 한 줄 요약과 모드 카드가
 * 먼저 보이고, 기본 규칙은 제목만 보인 채 접혀 있다(노션 개발 메모). 금지 행동은 접지 않는다. 문구는 전부 노션
 * 원문 그대로다(rulesGuide.ts·모드 파일의 ruleCard).
 */
interface Props {
  /** 이번 라운드 확정 게임 모드 — 모드 카드가 이 모드 정의로 렌더된다 */
  gameMode: GameModeId
}

const props = defineProps<Props>()

const mode = computed(() => GAME_MODES[props.gameMode])

/**
 * 모드 카드 머리 아이콘의 선 경로(viewBox 24) — 시안 ModeCard의 아이콘 그대로. 노션 원문의 이모지(🎯 🐍 🤝 👑 🏃)
 * 자리다. 열지 않은 모드는 깃발 하나로 둔다
 */
const ICON_PATHS: Record<RuleCardIcon, readonly string[]> = {
  target: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z', 'M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2z'],
  tail: ['M17 2l4 4-4 4', 'M3 11V9a4 4 0 0 1 4-4h14', 'M7 22l-4-4 4-4', 'M21 13v2a4 4 0 0 1-4 4H3'],
  group: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  crown: ['M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z'],
  timer: ['M12 5a8 8 0 1 0 0 16a8 8 0 1 0 0-16z', 'M12 9v4l2 2', 'M9 2h6'],
  flag: ['M4 22V4', 'M4 4h12l-2 4 2 4H4'],
}

/** 기본 규칙 칸 — 번호는 배열 순서대로 1부터 */
const basicRuleItems = BASIC_RULES.map((rule, index) => ({
  value: `basic-${index + 1}`,
  title: rule.title,
  marker: String(index + 1),
}))

/** 펼친 기본 규칙 — 처음엔 전부 접는다 */
const openBasicRules = ref<string[]>([])
</script>

<template>
  <section aria-labelledby="rules-guide-title" class="flex flex-col gap-6">
    <!-- 첫 화면 — 한 줄 요약 + 이번 라운드 모드 카드 -->
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <h2 id="rules-guide-title" class="text-label text-content-tertiary">규칙 설명서</h2>
        <p class="text-title text-balance break-keep text-content">{{ RULES_GUIDE_SLOGAN }}</p>
      </div>

      <!-- 모드 카드(시안 ModeCard) — 머리 띠(아이콘 칸 + 이번 라운드 모드)와 본문(굵은 첫 줄 + 노션 원문 줄) -->
      <BaseCard
        as="article"
        padding="none"
        class="overflow-hidden"
        aria-labelledby="rules-guide-mode-title"
        data-rules-mode-card
      >
        <div class="flex items-center gap-3 bg-surface p-4">
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand text-on-brand"
            aria-hidden="true"
            :data-rules-mode-icon="mode.ruleCard.icon"
          >
            <svg
              class="size-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path v-for="path in ICON_PATHS[mode.ruleCard.icon]" :key="path" :d="path" />
            </svg>
          </span>
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-caption font-semibold text-info">이번 라운드 모드</span>
            <h3 id="rules-guide-mode-title" class="text-subheading text-content">{{ mode.label }}</h3>
          </div>
        </div>
        <div class="flex flex-col gap-2 p-4">
          <p
            v-if="mode.ruleCard.headline !== undefined"
            class="text-subheading font-bold text-pretty break-keep text-content"
            data-rules-mode-headline
          >
            {{ mode.ruleCard.headline }}
          </p>
          <ul class="flex flex-col gap-2">
            <li
              v-for="line in mode.ruleCard.lines"
              :key="line"
              class="text-body text-pretty break-keep text-content-secondary"
            >
              {{ line }}
            </li>
          </ul>
        </div>
      </BaseCard>
    </div>

    <!-- 기본 규칙 — 모든 모드 공통. 제목만 보이고 누르면 펼친다 -->
    <section class="flex flex-col gap-3" data-rules-basic>
      <BaseSectionHeader title="기본 규칙">
        <template #aside>
          <span class="text-caption text-content-tertiary">모든 모드 공통</span>
        </template>
      </BaseSectionHeader>
      <BaseAccordion v-model="openBasicRules" :items="basicRuleItems">
        <template #content="{ index }">
          <ul v-if="BASIC_RULES[index]?.terms" class="flex flex-col gap-3">
            <li
              v-for="entry in BASIC_RULES[index]!.terms"
              :key="entry.term"
              class="flex flex-col items-start gap-1"
            >
              <BaseBadge tone="neutral" appearance="outline" size="sm">{{ entry.term }}</BaseBadge>
              <span class="text-body text-pretty break-keep text-content-secondary">
                {{ entry.description }}
              </span>
            </li>
          </ul>
          <div v-else class="flex flex-col gap-3">
            <!-- 하트 줄(시안 4번) — 하트 수만큼 그리고 옆에 글자를 붙인다 -->
            <div
              v-if="BASIC_RULES[index]?.hearts"
              class="flex items-center gap-1 text-danger"
              data-rules-hearts
            >
              <svg
                v-for="heart in BASIC_RULES[index]!.hearts!.count"
                :key="heart"
                class="size-6"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"
                />
              </svg>
              <span class="text-label">{{ BASIC_RULES[index]!.hearts!.label }}</span>
            </div>
            <!-- 숫자 칸(시안 5번) — 노션 본문의 숫자를 한눈에. 본문 줄은 아래에 그대로 둔다 -->
            <dl v-if="BASIC_RULES[index]?.stats" class="grid grid-cols-3 gap-2" data-rules-stats>
              <div
                v-for="stat in BASIC_RULES[index]!.stats"
                :key="stat.label"
                class="flex flex-col-reverse items-center gap-1 rounded-md bg-surface px-1 py-3"
              >
                <dt class="text-caption text-content-secondary">{{ stat.label }}</dt>
                <dd class="text-subheading font-extrabold tabular-nums text-content">{{ stat.value }}</dd>
              </div>
            </dl>
            <div class="flex flex-col gap-2">
              <p
                v-for="line in BASIC_RULES[index]?.lines ?? []"
                :key="line"
                class="text-body text-pretty break-keep text-content-secondary"
              >
                {{ line }}
              </p>
            </div>
          </div>
        </template>
      </BaseAccordion>
    </section>

    <!-- 이것만은 하지 말아요 — 접지 않고 항상 보인다 -->
    <section class="flex flex-col gap-3" data-rules-forbidden>
      <BaseSectionHeader title="이것만은 하지 말아요" :summary="FORBIDDEN_INTRO" />
      <BaseCard>
        <ul class="flex flex-col gap-3">
          <li
            v-for="action in FORBIDDEN_ACTIONS"
            :key="action"
            class="flex items-center gap-3 text-body break-keep text-content"
          >
            <!-- 노션 원문의 🚫 자리 — 시안의 금지 표식 -->
            <svg
              class="size-5 shrink-0 text-danger"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M5.6 5.6l12.8 12.8" />
            </svg>
            <span class="min-w-0">{{ action }}</span>
          </li>
        </ul>
      </BaseCard>
    </section>
  </section>
</template>
