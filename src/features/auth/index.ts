// 외부에 공개하는 것만 re-export한다. SignupForm·LoginForm·useSignup·useLogin은 이 기능
// 내부 전용 구현이라 노출하지 않는다(다른 기능이 내부 구현에 결합하는 것을 막는다).
export { default as SignupPage } from './SignupPage.vue'
export { default as LoginPage } from './LoginPage.vue'
export { useAuthStore } from './stores/useAuthStore'
export { authGuard } from './composables/useAuthGuard'
export { fetchMyGender } from './api/profile'
export type { Gender, SignupInput, UserProfile } from './types'
