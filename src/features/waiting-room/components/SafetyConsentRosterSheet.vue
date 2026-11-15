<script setup lang="ts">
import { computed } from 'vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import { formatClock } from '@/shared/utils/formatClock'
import type { Participant } from '../api/rooms'
import { isSafetyConsentValid } from '../safetyConsent'
import { serverNow } from '../serverClock'

/**
 * 안전 수칙 동의 현황(진행자 전용) — 누가 오늘 동의했고 언제 했는지, 아직 안 한 사람이 누구인지 본다.
 * 아직 안 한 사람을 위에 둔다 — 진행자가 이름을 불러 준비를 재촉할 대상이다.
 * 준비는 라운드마다 풀리지만 동의는 그날 한 번이라, 대기실 명단의 대기/준비 묶음과 따로 본다.
 */
interface Props {
  /** 대기실 명단(호스트 제외) */
  participants: Participant[]
}

const props = defineProps<Props>()

const open = defineModel<boolean>('open', { default: false })

/** 동의한 사람(동의 시각 순)과 아직 안 한 사람(명단 순)으로 나눈다. 어제 동의는 오늘 아직 안 한 것으로 센다 */
const groups = computed(() => {
  const now = serverNow()
  const consented: { id: string; name: string; consentAt: number }[] = []
  const pending: { id: string; name: string }[] = []
  for (const participant of props.participants) {
    const consentAt = participant.safetyConsentAt
    if (consentAt !== null && isSafetyConsentValid(consentAt, now)) {
      consented.push({ id: participant.id, name: participant.name, consentAt })
    } else {
      pending.push({ id: participant.id, name: participant.name })
    }
  }
  consented.sort((a, b) => a.consentAt - b.consentAt)
  return { consented, pending }
})
</script>

<template>
  <BaseBottomSheet
    v-model:open="open"
    title="안전 수칙 동의 현황"
    :description="`${participants.length}명 중 ${groups.consented.length}명이 오늘 동의했어요.`"
  >
    <div class="flex flex-col gap-6">
      <p v-if="participants.length === 0" class="text-caption text-content-secondary">
        아직 입장한 참가자가 없어요.
      </p>

      <section v-if="groups.pending.length > 0" class="flex flex-col gap-2" aria-labelledby="consent-pending-title">
        <h3 id="consent-pending-title" class="text-label text-warning">
          아직 동의 안 함 {{ groups.pending.length }}명
        </h3>
        <ul class="flex flex-col divide-y divide-stroke" aria-labelledby="consent-pending-title">
          <li
            v-for="participant in groups.pending"
            :key="participant.id"
            class="flex min-h-(--pr-size-control-md) items-center justify-between gap-3"
          >
            <span class="min-w-0 truncate text-body text-content">{{ participant.name }}</span>
            <span class="shrink-0 text-caption text-content-tertiary">미동의</span>
          </li>
        </ul>
      </section>

      <section v-if="groups.consented.length > 0" class="flex flex-col gap-2" aria-labelledby="consent-done-title">
        <h3 id="consent-done-title" class="text-label text-success">
          동의 {{ groups.consented.length }}명
        </h3>
        <ul class="flex flex-col divide-y divide-stroke" aria-labelledby="consent-done-title">
          <li
            v-for="participant in groups.consented"
            :key="participant.id"
            class="flex min-h-(--pr-size-control-md) items-center justify-between gap-3"
          >
            <span class="min-w-0 truncate text-body text-content">{{ participant.name }}</span>
            <span class="shrink-0 text-caption text-content-secondary">
              {{ formatClock(participant.consentAt) }} 동의
            </span>
          </li>
        </ul>
      </section>
    </div>
  </BaseBottomSheet>
</template>
