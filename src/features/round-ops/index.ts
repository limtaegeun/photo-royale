export { default as RoundOpsPage } from './RoundOpsPage.vue'
export { subscribeToLatestNotice, type Notice } from './api/notices'
// 킬샷 제출은 카메라 콕핏이 쓴다 — 컬렉션(submissions)의 소유는 판정 주체인 이 기능이다
export {
  SUBMISSION_PHOTO_MAX_LENGTH,
  SUBMISSION_PHOTO_PREFIX,
  newSubmissionId,
  submissionExists,
  submitKillshot,
  subscribeToMySubmissions,
  // 탈락 알림(P21) — 콕핏이 우리 팀을 잡은 확정 킬샷을 구독한다
  subscribeToHitsOnTeam,
  type KillshotInput,
  type Submission,
  type SubmissionRecord,
} from './api/submissions'
// 킬샷 과열(P20) — 제출과 같은 배치로 쓰는 내 열 문서. 콕핏이 구독해 셔터를 잠근다
export {
  KILLSHOT_HEAT_CAP_SEC,
  KILLSHOT_HEAT_PER_SUBMIT_SEC,
  subscribeToKillshotCooldown,
  type KillshotCooldown,
} from './api/killshotCooldown'
export { useRoundTimer } from './composables/useRoundTimer'
// 상대 시각 표기 — 콕핏 기록 시트(camera)가 기록 탭과 같은 문구("N분 전")로 제출 시각을 보인다
export { formatRelativeTime } from './relativeTime'
