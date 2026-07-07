<script setup lang="ts">
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseInput from '@/shared/components/BaseInput.vue'
import BaseSegmented from '@/shared/components/BaseSegmented.vue'
import { useSignup } from '../composables/useSignup'
import type { UserProfile } from '../types'

const emit = defineEmits<{
  success: [profile: UserProfile]
}>()

const { form, fieldErrors, submitError, isSubmitting, submit } = useSignup()

const genderOptions = [
  { label: '남', value: 'male' },
  { label: '여', value: 'female' },
]

async function onSubmit() {
  const profile = await submit()
  if (profile) emit('success', profile)
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
    <div class="space-y-1.5">
      <BaseInput
        id="signup-email"
        v-model="form.email"
        type="email"
        autocomplete="email"
        inputmode="email"
        placeholder="이메일"
        :aria-invalid="!!fieldErrors.email"
      />
      <p v-if="fieldErrors.email" class="text-caption text-danger">{{ fieldErrors.email }}</p>
    </div>

    <div class="space-y-1.5">
      <BaseInput
        id="signup-password"
        v-model="form.password"
        type="password"
        autocomplete="new-password"
        placeholder="비밀번호 (6자 이상)"
        :aria-invalid="!!fieldErrors.password"
      />
      <p v-if="fieldErrors.password" class="text-caption text-danger">{{ fieldErrors.password }}</p>
    </div>

    <div class="space-y-1.5">
      <BaseInput
        id="signup-nickname"
        v-model="form.nickname"
        type="text"
        autocomplete="nickname"
        placeholder="닉네임 (게임에서 보일 이름)"
        :aria-invalid="!!fieldErrors.nickname"
      />
      <p v-if="fieldErrors.nickname" class="text-caption text-danger">{{ fieldErrors.nickname }}</p>
    </div>

    <div class="rounded-lg border border-stroke bg-surface p-4">
      <p class="text-caption text-content-secondary">성별</p>
      <BaseSegmented v-model="form.gender" :options="genderOptions" class="mt-2" />
      <p v-if="fieldErrors.gender" class="mt-2 text-caption text-danger">{{ fieldErrors.gender }}</p>
    </div>

    <p v-if="submitError" class="text-caption text-danger" role="alert">{{ submitError }}</p>

    <BaseButton type="submit" size="md" class="mt-2 w-full" :disabled="isSubmitting">
      {{ isSubmitting ? '가입 중…' : '가입하고 시작하기' }}
    </BaseButton>
  </form>
</template>
