import { ref } from 'vue'

/** 토스트 톤 — 상태 색과 매핑(BaseToast에서 solid 배경/텍스트로 소비) */
export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export interface ToastItem {
  id: number
  title: string
  description?: string
  tone: ToastTone
  /** ms. 0이면 자동 닫힘 없음(수동 dismiss 전까지 유지) */
  duration: number
}

export interface ToastOptions {
  title: string
  description?: string
  tone?: ToastTone
  duration?: number
}

/**
 * 앱 전역 토스트 큐(모듈 싱글턴). 어느 기능에서든 `useToast().toast(...)`로 발행하고,
 * App 루트에 한 번 마운트한 BaseToastProvider가 이 큐를 구독해 렌더한다.
 */
const toasts = ref<ToastItem[]>([])
let seq = 0

const DEFAULT_DURATION = 4000

export function useToast() {
  function toast(options: ToastOptions): number {
    const id = ++seq
    toasts.value.push({
      id,
      title: options.title,
      description: options.description,
      tone: options.tone ?? 'neutral',
      duration: options.duration ?? DEFAULT_DURATION,
    })
    return id
  }

  function dismiss(id: number): void {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index !== -1) toasts.value.splice(index, 1)
  }

  /** 화면(뷰) 전환 시 이전 화면 맥락의 토스트가 새 화면 위에 남지 않도록 큐를 비운다 */
  function dismissAll(): void {
    toasts.value = []
  }

  return { toasts, toast, dismiss, dismissAll }
}
