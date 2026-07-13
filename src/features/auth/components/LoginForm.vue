<script setup lang="ts">
import BaseButton from '@/shared/components/BaseButton.vue'
import BaseInput from '@/shared/components/BaseInput.vue'
import { useLogin } from '../composables/useLogin'

const emit = defineEmits<{
  success: []
}>()

const { form, fieldErrors, submitError, isSubmitting, validateEmail, submit } = useLogin()

async function onSubmit() {
  if (await submit()) emit('success')
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
    <div class="space-y-1.5">
      <BaseInput
        id="login-email"
        v-model="form.email"
        type="email"
        autocomplete="email"
        inputmode="email"
        placeholder="이메일"
        :aria-invalid="!!fieldErrors.email"
        @blur="validateEmail"
      />
      <p v-if="fieldErrors.email" class="text-caption text-danger">{{ fieldErrors.email }}</p>
    </div>

    <div class="space-y-1.5">
      <BaseInput
        id="login-password"
        v-model="form.password"
        type="password"
        autocomplete="current-password"
        placeholder="비밀번호"
        :aria-invalid="!!fieldErrors.password"
      />
      <p v-if="fieldErrors.password" class="text-caption text-danger">{{ fieldErrors.password }}</p>
    </div>

    <p v-if="submitError" class="text-caption text-danger" role="alert">{{ submitError }}</p>

    <BaseButton type="submit" size="md" class="mt-2 w-full" :disabled="isSubmitting">
      {{ isSubmitting ? '로그인 중…' : '로그인' }}
    </BaseButton>
  </form>
</template>
