<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import BaseBadge from '@/shared/components/BaseBadge.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseCard from '@/shared/components/BaseCard.vue'
import BaseSegmented from '@/shared/components/BaseSegmented.vue'
import BaseListRow from '@/shared/components/BaseListRow.vue'
import { normalizeRoomCode } from '@/features/waiting-room'
import { useToast } from '@/shared/composables/useToast'

/**
 * H04 라운드 운영 — 호스트(진행자)가 게임 시작 후 보는 화면. 호스트는 플레이어가 아니라
 * 진행자이므로 카메라 콕핏이 아니라 이 화면으로 들어온다(대기실의 playing 전이 분기).
 *
 * 현재는 **화면 골격만** 있는 스켈레톤이다. 타이머·올스탑·시간 조정·공지·판정의 실제 동작과
 * 방 문서 구독은 후속 작업에서 붙인다. 그래서 표시값은 예시(EXAMPLE_*)이며, 컨트롤은
 * 눌리면 준비 중임을 토스트로 알린다(조용히 먹는 클릭보다 상태를 분명히 알리는 쪽).
 */

const route = useRoute()
const { toast } = useToast()

/** 운영 중인 방 코드 — 새로고침·딥링크에도 유지되도록 경로 파라미터에서 읽는다 */
const roomCode = computed(() => normalizeRoomCode(String(route.params.roomCode)))

/** 하단 탭 — 판정/기록은 아직 화면이 없어 준비 중 안내만 보여준다 */
const TABS = [
  { label: '운영', value: 'ops' },
  { label: '판정', value: 'judge' },
  { label: '기록', value: 'log' },
] as const

const activeTab = ref<string>('ops')

/** 예시 표시값 — 실제 라운드 상태를 연결하면 사라진다 */
const EXAMPLE_REMAINING = '18:42'
const EXAMPLE_SUMMARY = '라운드 2 · LIVE · 7팀 생존'
const EXAMPLE_PENDING_ADJUST = '대기 변경값: +1분 · 확인 시 모든 참가자에게 반영'

function notifyPreparing() {
  toast({ title: '운영 컨트롤은 다음 단계에서 연결돼요.' })
}
</script>

<template>
  <!-- 타이틀·설명 헤더는 앱 셸 공용 헤더(AppHeader)가 route meta로 담당한다 -->
  <section class="flex flex-1 flex-col bg-canvas px-6 pt-3 pb-(--pr-inset-bottom-safe)">
    <!-- 블록 사이 여백은 mt-* 체인이 아니라 컨테이너 gap으로 준다 -->
    <div class="flex flex-1 flex-col gap-6 pt-3">
      <template v-if="activeTab === 'ops'">
        <!-- 운영 중인 방 + 진행 상태. 방 코드는 받아 적는 값이라 mono + 자간으로 오독을 줄인다 -->
        <div class="flex items-center justify-between gap-3">
          <p class="text-label text-content-secondary">
            ROOM
            <span class="font-mono tracking-widest text-content">{{ roomCode }}</span>
          </p>
          <BaseBadge tone="success" appearance="outline">LIVE</BaseBadge>
        </div>

        <!-- 스켈레톤 고지 — 표시값이 실제 라운드 상태가 아님을 화면에서 분명히 한다 -->
        <p class="text-caption text-warning" role="status">
          운영 기능은 준비 중이에요. 아래 값은 화면 골격을 보여주는 예시입니다.
        </p>

        <!-- 남은 시간 — 이 화면의 주 정보라 가장 큰 위계(hero)로 둔다 -->
        <BaseCard padding="lg">
          <p class="text-hero font-mono tabular-nums text-success">{{ EXAMPLE_REMAINING }}</p>
          <p class="mt-2 text-caption text-content-secondary">{{ EXAMPLE_SUMMARY }}</p>
        </BaseCard>

        <!-- 올스탑 — 일시정지/재개는 동등한 무게의 두 액션이라 2열로 나란히 둔다 -->
        <div class="grid grid-cols-2 gap-3">
          <BaseButton variant="danger" size="lg" @click="notifyPreparing">일시정지</BaseButton>
          <BaseButton variant="accent" size="lg" @click="notifyPreparing">재개</BaseButton>
        </div>

        <!-- 시간 조정 — 증감으로 대기값을 만들고 '반영'으로 참가자에게 커밋하는 구조 -->
        <BaseCard>
          <h2 class="text-label text-content">시간 조정</h2>
          <div class="mt-4 grid grid-cols-3 gap-3">
            <BaseButton variant="ghost" size="md" @click="notifyPreparing">-1분</BaseButton>
            <BaseButton variant="ghost" size="md" @click="notifyPreparing">+1분</BaseButton>
            <BaseButton variant="primary" size="md" @click="notifyPreparing">반영</BaseButton>
          </div>
          <p class="mt-3 text-caption text-content-secondary">{{ EXAMPLE_PENDING_ADJUST }}</p>
        </BaseCard>

        <!-- 진행 명령 리스트 — 행마다 자체 패딩을 갖는 리스트 카드라 padding="none" -->
        <BaseCard padding="none">
          <div class="divide-y divide-stroke">
            <BaseListRow label="공지 전송" caption="보급품 A">
              <template #control>
                <BaseButton variant="ghost" size="sm" @click="notifyPreparing">공지</BaseButton>
              </template>
            </BaseListRow>
            <BaseListRow label="판정 대기" caption="3건">
              <template #control>
                <BaseButton variant="ghost" size="sm" @click="notifyPreparing">판정</BaseButton>
              </template>
            </BaseListRow>
          </div>
        </BaseCard>
      </template>

      <!-- 판정·기록 탭은 화면 자체가 후속 작업이라 자리만 알린다 -->
      <BaseCard v-else padding="lg">
        <h2 class="text-subheading text-content">
          {{ activeTab === 'judge' ? '판정' : '기록' }} 화면 준비 중
        </h2>
        <p class="mt-3 text-body text-content-secondary">
          이 탭은 다음 단계에서 구현돼요. 지금은 운영 탭만 골격이 있습니다.
        </p>
      </BaseCard>
    </div>

    <!-- 하단 고정 탭 — 대기실 CTA 영역과 같은 리듬(pt-6 pb-4 + safe-area 인셋) -->
    <div class="pt-6 pb-4">
      <BaseSegmented v-model="activeTab" :options="[...TABS]" />
    </div>
  </section>
</template>
