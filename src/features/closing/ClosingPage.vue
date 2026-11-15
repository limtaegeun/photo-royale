<script setup lang="ts">
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import BaseButton from '@/shared/components/BaseButton.vue'
import { INSTAGRAM_HANDLE, useInstagramTag } from './composables/useInstagramTag'

const route = useRoute()
const router = useRouter()
const { shareTag } = useInstagramTag()

/**
 * '내 방 열어보기'가 가는 곳 — 기획에서 주소를 아직 정하지 않았다. 정해지기 전까지는 방을 만들 수 있는
 * 입장 화면(새로운 방 만들기)으로 보낸다. 바로 방을 만들지 않는 이유: 누르는 순간 실제 방 문서가 생겨,
 * 둘러보려고 누른 사람의 '내가 만든 방' 목록에 빈 방이 쌓인다.
 */
const OPEN_MY_ROOM_ROUTE: RouteLocationRaw = { name: 'entry' }

/**
 * 이용 요금(2026-11-09 결정). 상업용의 로고·배경 바꾸기 안내 문장은 그 기능이 들어간 뒤에 붙인다 —
 * 지금 넣으면 없는 기능을 약속하게 된다.
 */
const PRICING_PLANS = [
  { label: '일반 이용', price: '3,000원' },
  { label: '상업용', price: '30,000원' },
] as const

/** 순위를 다시 보러 대기실로 — 대기실은 이미 본 마무리를 다시 띄우지 않는다(closingShownMarker) */
function backToRoom() {
  router.push({ name: 'waiting-room', params: { roomCode: String(route.params.roomCode) } })
}
</script>

<template>
  <!-- 마무리 페이지 — 마지막 라운드 결과 뒤에 한 번 뜨는 인사. 게임 화면과 같은 다크 테마로 이어 간다.
       영화 엔딩 크레딧처럼 전부 가운데 정렬로 위에서 아래로 읽는다: 인사 → 친구들과 하기 → 맺음·태그 →
       내 방 열어보기. 내 방 열어보기는 하단에 띄우지 않고 맨 끝에 둔다 — 인사를 다 읽은 사람에게만 권한다 -->
  <section
    class="flex flex-1 flex-col bg-canvas px-6 pt-[calc(var(--pr-inset-top-safe)+3rem)] pb-[calc(var(--pr-inset-bottom-safe)+1.5rem)] text-center"
  >
    <div class="flex flex-col items-center gap-10">
      <p class="flex flex-col gap-1">
        <span class="text-caption tracking-widest text-content-tertiary">오늘의 플레이어</span>
        <span class="text-label text-content">여러분 모두</span>
      </p>

      <!-- 인사 — 제목 아래 라임 바는 입장 화면 워드마크의 브랜드 바와 같은 치수다. 제목 폭을 좁히고 앞 구절을
           한 덩어리(nowrap)로 묶어 '오늘 같이 뛰어주셔서 / 감사합니다' 두 줄로 크레딧처럼 쌓는다 -->
      <header class="flex flex-col items-center gap-4">
        <h1 class="max-w-xs text-title break-keep text-content">
          <span class="whitespace-nowrap">오늘 같이 뛰어주셔서</span> 감사합니다
        </h1>
        <div class="h-1 w-24 rounded-full bg-accent" aria-hidden="true"></div>
      </header>

      <div class="flex flex-col gap-4 text-body text-balance break-keep text-content-secondary">
        <p class="font-semibold text-content">어른이 되고 이렇게 뛰어본 거, 얼마 만인가요?</p>
        <p>처음 만난 사람과 짝꿍이 되어 서로 등을 맡기고 숨죽여 숨었다가 찍고 찍히면서 같이 웃었죠.</p>
        <p>
          포토로얄로 드리고 싶었던 건 우승보다, 오랜만에 몸으로 뛰노는 시간, 그리고 낯선 사람과 생기는
          <strong class="font-semibold text-accent">우정</strong>이었어요.
        </p>
      </div>

      <div class="h-px w-8 bg-stroke" aria-hidden="true"></div>

      <section class="flex flex-col gap-4" aria-labelledby="closing-friends-title">
        <h2
          id="closing-friends-title"
          class="text-subheading text-balance break-keep text-content"
        >
          이 게임, 친구들이랑도 할 수 있어요
        </h2>
        <div class="flex flex-col gap-3 text-body text-balance break-keep text-content-secondary">
          <p>
            얼굴과 옷차림을 다 아는 사이라면 완장 없이도 할 수 있어요. 옷차림을 기억해서 찍고 방장이
            사진을 보고 판정하면 돼요.
          </p>
          <p>누구든 방을 열 수 있게 만들어 두었어요. 다음엔 여러분이 방장이 되어보세요.</p>
        </div>
      </section>

      <div class="h-px w-8 bg-stroke" aria-hidden="true"></div>

      <!-- 맺음 — 태그 버튼은 카메라 화면의 셔터(같은 BaseButton shutter 변형)를 그대로 쓰고, 손잡이만 라임 '@'로
           바꿨다. 셔터는 '사진 찍기'로 읽힐 수 있어서 버튼 이름은 아래 태그 문구로 잇고(aria-labelledby),
           누르면 무슨 일이 생기는지 바로 아래에 적는다 -->
      <div class="flex flex-col items-center gap-6">
        <div class="flex flex-col gap-4 text-body text-balance break-keep text-content-secondary">
          <p>응원해주시는 만큼 더 다듬어서 더 재밌는 게임으로 돌아올게요.</p>
          <p>
            오늘 찍은 베스트 샷, #포토로얄 달고
            <span class="font-semibold text-content">@{{ INSTAGRAM_HANDLE }}</span> 태그해서
            올려주세요. 저희가 꼭 찾아볼게요. 😍
          </p>
        </div>
        <div class="flex flex-col items-center gap-2">
          <BaseButton
            variant="shutter"
            size="lg"
            shape="circle"
            padding="none"
            class="min-h-20 w-20"
            aria-labelledby="closing-tag-label"
            aria-describedby="closing-tag-hint"
            @click="shareTag"
          >
            <span
              class="grid size-14 place-items-center rounded-full bg-accent text-subheading text-on-accent"
              aria-hidden="true"
              >@</span
            >
          </BaseButton>
          <p id="closing-tag-label" class="text-label text-content">
            #포토로얄 @{{ INSTAGRAM_HANDLE }}
          </p>
          <p id="closing-tag-hint" class="text-caption break-keep text-content-tertiary">
            셔터를 누르면 태그가 복사되고 인스타그램이 열려요.
          </p>
        </div>
      </div>

      <div class="h-px w-8 bg-stroke" aria-hidden="true"></div>

      <!-- 내 방 열어보기 + 이용 요금 — 맨 끝, 흐름 안에 둔다(하단 고정 아님). 요금은 버튼 바로 아래 한 줄 -->
      <div class="flex w-full flex-col gap-3">
        <BaseButton variant="accent" size="lg" class="w-full" @click="router.push(OPEN_MY_ROOM_ROUTE)">
          내 방 열어보기
        </BaseButton>
        <dl
          class="flex flex-wrap justify-center gap-x-2 text-caption text-content-secondary tabular-nums"
          aria-label="pricing"
        >
          <div
            v-for="plan in PRICING_PLANS"
            :key="plan.label"
            class="flex gap-1 not-first:before:pr-1 not-first:before:text-content-tertiary not-first:before:content-['·']"
          >
            <dt>{{ plan.label }}</dt>
            <dd class="font-semibold text-content">{{ plan.price }}</dd>
          </div>
        </dl>
      </div>

      <BaseButton variant="ghost" size="md" class="w-full" @click="backToRoom">
        대기실로 돌아가기
      </BaseButton>
    </div>
  </section>
</template>
