<script setup lang="ts">
import { computed } from 'vue'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import { GAME_MODES } from '../registry'
import type { GameModeId } from '../types'

interface Props {
  /** 이번 라운드 확정 게임 모드 — 규칙서 배지·목록이 이 모드 정의로 렌더된다 */
  gameMode: GameModeId
  /** 1인 팀 여부 — composition 항목의 variant(2인 1조/1인 팀)를 결정한다 */
  isSolo: boolean
  /** 이번 라운드 그룹 한글 라벨(예: '파랑') — group 항목 문구에 쓴다 */
  groupLabelKo: string
  /** 그룹 텍스트 색 유틸리티 클래스 — group 항목 캡션을 그룹 색으로 강조한다 */
  groupTextClass: string
  /** 특수 완장 X 겸직 여부 — 마지막 항목으로 X 규칙을 덧붙인다 */
  isXTeam: boolean
}

const props = defineProps<Props>()

/** 이번 라운드 모드 정의 — 규칙서 배지 라벨과 규칙 목록의 원본 */
const modeDefinition = computed(() => GAME_MODES[props.gameMode])

/** 규칙서에 실제로 그릴 한 항목 — 번호는 배열 인덱스로 자동 부여한다 */
interface RenderedRule {
  text: string
  caption: string | null
  /** true면 그룹 색으로 강조(그룹 규칙), false면 보조 텍스트 톤 */
  captionColored: boolean
}

/**
 * 모드 정의의 규칙을 라운드 컨텍스트(팀 구성·그룹 색)로 채워 렌더 항목으로 변환한다.
 * composition/group은 props의 배정 컨텍스트로 채우고, static은 정의 문구를 쓴다.
 * X 겸직이면 마지막 항목으로 X 규칙을 덧붙인다 — 번호는 목록 길이에 따라 자동으로 이어진다.
 */
const renderedRules = computed<RenderedRule[]>(() => {
  const items: RenderedRule[] = modeDefinition.value.rules.map((entry) => {
    if (entry.kind === 'composition') {
      return {
        text: props.isSolo ? '1인 팀입니다.' : '팀은 2인 1조입니다.',
        caption: props.isSolo ? '목숨과 포인트가 2배입니다.' : '팀원과 2m 안에서 함께 이동하세요.',
        captionColored: false,
      }
    }
    if (entry.kind === 'group') {
      return {
        text: '그룹은 완장 색깔입니다.',
        caption: `이번 라운드는 ${props.groupLabelKo} 그룹입니다.`,
        captionColored: true,
      }
    }
    return { text: entry.text, caption: entry.caption ?? null, captionColored: false }
  })
  if (props.isXTeam) {
    items.push({
      text: '특수 완장 X — X끼리만 서로 사냥할 수 있습니다.',
      caption: null,
      captionColored: false,
    })
  }
  return items
})
</script>

<template>
  <!-- 규칙서 카드 — 모드 정의(rules)를 배정 컨텍스트로 채워 번호 목록으로 렌더한다 -->
  <div class="rounded-lg border border-stroke bg-elevated p-4">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-label text-content">이번 게임 규칙서</h2>
      <BaseBadge tone="brand" size="sm">{{ modeDefinition.label }}</BaseBadge>
    </div>
    <ol class="mt-3 flex flex-col gap-3">
      <li v-for="(rule, index) in renderedRules" :key="index" class="flex gap-2">
        <span class="text-label font-bold text-content-tertiary">{{ index + 1 }}</span>
        <div>
          <p class="text-body text-content">{{ rule.text }}</p>
          <p
            v-if="rule.caption"
            class="mt-0.5 text-caption"
            :class="rule.captionColored ? [groupTextClass, 'font-semibold'] : 'text-content-secondary'"
          >
            {{ rule.caption }}
          </p>
        </div>
      </li>
    </ol>
  </div>
</template>
