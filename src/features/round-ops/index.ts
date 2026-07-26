export { default as RoundOpsPage } from './RoundOpsPage.vue'
export { subscribeToLatestNotice, type Notice } from './api/notices'
// 킬샷 제출은 카메라 콕핏이 쓴다 — 컬렉션(submissions)의 소유는 판정 주체인 이 기능이다
export {
  SUBMISSION_PHOTO_MAX_LENGTH,
  SUBMISSION_PHOTO_PREFIX,
  submitKillshot,
  type KillshotInput,
  type Submission,
} from './api/submissions'
export { useRoundTimer } from './composables/useRoundTimer'
