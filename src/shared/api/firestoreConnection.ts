import { disableNetwork, doc, enableNetwork, getDocFromServer, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'

/**
 * 점검에 읽는 문서 — rules가 get을 누구에게나 여는 nicknames의 없는 키다. 밑줄은 닉네임 규칙(한글·영문·숫자)에
 * 맞지 않아 가입으로 생기지 않고, 없는 문서라 응답도 가볍다.
 */
const PROBE_COLLECTION = 'nicknames'
const PROBE_DOC_ID = '__connection_probe__'

let restarting: Promise<void> | null = null

/**
 * 연결을 끊고 새로 연다. 구독은 그대로 남아 새 연결에서 이어 받고, 보내지 못한 쓰기도 다시 나간다.
 * 끊김 신호 없이 죽은 연결은 SDK가 40초 가까이 알아채지 못해서(재 보니 32~42초) 앱이 직접 연다.
 * 겹쳐 불리면 진행 중인 한 번으로 합친다.
 */
export function restartFirestoreNetwork(): Promise<void> {
  restarting ??= disableNetwork(db)
    .then(() => enableNetwork(db))
    .finally(() => {
      restarting = null
    })
  return restarting
}

/**
 * 서버가 지금 답하는가 — 구독과 같은 연결로 문서 하나를 읽어 본다. 답이 오면 내용이나 권한과 상관없이
 * 연결은 살아 있다. 시간 안에 답이 없거나 SDK가 오프라인이라고 하면 false다.
 */
export function isFirestoreReachable(timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    getDocFromServer(doc(db, PROBE_COLLECTION, PROBE_DOC_ID)).then(
      () => {
        clearTimeout(timer)
        resolve(true)
      },
      (error: { code?: string }) => {
        clearTimeout(timer)
        resolve(error.code !== 'unavailable')
      },
    )
  })
}

/**
 * 서버와 다시 맞춰질 때마다 알린다 — 점검 문서를 구독해 두면 연결이 살아나 서버가 이 문서(없는 문서)의 상태를
 * 확인해 줄 때 캐시가 아닌 스냅샷이 온다. 점검처럼 요청을 거듭 보내지 않고도 연결이 실제로 살아난 순간을 안다.
 * 구독은 구독과 같은 연결을 타서, 이 신호가 오면 공지·게임 종료 구독도 다시 받기 시작한 것이다.
 * 오류로 끝난 구독은 SDK가 살리지 않는다 — 그때는 점검이 같은 일을 늦게 대신한다.
 */
export function watchFirestoreSynced(onSynced: () => void): Unsubscribe {
  return onSnapshot(
    doc(db, PROBE_COLLECTION, PROBE_DOC_ID),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!snapshot.metadata.fromCache) onSynced()
    },
    () => {},
  )
}
