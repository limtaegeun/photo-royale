<script setup lang="ts">
import {
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from 'reka-ui'

/**
 * 접고 펴는 목록 — Reka Accordion primitive(AccordionRoot/Item/Header/Trigger/Content) 기반.
 * 버튼 역할·aria-expanded·aria-controls·화살표키 이동은 Reka가 담당하고, 스타일만 시맨틱 유틸리티로 쓴다.
 * 카드 한 장 안에 칸을 구분선으로 나눠 쌓는다. 여러 칸을 함께 펼 수 있다(type="multiple").
 * 펼친 칸의 본문은 #content 슬롯이 그린다 — 칸마다 본문 모양(문단·항목 목록)이 달라서다.
 */
interface AccordionEntry {
  /** 칸 식별값 — 펼친 칸 목록(v-model)의 원소 */
  value: string
  /** 칸 제목 — 접혀 있어도 보이는 한 줄 */
  title: string
  /** 제목 앞 동그라미 표식(번호 등) — 없으면 그리지 않는다 */
  marker?: string
}

interface Props {
  items: AccordionEntry[]
  /** 칸 제목의 heading 레벨 — 바깥 섹션 제목(h2) 아래면 3 */
  headingLevel?: 2 | 3 | 4
}

const props = withDefaults(defineProps<Props>(), { headingLevel: 3 })

defineSlots<{
  content(props: { item: AccordionEntry; index: number }): unknown
}>()

/** 펼친 칸의 value 목록 — 처음엔 전부 접힌다 */
const open = defineModel<string[]>({ default: () => [] })

/** Tailwind 스캐너와 무관한 태그 이름이라 리터럴 맵이 필요 없다 */
const headingTag = `h${props.headingLevel}`
</script>

<template>
  <AccordionRoot
    v-model="open"
    type="multiple"
    class="flex flex-col divide-y divide-stroke overflow-hidden rounded-lg border border-stroke bg-elevated"
  >
    <AccordionItem v-for="(item, index) in items" :key="item.value" :value="item.value">
      <AccordionHeader :as="headingTag">
        <!-- 칸 전체가 터치 영역이다 — 최소 높이는 큰 컨트롤(56px)로 둔다 -->
        <AccordionTrigger
          class="group flex min-h-(--pr-size-control-lg) w-full items-center gap-3 px-4 py-3 text-left
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        >
          <span
            v-if="item.marker !== undefined"
            class="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-label text-content"
            aria-hidden="true"
          >
            {{ item.marker }}
          </span>
          <span class="min-w-0 flex-1 text-body font-semibold text-pretty break-keep text-content">
            {{ item.title }}
          </span>
          <svg
            class="chevron size-5 shrink-0 text-content-tertiary group-data-[state=open]:rotate-180"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionContent class="content overflow-hidden">
        <!-- 본문은 표식(28px) + 간격(12px) 만큼 들여 제목 글자와 줄을 맞춘다 -->
        <div class="px-4 pb-4" :class="item.marker !== undefined ? 'pl-14' : ''">
          <slot name="content" :item="item" :index="index" />
        </div>
      </AccordionContent>
    </AccordionItem>
  </AccordionRoot>
</template>

<style scoped>
.chevron {
  transition: transform var(--pr-duration-fast) var(--pr-easing-standard);
}

/* Reka가 펼친 본문 높이를 --reka-accordion-content-height로 알려 준다 — 높이만 늘였다 줄인다 */
.content[data-state='open'] {
  animation: accordion-open var(--pr-duration-base) var(--pr-easing-decelerate);
}

.content[data-state='closed'] {
  animation: accordion-close var(--pr-duration-fast) var(--pr-easing-standard);
}

@keyframes accordion-open {
  from {
    height: 0;
  }
  to {
    height: var(--reka-accordion-content-height);
  }
}

@keyframes accordion-close {
  from {
    height: var(--reka-accordion-content-height);
  }
  to {
    height: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }

  .content[data-state='open'],
  .content[data-state='closed'] {
    animation: none;
  }
}
</style>
