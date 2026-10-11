<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseBottomSheet from '@/shared/components/BaseBottomSheet.vue'
import BaseButton from '@/shared/components/BaseButton.vue'
import { encodeVenueMapImage } from '../venueMapImage'

/**
 * 행사장 지도 등록 시트(호스트, P08 §2.2) — 진행자가 이미지 파일을 골라 올린다(주소 입력은 없다).
 * 고르는 즉시 브라우저에서 줄여(긴 변 2000px JPEG) 미리보기에 보이고, 저장하면 그 결과를 그대로 올린다 —
 * 미리보기가 곧 참가자 콕핏에 보일 지도다. 쓰기는 스토어(saveMapImage)가, 성공 시 시트를 닫고 토스트를
 * 띄우는 판단은 부모(페이지)가 한다: 실패하면 고른 지도를 남겨 둔 채 시트를 열어 둬야 다시 저장할 수 있다.
 */
interface Props {
  /** 지금 등록된 지도(JPEG 데이터 URL) — 새로 고르기 전까지 미리보기에 보인다 */
  currentImage: string | null
  /** 쓰기 진행 중 — 중복 저장을 막고 버튼에 스피너를 띄운다 */
  saving?: boolean
  /** 저장 실패 안내 — 이미지 고르기 버튼 아래에 보인다 */
  error?: string | null
}

const props = withDefaults(defineProps<Props>(), { saving: false, error: null })

const emit = defineEmits<{
  /** 저장 요청 — 줄여 둔 지도를 넘긴다. 성공/실패 처리와 시트 닫기는 부모가 한다 */
  save: [image: string]
}>()

const open = defineModel<boolean>('open', { default: false })

/** 고른 파일을 읽지 못했을 때 — 손상된 파일, 이미지가 아닌 파일, 해독기로도 못 여는 형식(RAW 등), HEIC 해독기를 받지 못했을 때(오프라인) */
const IMAGE_UNREADABLE_MESSAGE = '이미지를 불러오지 못했어요. 다른 이미지로 다시 골라 주세요.'

const fileInput = ref<HTMLInputElement | null>(null)
/** 새로 고른 지도(줄인 결과) — 저장하기 전까지는 이 시트 안에만 있다 */
const pickedImage = ref<string | null>(null)
/** 고른 파일을 줄이는 중 — 큰 사진은 폰에서 1초 안팎 걸린다 */
const isEncoding = ref(false)
const pickError = ref<string | null>(null)

// 열고 닫을 때마다 비운다 — 고르고 저장하지 않은 지도가 다음에 열 때 남아 있지 않게
watch(open, () => {
  pickedImage.value = null
  pickError.value = null
})

const previewImage = computed(() => pickedImage.value ?? props.currentImage)
const errorMessage = computed(() => pickError.value ?? props.error)

function pickFile() {
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // 같은 파일을 다시 골라도 change가 오도록 비운다
  input.value = ''
  if (!file) return
  isEncoding.value = true
  pickError.value = null
  const encoded = await encodeVenueMapImage(file)
  isEncoding.value = false
  if (encoded === null) {
    pickError.value = IMAGE_UNREADABLE_MESSAGE
    return
  }
  pickedImage.value = encoded
}

/** 새로 고른 지도가 있을 때만 저장한다 — loading은 BaseButton이 이미 클릭을 막는다 */
function save() {
  if (pickedImage.value === null || isEncoding.value || props.saving) return
  emit('save', pickedImage.value)
}
</script>

<template>
  <BaseBottomSheet v-model:open="open" title="행사장 지도">
    <div class="flex flex-col gap-4">
      <!-- 미리보기 — 새로 고른 지도가 있으면 그것, 없으면 지금 등록된 지도(확대·저장 경로 없음) -->
      <img
        v-if="previewImage !== null"
        :src="previewImage"
        alt="행사장 지도 미리보기"
        decoding="async"
        class="max-h-40 w-full rounded-lg border border-stroke bg-surface object-contain"
      />

      <!-- 파일 선택은 보이지 않는 네이티브 입력이 맡고, 보이는 컨트롤은 아래 BaseButton 하나다.
           display:none이 아니라 sr-only로 숨겨야 iOS Safari에서도 click()으로 사진 선택이 열린다.
           HEIC·HEIF는 확장자로 더한다 — HEIC를 이미지로 등록하지 않은 PC(윈도 등)에서도 폰 사진이 목록에 보이게.
           MIME(image/heic)으로 더하지 않는 건 사파리가 accept의 구체 형식에 맞춰 고른 사진을 바꿔 보낸 적이 있어서다 -->
      <input
        ref="fileInput"
        type="file"
        accept="image/*,.heic,.heif"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        @change="onFileChange"
      />

      <div class="flex flex-col gap-2">
        <BaseButton
          variant="neutral"
          size="lg"
          class="w-full"
          :loading="isEncoding"
          :disabled="saving"
          @click="pickFile"
        >
          이미지 고르기
        </BaseButton>
        <p v-if="errorMessage !== null" class="text-caption text-danger" role="alert">
          {{ errorMessage }}
        </p>
        <p class="text-caption text-content-secondary">
          참가자 콕핏의 지도 버튼에 이 이미지가 보여요. 핀치로 확대할 수 있는 큰 이미지가 좋아요.
        </p>
      </div>

      <BaseButton
        variant="primary"
        size="lg"
        class="w-full"
        :disabled="pickedImage === null || isEncoding"
        :loading="saving"
        @click="save"
      >
        저장
      </BaseButton>
    </div>
  </BaseBottomSheet>
</template>
