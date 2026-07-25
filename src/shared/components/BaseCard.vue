<script setup lang="ts">
import { computed } from 'vue'
import { Primitive, type PrimitiveProps } from 'reka-ui'

/**
 * Reka `Primitive` 기반 카드 서피스. 화면 배경(bg-canvas) 위에 한 단 올라온 정보 묶음을 담는
 * 최소 컨테이너로, 서피스·보더·radius·패딩만 담당한다(내부 레이아웃은 사용처가 class로 결정).
 * `as`로 <section> 등 의미 있는 태그로 바꿀 수 있다.
 */
interface Props extends PrimitiveProps {
  /**
   * 내부 패딩 — md(16px, 기본) / lg(20px, 히어로성 카드) / none.
   * none은 카드가 행(BaseListRow) 단위로 자체 패딩을 갖는 리스트 카드일 때 쓴다.
   */
  padding?: 'md' | 'lg' | 'none'
}

const props = withDefaults(defineProps<Props>(), {
  as: 'div',
  padding: 'md',
})

/** Tailwind 스캐너 대응 — 완전한 리터럴 클래스명 맵 */
const PADDING_CLASS = {
  md: 'p-4',
  lg: 'p-5',
  none: '',
} as const

const paddingClass = computed(() => PADDING_CLASS[props.padding])
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :data-padding="padding"
    class="rounded-lg border border-stroke bg-elevated"
    :class="paddingClass"
  >
    <slot />
  </Primitive>
</template>
