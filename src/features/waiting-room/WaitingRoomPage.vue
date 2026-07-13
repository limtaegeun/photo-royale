<script setup lang="ts">
import { storeToRefs } from 'pinia'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import PlayerChip from './components/PlayerChip.vue'
import { useWaitingRoomStore } from './stores/useWaitingRoomStore'

const store = useWaitingRoomStore()
const { roomCode, participants, participantCount, readyCount, isReadyConfirmed } =
  storeToRefs(store)
</script>

<template>
  <!-- P02 대기실 — 다크 테마(기본). 콘텐츠 영역 + 하단 고정 CTA의 세로 레이아웃 -->
  <section class="flex min-h-dvh flex-col bg-canvas px-6 pt-6 pb-(--pr-inset-bottom-safe)">
    <div class="flex-1">
      <!-- 헤더 -->
      <header>
        <h1 class="text-title text-content">대기실</h1>
        <p class="mt-1 text-caption text-content-secondary">준비 전 안전 수칙을 확인합니다</p>
      </header>

      <!-- 룸 정보 카드 -->
      <div class="mt-6 rounded-lg border border-stroke bg-elevated p-5">
        <div class="flex items-center justify-between gap-3">
          <p class="text-display text-content">ROOM {{ roomCode }}</p>
          <BaseBadge tone="info" appearance="outline" size="md">대기 중</BaseBadge>
        </div>
        <p class="mt-2 text-caption text-content-secondary">
          참가자 {{ participantCount }}명 · 준비 {{ readyCount }}명
        </p>
      </div>

      <!-- 입장 명단 -->
      <div class="mt-6">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="text-label text-content">입장 명단 전체</h2>
          <p class="text-caption text-content-secondary">
            {{ participantCount }}명 입장 · {{ readyCount }}명 레디
          </p>
        </div>
        <ul class="mt-3 grid grid-cols-3 gap-2">
          <li v-for="participant in participants" :key="participant.id">
            <PlayerChip
              :name="participant.name"
              :team="participant.team"
              :is-ready="participant.isReady"
            />
          </li>
        </ul>
      </div>

      <!-- 안전 수칙 카드 -->
      <div class="mt-6 rounded-lg border border-stroke bg-elevated p-5">
        <h2 class="text-subheading text-content">안전 수칙 확인</h2>
        <p class="mt-3 text-body text-content-secondary">
          무리한 추격, 도로 진입, 촬영 중 충돌을 피하고 진행자 안내를 우선합니다.
        </p>
        <p class="mt-3 text-label text-warning">
          아래 확인 버튼을 누르면 안전 수칙과 개인 책임에 동의합니다.
        </p>
      </div>
    </div>

    <!-- 하단 고정 CTA -->
    <div class="pt-5 pb-6">
      <BaseButton
        variant="accent"
        size="md"
        class="w-full"
        :disabled="isReadyConfirmed"
        @click="store.confirmReady()"
      >
        {{ isReadyConfirmed ? '준비 완료' : '확인하고 준비 완료' }}
      </BaseButton>
    </div>
  </section>
</template>
