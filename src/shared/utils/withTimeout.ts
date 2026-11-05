/** withTimeout이 시간 초과로 reject할 때 쓰는 표식 에러 — 진짜 실패(네트워크 거부 등)와 구분한다 */
export class TimeoutError extends Error {}

/**
 * promise가 ms 안에 끝나지 않으면 TimeoutError로 reject하는 경주를 붙인다. Firestore는 연결이 멎으면
 * 읽기·쓰기가 끝나지 않아 스피너가 영원히 돈다. 원래 promise는 계속 진행되고(취소 불가), 연결이
 * 복구되면 그 작업이 그대로 끝난다.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
