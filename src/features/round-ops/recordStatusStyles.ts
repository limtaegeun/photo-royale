import type { SubmissionStatus } from './api/submissions'

/**
 * 판정 상태의 라벨·배지 톤 단일 소스 — roundStateStyles와 같은 이유(상태 색은 반드시
 * 텍스트 라벨과 병기, 색약 대응)로 기록 리스트와 상세 시트가 같은 값을 쓴다.
 */
export const RECORD_STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: '대기',
  approved: '확정',
  rejected: '반려',
}

/** BaseBadge tone — 상태 라벨과 짝으로만 쓴다 */
export const RECORD_STATUS_TONE: Record<SubmissionStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}
