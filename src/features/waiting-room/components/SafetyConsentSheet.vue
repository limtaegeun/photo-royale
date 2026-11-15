<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCheckbox from '@/shared/components/BaseCheckbox.vue'
import { formatClock } from '@/shared/utils/formatClock'
import { SAFETY_RULES } from '../safetyConsent'

/**
 * 안전 수칙 동의 시트 — 게스트가 그날 처음 준비 완료를 누르면 이 시트가 먼저 뜬다. 동의 체크를 해야
 * `동의하고 준비 완료`가 눌린다. 닫으면 준비하지 않은 채 대기실로 돌아간다.
 *
 * 이미 동의한 사람이 대기실 안전 수칙 행에서 다시 열면(review) 동의 체크와 준비 버튼 없이 수칙과 동의 시각만 보인다.
 *
 * 동의 체크·버튼은 수칙 아래 흐름 끝에 둔다(하단 고정이 아니다) — 작은 폰에서는 내려 읽어야 체크에 닿는다.
 */
interface Props {
  /** consent: 동의 체크 + 동의하고 준비 완료 / review: 이미 동의한 사람이 다시 볼 때 — 닫기만 */
  mode: 'consent' | 'review'
  /** review에서 보일 내 동의 시각(ms) — 옛 앱으로 준비해 기록이 없으면 null */
  consentAt?: number | null
}

withDefaults(defineProps<Props>(), { consentAt: null })

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  confirm: []
}>()

const isAgreed = ref(false)

// 열 때마다 체크를 비운다 — 지난번에 체크만 하고 닫은 상태가 남아 있으면 다시 열자마자 바로 누를 수 있다
watch(open, (isOpen) => {
  if (isOpen) isAgreed.value = false
})

function confirm() {
  if (!isAgreed.value) return
  emit('confirm')
}
</script>

<template>
  <BaseBottomSheet v-model:open="open" title="뛰기 전에, 이것만은 꼭 약속해요">
    <div class="flex flex-col gap-6" data-testid="safety-consent-sheet">
      <p class="text-body text-pretty break-keep text-content-secondary">
        포토로얄은 오프라인 피지컬 서바이벌이에요. 그래서 오늘 제일 중요한 건 점수보다
        <strong class="font-bold text-content">안전</strong>이에요.
      </p>

      <section class="flex flex-col gap-3" aria-labelledby="safety-rules-title">
        <h3 id="safety-rules-title" class="text-label text-content-secondary">안전 수칙</h3>
        <ul class="flex flex-col gap-2">
          <li
            v-for="rule in SAFETY_RULES"
            :key="rule.key"
            :data-rule="rule.key"
            class="flex items-start gap-3 rounded-md bg-surface p-3"
          >
            <!-- 그림 글자는 뜻을 보태지 않는다 — 낭독기는 문장만 읽는다 -->
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-md bg-elevated text-heading"
              aria-hidden="true"
            >
              {{ rule.emoji }}
            </span>
            <div class="flex min-w-0 flex-col gap-1">
              <p class="text-label break-keep text-content">{{ rule.title }}</p>
              <p class="text-caption break-keep text-content-secondary">{{ rule.detail }}</p>
            </div>
          </li>
        </ul>
      </section>

      <!-- 책임 안내 — 수칙(부탁)과 성격이 달라 경고색 테두리로 떼어 놓는다. 색만으로 말하지 않게 제목을 붙인다 -->
      <section
        class="flex flex-col gap-2 rounded-md border border-warning p-4"
        aria-labelledby="safety-liability-title"
      >
        <h3 id="safety-liability-title" class="text-label text-warning">책임 안내</h3>
        <p class="text-body text-pretty break-keep text-content">
          게임 중 발생한 안전사고에 대한 책임은 본인에게 있습니다.
        </p>
      </section>

      <div v-if="mode === 'consent'" class="flex flex-col gap-3">
        <BaseCheckbox v-model="isAgreed">안전 수칙을 모두 읽었고 위 내용에 동의합니다.</BaseCheckbox>
        <BaseButton variant="accent" size="lg" class="w-full" :disabled="!isAgreed" @click="confirm">
          동의하고 준비 완료
        </BaseButton>
      </div>

      <div v-else class="flex flex-col gap-3">
        <p
          v-if="consentAt !== null"
          class="flex items-center gap-2 text-caption font-semibold text-success"
          role="status"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-4 shrink-0"
            aria-hidden="true"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
          오늘 {{ formatClock(consentAt) }}에 동의했어요
        </p>
        <BaseButton variant="ghost" size="lg" class="w-full" @click="open = false">닫기</BaseButton>
      </div>
    </div>
  </BaseBottomSheet>
</template>
