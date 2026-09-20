<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseInput from '@/shared/components/BaseInput.vue'
import { MAP_IMAGE_URL_MAX_LENGTH } from '../mapImageUrl'

/**
 * 행사장 지도 등록 시트(호스트, P08 §2.2 단계 1) — 이미지 URL 하나를 방 문서에 붙인다.
 * 검증·쓰기는 스토어(setMapImageUrl)가, 성공 시 시트를 닫고 토스트를 띄우는 판단은 부모(페이지)가
 * 한다: 실패하면 입력을 남겨 둔 채 시트를 열어 둬야 고쳐서 다시 저장할 수 있다.
 * 이미지 파일 업로드는 없다 — 이미지는 hosting 정적 자산이거나 외부 URL이고 Storage는 쓰지 않는다.
 */
interface Props {
  /** 지금 등록된 지도 URL — 있으면 미리보기를 보이고 입력의 초깃값으로 채운다(바꾸기) */
  currentUrl: string | null
  /** 쓰기 진행 중 — 중복 저장을 막고 버튼에 스피너를 띄운다 */
  saving?: boolean
  /** 형식 오류·저장 실패 안내 — 입력 아래에 보인다 */
  error?: string | null
}

const props = withDefaults(defineProps<Props>(), { saving: false, error: null })

const emit = defineEmits<{
  /** 저장 요청 — 검증·성공/실패 처리와 시트 닫기는 부모가 한다 */
  save: [url: string]
}>()

const open = defineModel<boolean>('open', { default: false })

const url = ref('')

// 열 때 현재 URL로 채워 '바꾸기'가 한 글자부터 다시 치는 일이 되지 않게 하고, 닫을 때 비운다
watch(open, (isOpen) => {
  url.value = isOpen ? (props.currentUrl ?? '') : ''
})

const canSave = computed(() => url.value.trim().length > 0)

/** Enter 제출 경로도 버튼과 같은 게이트를 지난다 — loading은 BaseButton이 이미 클릭을 막는다 */
function submit() {
  if (!canSave.value || props.saving) return
  emit('save', url.value)
}
</script>

<template>
  <BaseBottomSheet v-model:open="open" title="행사장 지도">
    <!-- form이라 모바일 키보드의 '완료/이동'(Enter)으로도 저장된다 -->
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <!-- 지금 등록된 지도 — 무엇을 바꾸는지 보이게 작은 미리보기만 둔다(확대·저장 경로 없음) -->
      <img
        v-if="currentUrl !== null"
        :src="currentUrl"
        alt="행사장 지도 미리보기"
        decoding="async"
        class="max-h-40 w-full rounded-lg border border-stroke bg-surface object-contain"
      />

      <div class="flex flex-col gap-2">
        <BaseInput
          id="map-image-url"
          v-model="url"
          type="url"
          size="lg"
          inputmode="url"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="https://…/map.png"
          :maxlength="MAP_IMAGE_URL_MAX_LENGTH"
          aria-label="행사장 지도 이미지 주소"
          :aria-invalid="error !== null"
          :aria-describedby="error !== null ? 'map-image-url-help map-image-url-error' : 'map-image-url-help'"
        />
        <p v-if="error !== null" id="map-image-url-error" class="text-caption text-danger" role="alert">
          {{ error }}
        </p>
        <p id="map-image-url-help" class="text-caption text-content-secondary">
          참가자 콕핏의 지도 버튼에 이 이미지가 보여요. 핀치로 확대할 수 있는 큰 이미지가 좋아요.
        </p>
      </div>

      <BaseButton
        type="submit"
        variant="primary"
        size="lg"
        class="w-full"
        :disabled="!canSave"
        :loading="saving"
      >
        저장
      </BaseButton>
    </form>
  </BaseBottomSheet>
</template>
