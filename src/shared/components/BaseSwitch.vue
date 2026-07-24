<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

/**
 * on/off 토글 스위치 — Reka Switch primitive(SwitchRoot/SwitchThumb) 기반.
 * role="switch"·aria-checked·키보드 조작은 Reka가 담당하고, 스타일만 시맨틱 유틸리티로 작성한다.
 * 상태는 트랙 색(off=중립 서피스, on=라임 accent) + thumb 위치로 표현한다 — '끔/켬' 글자를 넣지 않는다.
 * 두 개 이상 값 중 택1이면 BaseSegmented를, 단일 boolean on/off면 이 컴포넌트를 쓴다.
 */
interface Props {
  /** 비활성 — 시각적으로 흐려지고 조작이 막힌다 */
  disabled?: boolean
  /**
   * 스크린리더용 접근성 라벨(aria-label). 스위치 옆에 보이는 텍스트 라벨이 이미 있으면
   * 그 문맥을 보강하는 짧은 설명을 넘긴다(예: '특수 완장 X 모듈'). on/off 상태 자체는
   * Reka가 aria-checked로 노출하므로 라벨에 '켬/끔'을 넣지 않는다.
   */
  label?: string
}

withDefaults(defineProps<Props>(), {
  disabled: false,
  label: undefined,
})

// Reka SwitchRoot는 trueValue/falseValue 기본값이 true/false라 boolean v-model이 그대로 물린다
const model = defineModel<boolean>({ default: false })
</script>

<template>
  <!-- 시각 트랙(48×28)은 최소 터치 타겟(48px)보다 낮으므로, 트랙 자신의 ::before로 히트 영역을
       수직 48px까지 확장한다(트랙 폭 48px은 이미 충분). DS 규칙: 시각이 작으면 pseudo로 히트 확장. -->
  <SwitchRoot
    v-model="model"
    :disabled="disabled"
    :aria-label="label"
    class="track relative inline-flex h-7 w-12 shrink-0 items-center rounded-full px-0.5
           border border-stroke-strong bg-surface
           transition-colors duration-100 ease-standard
           data-[state=checked]:border-accent data-[state=checked]:bg-accent
           disabled:cursor-not-allowed disabled:opacity-50
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
  >
    <!-- thumb = 들려 있는 서피스(elevated) 원. 트랙 안 2px 여백에서 오른쪽으로 20px 슬라이드한다
         (트랙 내부폭 44 − thumb 24 = 20 = translate-x-5). border+shadow로 어느 테마·상태에서도 윤곽 확보. -->
    <SwitchThumb
      class="thumb size-6 rounded-full border border-stroke bg-elevated shadow-sm
             transition-transform duration-100 ease-standard
             translate-x-0 data-[state=checked]:translate-x-5"
    />
  </SwitchRoot>
</template>

<style scoped>
/* 히트 영역 수직 확장 — 시각 트랙(28px)보다 큰 48px 탭 타겟을 pseudo로 덧댄다(레이아웃 영향 없음).
   트랙 자신이 버튼이므로 ::before 위의 탭도 토글로 전달된다. */
.track::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: var(--pr-size-tap-minimum);
  transform: translateY(-50%);
}

/* 모션 감축 선호 시 thumb 슬라이드 애니메이션을 끈다(위치 이동 자체는 유지). */
@media (prefers-reduced-motion: reduce) {
  .thumb {
    transition: none;
  }
}
</style>
